import type { AlpacaEnv } from "./alpaca";

export type BrokerMode = "local_sim" | "alpaca_paper";
export type AlpacaPaperEnv = AlpacaEnv & { BROKER_MODE?: string };

export interface AlpacaPaperAccount {
  id: string | null;
  status: string | null;
  trading_blocked: boolean;
  trade_suspended_by_user: boolean;
  buying_power: number | null;
  options_buying_power: number | null;
  options_approved_level: number | null;
  options_trading_level: number | null;
}

export interface AlpacaPaperOrder {
  id: string;
  client_order_id: string | null;
  symbol: string | null;
  status: string;
  side: string | null;
  type: string | null;
  qty: number | null;
  filled_qty: number | null;
  limit_price: number | null;
  filled_avg_price: number | null;
  submitted_at: string | null;
  filled_at: string | null;
  canceled_at: string | null;
  expired_at: string | null;
  failed_at: string | null;
  request_id: string | null;
}

export interface AlpacaPaperPosition {
  symbol: string;
  qty: number;
  avg_entry_price: number | null;
  market_value: number | null;
  unrealized_pl: number | null;
}

export class AlpacaPaperBrokerError extends Error {
  readonly httpStatus: number;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly payload: unknown;

  constructor(message: string, httpStatus: number, code: string | null, requestId: string | null, payload: unknown) {
    super(message);
    this.name = "AlpacaPaperBrokerError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.requestId = requestId;
    this.payload = payload;
  }
}

const PAPER_BASE_URL = "https://paper-api.alpaca.markets";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function resolveBrokerMode(env: Pick<AlpacaPaperEnv, "BROKER_MODE">): BrokerMode {
  const value = env.BROKER_MODE?.trim().toLowerCase();
  if (!value) return "local_sim";
  if (value === "local_sim" || value === "alpaca_paper") return value;
  throw new Error(`Unsupported BROKER_MODE: ${value}`);
}

export function alpacaPaperEntryClientOrderId(predictionId: string): string {
  return `radar-entry-${predictionId}`.slice(0, 128);
}

export function alpacaPaperCloseClientOrderId(paperOrderId: string, attempt: number): string {
  return `radar-close-${paperOrderId}-${Math.max(1, Math.trunc(attempt))}`.slice(0, 128);
}

export function alpacaPaperOrderState(status: string): "filled" | "rejected" | "pending" {
  const normalized = status.trim().toLowerCase();
  if (normalized === "filled") return "filled";
  if (["rejected", "canceled", "expired"].includes(normalized)) return "rejected";
  return "pending";
}

function authHeaders(env: AlpacaPaperEnv): Headers {
  if (env.EXECUTION_MODE !== "paper") {
    throw new Error("Alpaca broker client is hard-disabled unless EXECUTION_MODE=paper");
  }
  if (!env.ALPACA_API_KEY_ID?.trim() || !env.ALPACA_API_SECRET_KEY?.trim()) {
    throw new Error("Alpaca paper broker credentials are unavailable");
  }
  const headers = new Headers();
  headers.set("APCA-API-KEY-ID", env.ALPACA_API_KEY_ID);
  headers.set("APCA-API-SECRET-KEY", env.ALPACA_API_SECRET_KEY);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  return headers;
}

async function request(
  env: AlpacaPaperEnv,
  path: string,
  init: RequestInit = {},
  allow404 = false,
): Promise<{ payload: unknown; request_id: string | null } | null> {
  const response = await fetch(`${PAPER_BASE_URL}${path}`, {
    ...init,
    headers: authHeaders(env),
  });
  const requestId = response.headers.get("x-request-id");
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = text; }
  }

  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const body = record(payload);
    const code = stringValue(body?.code) ?? (finiteNumber(body?.code)?.toString() ?? null);
    const message = stringValue(body?.message)
      ?? `Alpaca PAPER request failed with HTTP ${response.status} for ${path}`;
    throw new AlpacaPaperBrokerError(message, response.status, code, requestId, payload);
  }
  return { payload, request_id: requestId };
}

function normalizeOrder(payload: unknown, requestId: string | null): AlpacaPaperOrder {
  const body = record(payload);
  const id = stringValue(body?.id);
  const status = stringValue(body?.status);
  if (!id || !status) throw new Error("Alpaca PAPER returned an incomplete order payload");
  return {
    id,
    client_order_id: stringValue(body?.client_order_id),
    symbol: stringValue(body?.symbol),
    status,
    side: stringValue(body?.side),
    type: stringValue(body?.type),
    qty: finiteNumber(body?.qty),
    filled_qty: finiteNumber(body?.filled_qty),
    limit_price: finiteNumber(body?.limit_price),
    filled_avg_price: finiteNumber(body?.filled_avg_price),
    submitted_at: stringValue(body?.submitted_at),
    filled_at: stringValue(body?.filled_at),
    canceled_at: stringValue(body?.canceled_at),
    expired_at: stringValue(body?.expired_at),
    failed_at: stringValue(body?.failed_at),
    request_id: requestId,
  };
}

export async function getAlpacaPaperAccount(env: AlpacaPaperEnv): Promise<AlpacaPaperAccount> {
  const result = await request(env, "/v2/account");
  if (!result) throw new Error("Alpaca PAPER account request unexpectedly returned no result");
  const body = record(result.payload);
  if (!body) throw new Error("Alpaca PAPER returned an invalid account payload");
  return {
    id: stringValue(body.id),
    status: stringValue(body.status),
    trading_blocked: booleanValue(body.trading_blocked),
    trade_suspended_by_user: booleanValue(body.trade_suspended_by_user),
    buying_power: finiteNumber(body.buying_power),
    options_buying_power: finiteNumber(body.options_buying_power),
    options_approved_level: finiteNumber(body.options_approved_level),
    options_trading_level: finiteNumber(body.options_trading_level),
  };
}

export async function getAlpacaPaperOrder(env: AlpacaPaperEnv, orderId: string): Promise<AlpacaPaperOrder> {
  const result = await request(env, `/v2/orders/${encodeURIComponent(orderId)}`);
  if (!result) throw new Error("Alpaca PAPER order request unexpectedly returned no result");
  return normalizeOrder(result.payload, result.request_id);
}

export async function getAlpacaPaperOrderByClientId(
  env: AlpacaPaperEnv,
  clientOrderId: string,
): Promise<AlpacaPaperOrder | null> {
  const result = await request(
    env,
    `/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`,
    {},
    true,
  );
  return result ? normalizeOrder(result.payload, result.request_id) : null;
}

export async function submitAlpacaPaperOptionBuy(
  env: AlpacaPaperEnv,
  input: { symbol: string; quantity: number; limitPrice: number; clientOrderId: string },
): Promise<AlpacaPaperOrder> {
  const result = await request(env, "/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      symbol: input.symbol,
      qty: String(Math.max(1, Math.trunc(input.quantity))),
      side: "buy",
      type: "limit",
      time_in_force: "day",
      limit_price: input.limitPrice.toFixed(2),
      client_order_id: input.clientOrderId,
    }),
  });
  if (!result) throw new Error("Alpaca PAPER order submission unexpectedly returned no result");
  return normalizeOrder(result.payload, result.request_id);
}

export async function submitAlpacaPaperOptionClose(
  env: AlpacaPaperEnv,
  input: { symbol: string; quantity: number; clientOrderId: string },
): Promise<AlpacaPaperOrder> {
  const result = await request(env, "/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      symbol: input.symbol,
      qty: String(Math.max(1, Math.trunc(input.quantity))),
      side: "sell",
      type: "market",
      time_in_force: "day",
      client_order_id: input.clientOrderId,
    }),
  });
  if (!result) throw new Error("Alpaca PAPER close submission unexpectedly returned no result");
  return normalizeOrder(result.payload, result.request_id);
}

export async function getAlpacaPaperPosition(
  env: AlpacaPaperEnv,
  symbol: string,
): Promise<AlpacaPaperPosition | null> {
  const result = await request(env, `/v2/positions/${encodeURIComponent(symbol)}`, {}, true);
  if (!result) return null;
  const body = record(result.payload);
  const normalizedSymbol = stringValue(body?.symbol);
  const qty = finiteNumber(body?.qty);
  if (!normalizedSymbol || qty === null) throw new Error("Alpaca PAPER returned an incomplete position payload");
  return {
    symbol: normalizedSymbol,
    qty,
    avg_entry_price: finiteNumber(body?.avg_entry_price),
    market_value: finiteNumber(body?.market_value),
    unrealized_pl: finiteNumber(body?.unrealized_pl),
  };
}

export function isDefiniteAlpacaPaperRejection(error: unknown): boolean {
  return error instanceof AlpacaPaperBrokerError
    && [400, 403, 422].includes(error.httpStatus);
}
