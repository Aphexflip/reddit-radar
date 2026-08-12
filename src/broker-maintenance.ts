import type { AlpacaEnv } from "./alpaca";
import {
  AlpacaPaperBrokerError,
  alpacaPaperCloseClientOrderId,
  getAlpacaPaperOrder,
  getAlpacaPaperOrderByClientId,
  getAlpacaPaperPosition,
  resolveBrokerMode,
  submitAlpacaPaperOptionClose,
  type AlpacaPaperEnv,
} from "./broker-alpaca-paper";
import {
  applyBrokerCloseOrder,
  applyBrokerEntryOrder,
  beginBrokerClose,
  markBrokerCloseUnknown,
  markBrokerSubmissionUnknown,
  updateBrokerPositionQty,
  type BrokerLedgerRow,
} from "./broker-ledger";
import { getUsMarketClock } from "./market";

interface MaintenanceRow extends BrokerLedgerRow {
  broker_mode: string;
  published_at: string;
  horizon_minutes: number;
}

function plannedExit(row: MaintenanceRow): string {
  return new Date(new Date(row.published_at).getTime() + row.horizon_minutes * 60_000).toISOString();
}

function due(row: MaintenanceRow, nowMs: number): boolean {
  return new Date(plannedExit(row)).getTime() <= nowMs;
}

function errorFields(error: unknown) {
  if (error instanceof AlpacaPaperBrokerError) {
    return { code: error.code, request_id: error.requestId, message: error.message };
  }
  return {
    code: null,
    request_id: null,
    message: error instanceof Error ? error.message : String(error),
  };
}

async function maintenanceRows(env: Env): Promise<MaintenanceRow[]> {
  const result = await env.DB.prepare(`
    SELECT
      po.id, po.prediction_id, po.contract_symbol, po.quantity, po.notional_usd,
      po.status, po.created_at, po.filled_at, po.fill_price,
      po.broker_mode, po.broker_order_id, po.broker_client_order_id, po.broker_status,
      po.broker_close_order_id, po.broker_close_client_order_id, po.broker_close_status,
      po.broker_close_attempts,
      p.published_at, p.horizon_minutes
    FROM paper_orders po
    JOIN predictions p ON p.id = po.prediction_id
    WHERE po.broker_mode = 'alpaca_paper'
      AND po.status IN (
        'broker_submitting','broker_pending','broker_submit_unknown',
        'filled','broker_close_submitting','broker_close_pending',
        'broker_close_unknown','broker_close_failed'
      )
    ORDER BY po.created_at ASC
    LIMIT 100
  `).all<MaintenanceRow>();
  return result.results;
}

async function markCloseFailed(env: Env, rowId: string, message: string, code: string | null, requestId: string | null) {
  await env.DB.prepare(`
    UPDATE paper_orders SET
      status = 'broker_close_failed',
      broker_close_status = 'failed',
      broker_close_request_id = COALESCE(?2, broker_close_request_id),
      broker_error_code = ?3,
      broker_error_message = ?4,
      broker_last_synced_at = ?5
    WHERE id = ?1
  `).bind(rowId, requestId, code, message, new Date().toISOString()).run();
}

async function syncEntry(env: AlpacaPaperEnv, row: MaintenanceRow) {
  try {
    let order = row.broker_order_id
      ? await getAlpacaPaperOrder(env, row.broker_order_id)
      : null;
    if (!order && row.broker_client_order_id) {
      order = await getAlpacaPaperOrderByClientId(env, row.broker_client_order_id);
    }
    if (!order) {
      const message = "No Alpaca PAPER order matched the stored broker/client order ID; duplicate submission remains disabled.";
      await markBrokerSubmissionUnknown(env, row.id, null, message, null);
      return { id: row.id, phase: "entry", status: "broker_submit_unknown", message };
    }
    const applied = await applyBrokerEntryOrder(env, row, order);
    return { id: row.id, phase: "entry", status: applied.status, broker_status: order.status };
  } catch (error) {
    const fields = errorFields(error);
    await markBrokerSubmissionUnknown(env, row.id, fields.code, fields.message, fields.request_id);
    return { id: row.id, phase: "entry", status: "broker_submit_unknown", error: fields.message };
  }
}

async function syncClose(env: AlpacaPaperEnv, row: MaintenanceRow) {
  try {
    let order = row.broker_close_order_id
      ? await getAlpacaPaperOrder(env, row.broker_close_order_id)
      : null;
    if (!order && row.broker_close_client_order_id) {
      order = await getAlpacaPaperOrderByClientId(env, row.broker_close_client_order_id);
    }
    if (!order) {
      const message = "Alpaca PAPER close state is uncertain; no duplicate close is being submitted until the prior client order ID resolves.";
      await markBrokerCloseUnknown(env, row.id, null, message, null);
      return { id: row.id, phase: "close", status: "broker_close_unknown", message };
    }
    const applied = await applyBrokerCloseOrder(env, row, order);
    return { id: row.id, phase: "close", status: applied.status, broker_status: order.status, realized_pnl_usd: applied.realized_pnl_usd };
  } catch (error) {
    const fields = errorFields(error);
    await markBrokerCloseUnknown(env, row.id, fields.code, fields.message, fields.request_id);
    return { id: row.id, phase: "close", status: "broker_close_unknown", error: fields.message };
  }
}

async function startClose(env: AlpacaPaperEnv, row: MaintenanceRow) {
  const attempt = row.broker_close_attempts + 1;
  if (attempt > 3) {
    const message = "Alpaca PAPER close has reached the 3-attempt automatic retry ceiling; position remains risk-visible for operator review.";
    await markCloseFailed(env, row.id, message, "retry_limit", null);
    return { id: row.id, phase: "close", status: "broker_close_failed", message };
  }

  const position = await getAlpacaPaperPosition(env, row.contract_symbol);
  if (!position || position.qty < Math.max(1, row.quantity)) {
    const message = `Expected Alpaca PAPER position ${row.contract_symbol} qty ${row.quantity}, but broker reports ${position?.qty ?? 0}. No synthetic close was booked.`;
    await updateBrokerPositionQty(env, row.id, position?.qty ?? 0);
    await markCloseFailed(env, row.id, message, "position_mismatch", null);
    return { id: row.id, phase: "close", status: "broker_close_failed", message };
  }
  await updateBrokerPositionQty(env, row.id, position.qty);

  const clientOrderId = alpacaPaperCloseClientOrderId(row.id, attempt);
  await beginBrokerClose(env, row.id, plannedExit(row), clientOrderId, attempt);

  try {
    let order = await getAlpacaPaperOrderByClientId(env, clientOrderId);
    if (!order) {
      order = await submitAlpacaPaperOptionClose(env, {
        symbol: row.contract_symbol,
        quantity: row.quantity,
        clientOrderId,
      });
    }
    const applied = await applyBrokerCloseOrder(env, row, order);
    return { id: row.id, phase: "close", status: applied.status, broker_status: order.status, realized_pnl_usd: applied.realized_pnl_usd };
  } catch (error) {
    const fields = errorFields(error);
    // A network/5xx ambiguity must not cause a second sell. The next heartbeat
    // reconciles by client order ID first.
    if (!(error instanceof AlpacaPaperBrokerError) || ![400, 403, 422].includes(error.httpStatus)) {
      await markBrokerCloseUnknown(env, row.id, fields.code, fields.message, fields.request_id);
      return { id: row.id, phase: "close", status: "broker_close_unknown", error: fields.message };
    }
    await markCloseFailed(env, row.id, fields.message, fields.code, fields.request_id);
    return { id: row.id, phase: "close", status: "broker_close_failed", error: fields.message };
  }
}

export async function maintainAlpacaPaperBroker(env: AlpacaEnv) {
  const paperEnv = env as AlpacaPaperEnv;
  const mode = resolveBrokerMode(paperEnv);
  if (mode !== "alpaca_paper") {
    return { enabled: false, broker_mode: mode, rows_seen: 0, results: [] as Array<Record<string, unknown>> };
  }
  if (env.EXECUTION_MODE !== "paper") throw new Error("Alpaca PAPER maintenance requires EXECUTION_MODE=paper");

  const rows = await maintenanceRows(env);
  const nowMs = Date.now();
  const hasDueClose = rows.some((row) => ["filled", "broker_close_failed"].includes(row.status) && due(row, nowMs));
  const marketClock = hasDueClose ? await getUsMarketClock(env) : null;
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    if (["broker_submitting", "broker_pending", "broker_submit_unknown"].includes(row.status)) {
      results.push(await syncEntry(paperEnv, row));
      continue;
    }
    if (["broker_close_submitting", "broker_close_pending", "broker_close_unknown"].includes(row.status)) {
      results.push(await syncClose(paperEnv, row));
      continue;
    }
    if (["filled", "broker_close_failed"].includes(row.status)) {
      try {
        const position = await getAlpacaPaperPosition(paperEnv, row.contract_symbol);
        await updateBrokerPositionQty(env, row.id, position?.qty ?? 0);
      } catch (error) {
        results.push({ id: row.id, phase: "position_sync", status: "error", error: error instanceof Error ? error.message : String(error) });
      }

      if (!due(row, nowMs)) continue;
      if (!marketClock?.is_open) {
        results.push({ id: row.id, phase: "close", status: "deferred_market_closed", planned_exit: plannedExit(row) });
        continue;
      }
      try {
        results.push(await startClose(paperEnv, row));
      } catch (error) {
        const fields = errorFields(error);
        await markCloseFailed(env, row.id, fields.message, fields.code, fields.request_id);
        results.push({ id: row.id, phase: "close", status: "broker_close_failed", error: fields.message });
      }
    }
  }

  return {
    enabled: true,
    broker_mode: "alpaca_paper",
    rows_seen: rows.length,
    market_clock: marketClock,
    entry_filled: results.filter((item) => item.phase === "entry" && item.status === "filled").length,
    close_filled: results.filter((item) => item.phase === "close" && item.status === "closed").length,
    uncertain: results.filter((item) => String(item.status).includes("unknown")).length,
    failed: results.filter((item) => String(item.status).includes("failed")).length,
    results,
    live_trading_enabled: false,
  };
}
