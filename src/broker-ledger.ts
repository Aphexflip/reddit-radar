import type { AlpacaPaperAccount, AlpacaPaperOrder } from "./broker-alpaca-paper";

export interface BrokerLedgerRow {
  id: string;
  prediction_id: string;
  contract_symbol: string;
  quantity: number;
  notional_usd: number;
  status: string;
  created_at: string;
  filled_at: string | null;
  fill_price: number | null;
  broker_order_id: string | null;
  broker_client_order_id: string | null;
  broker_status: string | null;
  broker_close_order_id: string | null;
  broker_close_client_order_id: string | null;
  broker_close_status: string | null;
  broker_close_attempts: number;
}

function tradingDate(iso: string): string {
  return iso.slice(0, 10);
}

async function adjustReservedRisk(env: Env, row: BrokerLedgerRow, deltaUsd: number) {
  if (!Number.isFinite(deltaUsd) || Math.abs(deltaUsd) < 0.000001) return;
  const date = tradingDate(row.created_at);
  await env.DB.prepare(`
    UPDATE daily_risk_state SET
      deployed_usd = MAX(0, deployed_usd + ?2),
      open_risk_usd = MAX(0, open_risk_usd + ?2),
      updated_at = CURRENT_TIMESTAMP
    WHERE trading_date = ?1
  `).bind(date, deltaUsd).run();
}

async function updateCycleExecutionStatus(env: Env, orderId: string, status: string, reason: string) {
  await env.DB.prepare(`
    UPDATE paper_cycle_items
    SET execution_status = ?2, execution_reason = ?3
    WHERE paper_order_id = ?1
  `).bind(orderId, status, reason).run();
}

export async function attachBrokerAccountSnapshot(env: Env, rowId: string, account: AlpacaPaperAccount) {
  await env.DB.prepare(`
    UPDATE paper_orders SET
      broker_buying_power = ?2,
      broker_options_buying_power = ?3,
      broker_last_synced_at = ?4
    WHERE id = ?1
  `).bind(
    rowId,
    account.buying_power,
    account.options_buying_power,
    new Date().toISOString(),
  ).run();
}

export async function markBrokerSubmissionStart(
  env: Env,
  rowId: string,
  clientOrderId: string,
) {
  await env.DB.prepare(`
    UPDATE paper_orders SET
      broker_mode = 'alpaca_paper',
      status = 'broker_submitting',
      broker_client_order_id = ?2,
      broker_status = 'submitting',
      broker_last_synced_at = ?3,
      filled_at = NULL,
      fill_price = NULL,
      broker_error_code = NULL,
      broker_error_message = NULL
    WHERE id = ?1
  `).bind(rowId, clientOrderId, new Date().toISOString()).run();
}

export async function markBrokerSubmissionUnknown(
  env: Env,
  rowId: string,
  code: string | null,
  message: string,
  requestId: string | null,
) {
  await env.DB.prepare(`
    UPDATE paper_orders SET
      status = 'broker_submit_unknown',
      broker_status = 'submit_unknown',
      broker_request_id = COALESCE(?2, broker_request_id),
      broker_error_code = ?3,
      broker_error_message = ?4,
      broker_last_synced_at = ?5
    WHERE id = ?1
  `).bind(rowId, requestId, code, message, new Date().toISOString()).run();
  await updateCycleExecutionStatus(env, rowId, "broker_submit_unknown", message);
}

export async function rejectBrokerEntryBeforeOrder(
  env: Env,
  row: BrokerLedgerRow,
  status: string,
  reason: string,
  code: string | null = null,
  requestId: string | null = null,
) {
  await adjustReservedRisk(env, row, -row.notional_usd);
  await env.DB.prepare(`
    UPDATE paper_orders SET
      status = ?2,
      broker_status = ?2,
      broker_request_id = COALESCE(?3, broker_request_id),
      broker_error_code = ?4,
      broker_error_message = ?5,
      broker_last_synced_at = ?6,
      filled_at = NULL,
      fill_price = NULL
    WHERE id = ?1
  `).bind(row.id, status, requestId, code, reason, new Date().toISOString()).run();
  await updateCycleExecutionStatus(env, row.id, status, reason);
}

export async function applyBrokerEntryOrder(
  env: Env,
  row: BrokerLedgerRow,
  order: AlpacaPaperOrder,
) {
  const state = order.status.trim().toLowerCase();
  const now = new Date().toISOString();

  if (state === "filled") {
    if (order.filled_avg_price === null) throw new Error("Alpaca PAPER entry is filled but has no filled_avg_price");
    const actualNotional = order.filled_avg_price * 100 * Math.max(1, row.quantity);
    await adjustReservedRisk(env, row, actualNotional - row.notional_usd);
    await env.DB.prepare(`
      UPDATE paper_orders SET
        status = 'filled',
        broker_order_id = ?2,
        broker_status = ?3,
        broker_request_id = COALESCE(?4, broker_request_id),
        broker_last_synced_at = ?5,
        filled_at = COALESCE(?6, ?5),
        fill_price = ?7,
        notional_usd = ?8,
        broker_error_code = NULL,
        broker_error_message = NULL
      WHERE id = ?1
    `).bind(
      row.id,
      order.id,
      order.status,
      order.request_id,
      now,
      order.filled_at,
      order.filled_avg_price,
      actualNotional,
    ).run();
    await updateCycleExecutionStatus(
      env,
      row.id,
      "filled",
      `Filled by Alpaca PAPER at ${order.filled_avg_price.toFixed(2)} (${order.id}).`,
    );
    return { status: "filled" as const, actual_notional_usd: actualNotional };
  }

  if (["rejected", "canceled", "expired"].includes(state)) {
    await adjustReservedRisk(env, row, -row.notional_usd);
    const storedStatus = state === "rejected" ? "broker_rejected" : `broker_${state}`;
    const reason = `Alpaca PAPER entry ${state}.`;
    await env.DB.prepare(`
      UPDATE paper_orders SET
        status = ?2,
        broker_order_id = ?3,
        broker_status = ?4,
        broker_request_id = COALESCE(?5, broker_request_id),
        broker_last_synced_at = ?6,
        broker_error_message = ?7,
        filled_at = NULL,
        fill_price = NULL
      WHERE id = ?1
    `).bind(row.id, storedStatus, order.id, order.status, order.request_id, now, reason).run();
    await updateCycleExecutionStatus(env, row.id, storedStatus, reason);
    return { status: storedStatus, actual_notional_usd: 0 };
  }

  await env.DB.prepare(`
    UPDATE paper_orders SET
      status = 'broker_pending',
      broker_order_id = ?2,
      broker_status = ?3,
      broker_request_id = COALESCE(?4, broker_request_id),
      broker_last_synced_at = ?5,
      filled_at = NULL,
      fill_price = NULL,
      broker_error_code = NULL,
      broker_error_message = NULL
    WHERE id = ?1
  `).bind(row.id, order.id, order.status, order.request_id, now).run();
  await updateCycleExecutionStatus(
    env,
    row.id,
    "broker_pending",
    `Submitted to Alpaca PAPER; broker status ${order.status}.`,
  );
  return { status: "broker_pending" as const, actual_notional_usd: row.notional_usd };
}

export async function updateBrokerPositionQty(env: Env, rowId: string, qty: number | null) {
  await env.DB.prepare(`
    UPDATE paper_orders SET broker_position_qty = ?2, broker_last_synced_at = ?3
    WHERE id = ?1
  `).bind(rowId, qty, new Date().toISOString()).run();
}

export async function beginBrokerClose(
  env: Env,
  rowId: string,
  targetTime: string,
  clientOrderId: string,
  attempt: number,
) {
  await env.DB.prepare(`
    UPDATE paper_orders SET
      status = 'broker_close_submitting',
      exit_target_time = ?2,
      broker_close_client_order_id = ?3,
      broker_close_status = 'submitting',
      broker_close_attempts = ?4,
      broker_last_synced_at = ?5,
      broker_error_code = NULL,
      broker_error_message = NULL
    WHERE id = ?1 AND broker_mode = 'alpaca_paper' AND status IN ('filled','broker_close_failed')
  `).bind(rowId, targetTime, clientOrderId, attempt, new Date().toISOString()).run();
}

export async function markBrokerCloseUnknown(
  env: Env,
  rowId: string,
  code: string | null,
  message: string,
  requestId: string | null,
) {
  await env.DB.prepare(`
    UPDATE paper_orders SET
      status = 'broker_close_unknown',
      broker_close_status = 'submit_unknown',
      broker_close_request_id = COALESCE(?2, broker_close_request_id),
      broker_error_code = ?3,
      broker_error_message = ?4,
      broker_last_synced_at = ?5
    WHERE id = ?1
  `).bind(rowId, requestId, code, message, new Date().toISOString()).run();
}

export async function applyBrokerCloseOrder(
  env: Env,
  row: BrokerLedgerRow,
  order: AlpacaPaperOrder,
) {
  const state = order.status.trim().toLowerCase();
  const now = new Date().toISOString();

  if (state === "filled") {
    if (order.filled_avg_price === null || row.fill_price === null) {
      throw new Error("Alpaca PAPER close fill is missing an entry or exit fill price");
    }
    const realizedPnlUsd = (order.filled_avg_price - row.fill_price) * 100 * Math.max(1, row.quantity);
    const closedAt = order.filled_at ?? now;
    const closeDate = tradingDate(closedAt);
    await env.DB.prepare(`INSERT OR IGNORE INTO daily_risk_state(trading_date) VALUES(?1)`).bind(closeDate).run();
    await env.DB.prepare(`
      UPDATE paper_orders SET
        status = 'closed',
        closed_at = ?2,
        exit_price = ?3,
        realized_pnl_usd = ?4,
        exit_method = 'alpaca_paper_fill',
        broker_close_order_id = ?5,
        broker_close_status = ?6,
        broker_close_request_id = COALESCE(?7, broker_close_request_id),
        broker_position_qty = 0,
        broker_last_synced_at = ?8,
        broker_error_code = NULL,
        broker_error_message = NULL
      WHERE id = ?1
    `).bind(
      row.id,
      closedAt,
      order.filled_avg_price,
      realizedPnlUsd,
      order.id,
      order.status,
      order.request_id,
      now,
    ).run();
    await env.DB.prepare(`
      UPDATE daily_risk_state SET
        realized_pnl_usd = realized_pnl_usd + ?2,
        updated_at = CURRENT_TIMESTAMP
      WHERE trading_date = ?1
    `).bind(closeDate, realizedPnlUsd).run();
    return { status: "closed" as const, realized_pnl_usd: realizedPnlUsd };
  }

  if (["rejected", "canceled", "expired"].includes(state)) {
    const reason = `Alpaca PAPER close ${state}.`;
    await env.DB.prepare(`
      UPDATE paper_orders SET
        status = 'broker_close_failed',
        broker_close_order_id = ?2,
        broker_close_status = ?3,
        broker_close_request_id = COALESCE(?4, broker_close_request_id),
        broker_error_message = ?5,
        broker_last_synced_at = ?6
      WHERE id = ?1
    `).bind(row.id, order.id, order.status, order.request_id, reason, now).run();
    return { status: "broker_close_failed" as const, realized_pnl_usd: null };
  }

  await env.DB.prepare(`
    UPDATE paper_orders SET
      status = 'broker_close_pending',
      broker_close_order_id = ?2,
      broker_close_status = ?3,
      broker_close_request_id = COALESCE(?4, broker_close_request_id),
      broker_last_synced_at = ?5
    WHERE id = ?1
  `).bind(row.id, order.id, order.status, order.request_id, now).run();
  return { status: "broker_close_pending" as const, realized_pnl_usd: null };
}
