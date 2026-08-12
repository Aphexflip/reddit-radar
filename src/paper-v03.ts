import type { AlpacaEnv } from "./alpaca";
import {
  AlpacaPaperBrokerError,
  alpacaPaperEntryClientOrderId,
  getAlpacaPaperAccount,
  getAlpacaPaperOrder,
  getAlpacaPaperOrderByClientId,
  isDefiniteAlpacaPaperRejection,
  resolveBrokerMode,
  submitAlpacaPaperOptionBuy,
  type AlpacaPaperEnv,
} from "./broker-alpaca-paper";
import {
  applyBrokerEntryOrder,
  attachBrokerAccountSnapshot,
  markBrokerSubmissionStart,
  markBrokerSubmissionUnknown,
  rejectBrokerEntryBeforeOrder,
  type BrokerLedgerRow,
} from "./broker-ledger";
import { executeTieredPaperPredictionV02 } from "./paper-v02";

interface ExecutionRow extends BrokerLedgerRow {
  option_snapshot_id: string;
  limit_price: number;
  broker_mode: string;
  broker_request_id: string | null;
  broker_error_code: string | null;
  broker_error_message: string | null;
}

async function executionRow(env: Env, predictionId: string): Promise<ExecutionRow | null> {
  return env.DB.prepare(`
    SELECT
      id, prediction_id, option_snapshot_id, contract_symbol, quantity, limit_price,
      notional_usd, status, created_at, filled_at, fill_price,
      broker_mode, broker_order_id, broker_client_order_id, broker_status,
      broker_request_id, broker_error_code, broker_error_message,
      broker_close_order_id, broker_close_client_order_id, broker_close_status,
      broker_close_attempts
    FROM paper_orders
    WHERE prediction_id = ?1
    LIMIT 1
  `).bind(predictionId).first<ExecutionRow>();
}

function errorFields(error: unknown) {
  if (error instanceof AlpacaPaperBrokerError) {
    return {
      code: error.code,
      request_id: error.requestId,
      message: error.message,
    };
  }
  return {
    code: null,
    request_id: null,
    message: error instanceof Error ? error.message : String(error),
  };
}

function baseResult(row: ExecutionRow) {
  return {
    already_processed: true,
    mode: "paper",
    broker_mode: row.broker_mode,
    order_id: row.id,
    prediction_id: row.prediction_id,
    contract_symbol: row.contract_symbol,
    debit_usd: row.notional_usd,
    status: row.status,
    reason: row.broker_error_message,
    broker_order_id: row.broker_order_id,
    broker_status: row.broker_status,
    broker_request_id: row.broker_request_id,
    fill_price: row.fill_price,
    live_trading_enabled: false,
  };
}

async function recoverExistingBrokerEntry(env: AlpacaPaperEnv, row: ExecutionRow) {
  if (!["broker_submitting", "broker_pending", "broker_submit_unknown"].includes(row.status)) {
    return baseResult(row);
  }

  try {
    let order = row.broker_order_id
      ? await getAlpacaPaperOrder(env, row.broker_order_id)
      : null;
    if (!order && row.broker_client_order_id) {
      order = await getAlpacaPaperOrderByClientId(env, row.broker_client_order_id);
    }

    if (!order && row.status === "broker_submitting" && row.broker_client_order_id) {
      order = await submitAlpacaPaperOptionBuy(env, {
        symbol: row.contract_symbol,
        quantity: row.quantity,
        limitPrice: row.limit_price,
        clientOrderId: row.broker_client_order_id,
      });
    }

    if (!order) {
      const message = "Alpaca PAPER entry state is uncertain; no matching broker order was found, so Radar will not submit a duplicate automatically.";
      await markBrokerSubmissionUnknown(env, row.id, null, message, null);
      return { ...baseResult(row), status: "broker_submit_unknown", reason: message };
    }

    const applied = await applyBrokerEntryOrder(env, row, order);
    const fresh = await executionRow(env, row.prediction_id);
    return {
      ...(fresh ? baseResult(fresh) : baseResult(row)),
      status: applied.status,
      broker_order_id: order.id,
      broker_status: order.status,
      broker_request_id: order.request_id,
      fill_price: order.filled_avg_price,
    };
  } catch (error) {
    const fields = errorFields(error);
    await markBrokerSubmissionUnknown(env, row.id, fields.code, fields.message, fields.request_id);
    return { ...baseResult(row), status: "broker_submit_unknown", reason: fields.message };
  }
}

export async function executeTieredPaperPredictionV03(env: AlpacaEnv, predictionId: string) {
  if (env.EXECUTION_MODE !== "paper") {
    throw new Error("paper executor is disabled because EXECUTION_MODE is not paper");
  }

  const paperEnv = env as AlpacaPaperEnv;
  const mode = resolveBrokerMode(paperEnv);
  const before = await executionRow(env, predictionId);
  if (before) {
    if (before.broker_mode === "alpaca_paper") {
      return recoverExistingBrokerEntry(paperEnv, before);
    }
    return baseResult(before);
  }

  const localDecision = await executeTieredPaperPredictionV02(env, predictionId);
  if (mode === "local_sim") {
    return { ...localDecision, broker_mode: "local_sim", live_trading_enabled: false };
  }

  const decisionStatus = "status" in localDecision ? String(localDecision.status) : null;
  const orderId = "order_id" in localDecision && localDecision.order_id
    ? String(localDecision.order_id)
    : null;

  if (decisionStatus !== "filled" || !orderId) {
    return { ...localDecision, broker_mode: "alpaca_paper", live_trading_enabled: false };
  }

  let row = await executionRow(env, predictionId);
  if (!row) throw new Error("paper order disappeared before Alpaca PAPER submission");

  const clientOrderId = alpacaPaperEntryClientOrderId(predictionId);
  await markBrokerSubmissionStart(env, row.id, clientOrderId);
  row = (await executionRow(env, predictionId)) ?? row;

  // Preflight happens before any broker order is submitted. A failure here can
  // safely release the local reservation because no external side effect exists.
  let account;
  try {
    account = await getAlpacaPaperAccount(paperEnv);
    await attachBrokerAccountSnapshot(env, row.id, account);
    if (account.status && account.status !== "ACTIVE") {
      await rejectBrokerEntryBeforeOrder(env, row, "broker_preflight_blocked", `Alpaca PAPER account status is ${account.status}.`);
      return { ...localDecision, broker_mode: "alpaca_paper", status: "broker_preflight_blocked", reason: `Alpaca PAPER account status is ${account.status}.`, live_trading_enabled: false };
    }
    if (account.trading_blocked || account.trade_suspended_by_user) {
      await rejectBrokerEntryBeforeOrder(env, row, "broker_preflight_blocked", "Alpaca PAPER account is blocked or trading is suspended.");
      return { ...localDecision, broker_mode: "alpaca_paper", status: "broker_preflight_blocked", reason: "Alpaca PAPER account is blocked or trading is suspended.", live_trading_enabled: false };
    }
    if (account.options_trading_level !== null && account.options_trading_level < 2) {
      await rejectBrokerEntryBeforeOrder(env, row, "broker_preflight_blocked", `Alpaca PAPER options trading level ${account.options_trading_level} cannot buy long options.`);
      return { ...localDecision, broker_mode: "alpaca_paper", status: "broker_preflight_blocked", reason: `Alpaca PAPER options trading level ${account.options_trading_level} cannot buy long options.`, live_trading_enabled: false };
    }
    if (account.options_buying_power !== null && account.options_buying_power + 0.0001 < row.notional_usd) {
      await rejectBrokerEntryBeforeOrder(env, row, "broker_preflight_blocked", `Alpaca PAPER options buying power ${account.options_buying_power.toFixed(2)} is below Radar's reserved ${row.notional_usd.toFixed(2)} debit.`);
      return { ...localDecision, broker_mode: "alpaca_paper", status: "broker_preflight_blocked", reason: "Insufficient Alpaca PAPER options buying power.", live_trading_enabled: false };
    }
  } catch (error) {
    const fields = errorFields(error);
    await rejectBrokerEntryBeforeOrder(env, row, "broker_preflight_error", fields.message, fields.code, fields.request_id);
    return { ...localDecision, broker_mode: "alpaca_paper", status: "broker_preflight_error", reason: fields.message, live_trading_enabled: false };
  }

  try {
    // First recover by client ID. This makes retries safe if a Worker died after
    // Alpaca accepted the order but before D1 persisted the response.
    let brokerOrder = await getAlpacaPaperOrderByClientId(paperEnv, clientOrderId);
    if (!brokerOrder) {
      brokerOrder = await submitAlpacaPaperOptionBuy(paperEnv, {
        symbol: row.contract_symbol,
        quantity: row.quantity,
        limitPrice: row.limit_price,
        clientOrderId,
      });
    }

    const applied = await applyBrokerEntryOrder(env, row, brokerOrder);
    const fresh = await executionRow(env, predictionId);
    return {
      ...localDecision,
      broker_mode: "alpaca_paper",
      status: applied.status,
      broker_order_id: brokerOrder.id,
      broker_status: brokerOrder.status,
      broker_request_id: brokerOrder.request_id,
      broker_fill_price: brokerOrder.filled_avg_price,
      broker_options_buying_power: account.options_buying_power,
      live_trading_enabled: false,
      note: "Order submitted only to Alpaca PAPER. No live Trading API hostname exists in this adapter.",
    };
  } catch (error) {
    const fields = errorFields(error);
    if (isDefiniteAlpacaPaperRejection(error)) {
      await rejectBrokerEntryBeforeOrder(env, row, "broker_rejected", fields.message, fields.code, fields.request_id);
      return {
        ...localDecision,
        broker_mode: "alpaca_paper",
        status: "broker_rejected",
        reason: fields.message,
        broker_request_id: fields.request_id,
        live_trading_enabled: false,
      };
    }

    // Network/5xx/429 failures are ambiguous after submission. Keep the budget
    // reservation and do not auto-submit a second order until reconciliation.
    await markBrokerSubmissionUnknown(env, row.id, fields.code, fields.message, fields.request_id);
    return {
      ...localDecision,
      broker_mode: "alpaca_paper",
      status: "broker_submit_unknown",
      reason: fields.message,
      broker_request_id: fields.request_id,
      live_trading_enabled: false,
    };
  }
}
