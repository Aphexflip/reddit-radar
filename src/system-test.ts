import type { AlpacaEnv } from "./alpaca";
import { getUsMarketClock, paperEntryGate } from "./market";
import { scoreOptionCandidate, type OptionCandidate, type ScoredOption } from "./scoring";

type JsonRecord = Record<string, unknown>;

type AlpacaOptionContract = {
  symbol?: string;
  expiration_date?: string;
  type?: "call" | "put";
  strike_price?: string;
  open_interest?: string;
  tradable?: boolean;
};

export interface SystemTestInput {
  max_debit_usd?: number;
  horizon_minutes?: number;
  tickers?: string[];
}

const DEFAULT_UNIVERSE = ["SPY", "QQQ", "AMD", "NVDA", "AAPL", "MSFT", "META", "AMZN", "GOOGL", "TSLA"];
const allowedOptionFeeds = new Set(["indicative", "opra"]);

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function datePlusDays(from: Date, days: number): string {
  const copy = new Date(from.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function authHeaders(env: AlpacaEnv): HeadersInit {
  if (!env.ALPACA_API_KEY_ID?.trim() || !env.ALPACA_API_SECRET_KEY?.trim()) {
    throw new Error("Alpaca credentials are required for a paper system test");
  }
  return {
    "APCA-API-KEY-ID": env.ALPACA_API_KEY_ID,
    "APCA-API-SECRET-KEY": env.ALPACA_API_SECRET_KEY,
    "Accept": "application/json",
  };
}

async function getJson(url: string, headers: HeadersInit): Promise<JsonRecord> {
  const response = await fetch(url, { headers });
  if (response.status === 429) throw new Error(`Alpaca rate limit reached for ${new URL(url).pathname}`);
  if (!response.ok) throw new Error(`Alpaca request failed with HTTP ${response.status} for ${new URL(url).pathname}`);
  const payload = record(await response.json());
  if (!payload) throw new Error("Alpaca returned an unexpected response");
  return payload;
}

async function currentUnderlyingPrice(env: AlpacaEnv, ticker: string): Promise<number> {
  const feed = env.ALPACA_STOCK_FEED?.trim().toLowerCase() || "iex";
  const payload = await getJson(
    `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(ticker)}/snapshot?feed=${encodeURIComponent(feed)}`,
    authHeaders(env),
  );
  const latestTrade = record(payload.latestTrade ?? payload.latest_trade);
  const latestQuote = record(payload.latestQuote ?? payload.latest_quote);
  const dailyBar = record(payload.dailyBar ?? payload.daily_bar);
  const trade = finiteNumber(latestTrade?.p ?? latestTrade?.price);
  const bid = finiteNumber(latestQuote?.bp ?? latestQuote?.bid_price);
  const ask = finiteNumber(latestQuote?.ap ?? latestQuote?.ask_price);
  const mid = bid !== null && ask !== null && ask >= bid ? (bid + ask) / 2 : null;
  const close = finiteNumber(dailyBar?.c ?? dailyBar?.close);
  const price = trade ?? mid ?? close;
  if (price === null || price <= 0) throw new Error(`No usable stock price for ${ticker}`);
  return price;
}

async function fetchContracts(
  env: AlpacaEnv,
  ticker: string,
  type: "call" | "put",
  minExpiration: string,
  maxExpiration: string,
  strikeMin: number,
  strikeMax: number,
): Promise<Map<string, AlpacaOptionContract>> {
  const params = new URLSearchParams({
    underlying_symbols: ticker,
    status: "active",
    type,
    expiration_date_gte: minExpiration,
    expiration_date_lte: maxExpiration,
    strike_price_gte: strikeMin.toFixed(2),
    strike_price_lte: strikeMax.toFixed(2),
    limit: "10000",
  });
  const payload = await getJson(
    `https://paper-api.alpaca.markets/v2/options/contracts?${params}`,
    authHeaders(env),
  );
  const raw = Array.isArray(payload.option_contracts) ? payload.option_contracts : [];
  const contracts = new Map<string, AlpacaOptionContract>();
  for (const value of raw) {
    const contract = value as AlpacaOptionContract;
    if (contract.symbol && contract.tradable !== false) contracts.set(contract.symbol, contract);
  }
  return contracts;
}

async function fetchSnapshots(
  env: AlpacaEnv,
  ticker: string,
  type: "call" | "put",
  minExpiration: string,
  maxExpiration: string,
  strikeMin: number,
  strikeMax: number,
): Promise<Map<string, unknown>> {
  const optionFeed = env.ALPACA_OPTION_FEED?.trim().toLowerCase() || "indicative";
  if (!allowedOptionFeeds.has(optionFeed)) throw new Error(`Unsupported ALPACA_OPTION_FEED: ${optionFeed}`);
  const snapshots = new Map<string, unknown>();
  let pageToken: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      feed: optionFeed,
      type,
      expiration_date_gte: minExpiration,
      expiration_date_lte: maxExpiration,
      strike_price_gte: strikeMin.toFixed(2),
      strike_price_lte: strikeMax.toFixed(2),
      limit: "1000",
    });
    if (pageToken) params.set("page_token", pageToken);
    const payload = await getJson(
      `https://data.alpaca.markets/v1beta1/options/snapshots/${encodeURIComponent(ticker)}?${params}`,
      authHeaders(env),
    );
    const root = record(payload.snapshots) ?? {};
    for (const [symbol, value] of Object.entries(root)) snapshots.set(symbol, value);
    pageToken = stringValue(payload.next_page_token ?? payload.nextPageToken);
    if (!pageToken) break;
  }
  return snapshots;
}

function normalizeOption(
  symbol: string,
  snapshotValue: unknown,
  contract: AlpacaOptionContract,
  underlyingPrice: number,
  provider: string,
): OptionCandidate | null {
  const snapshot = record(snapshotValue);
  if (!snapshot || !contract.expiration_date || !contract.type) return null;
  const strike = finiteNumber(contract.strike_price);
  if (strike === null) return null;
  const latestQuote = record(snapshot.latestQuote ?? snapshot.latest_quote);
  const dailyBar = record(snapshot.dailyBar ?? snapshot.daily_bar);
  const greeks = record(snapshot.greeks);
  const bid = finiteNumber(latestQuote?.bp ?? latestQuote?.bid_price);
  const ask = finiteNumber(latestQuote?.ap ?? latestQuote?.ask_price);
  if (bid === null || ask === null || ask <= 0 || ask < bid) return null;
  const observedAt = stringValue(latestQuote?.t ?? latestQuote?.timestamp) ?? new Date().toISOString();

  const option: OptionCandidate = {
    contract_symbol: symbol,
    option_type: contract.type,
    strike,
    expiration_date: contract.expiration_date,
    observed_at: observedAt,
    provider,
    underlying_price: underlyingPrice,
    bid,
    ask,
    mark: (bid + ask) / 2,
  };

  const volume = finiteNumber(dailyBar?.v ?? dailyBar?.volume);
  const openInterest = finiteNumber(contract.open_interest);
  const impliedVolatility = finiteNumber(snapshot.impliedVolatility ?? snapshot.implied_volatility);
  const delta = finiteNumber(greeks?.delta);
  const gamma = finiteNumber(greeks?.gamma);
  const theta = finiteNumber(greeks?.theta);
  const vega = finiteNumber(greeks?.vega);
  if (volume !== null) option.volume = volume;
  if (openInterest !== null) option.open_interest = openInterest;
  if (impliedVolatility !== null) option.implied_volatility = impliedVolatility;
  if (delta !== null) option.delta = delta;
  if (gamma !== null) option.gamma = gamma;
  if (theta !== null) option.theta = theta;
  if (vega !== null) option.vega = vega;
  return option;
}

type TestCandidate = ScoredOption & { ticker: string; debit_usd: number };

async function affordableCandidatesForTicker(
  env: AlpacaEnv,
  ticker: string,
  maxDebitUsd: number,
): Promise<TestCandidate[]> {
  const underlyingPrice = await currentUnderlyingPrice(env, ticker);
  const now = new Date();
  const minExpiration = datePlusDays(now, 7);
  const maxExpiration = datePlusDays(now, 30);
  const strikeMin = underlyingPrice * 0.75;
  const strikeMax = underlyingPrice * 1.25;
  const provider = `alpaca:${env.ALPACA_OPTION_FEED?.trim().toLowerCase() || "indicative"}`;
  const results: TestCandidate[] = [];

  for (const type of ["call", "put"] as const) {
    const [contracts, snapshots] = await Promise.all([
      fetchContracts(env, ticker, type, minExpiration, maxExpiration, strikeMin, strikeMax),
      fetchSnapshots(env, ticker, type, minExpiration, maxExpiration, strikeMin, strikeMax),
    ]);
    for (const [symbol, snapshot] of snapshots.entries()) {
      const contract = contracts.get(symbol);
      if (!contract) continue;
      const option = normalizeOption(symbol, snapshot, contract, underlyingPrice, provider);
      if (!option) continue;
      const debitUsd = option.ask * 100;
      if (debitUsd > maxDebitUsd) continue;
      const scored = scoreOptionCandidate(option, new Date().toISOString());
      if (!scored) continue;
      results.push({ ...scored, ticker, debit_usd: debitUsd });
    }
  }

  return results.sort((a, b) => b.score - a.score || a.debit_usd - b.debit_usd);
}

async function currentQuoteForPosition(env: AlpacaEnv, row: {
  ticker: string;
  contract_symbol: string;
  option_type: "call" | "put";
  expiration_date: string;
  strike: number;
}) {
  const snapshots = await fetchSnapshots(
    env,
    row.ticker,
    row.option_type,
    row.expiration_date,
    row.expiration_date,
    row.strike,
    row.strike,
  );
  const snapshot = record(snapshots.get(row.contract_symbol));
  if (!snapshot) throw new Error(`No current option snapshot for ${row.contract_symbol}`);
  const latestQuote = record(snapshot.latestQuote ?? snapshot.latest_quote);
  const bid = finiteNumber(latestQuote?.bp ?? latestQuote?.bid_price);
  const ask = finiteNumber(latestQuote?.ap ?? latestQuote?.ask_price);
  const observedAt = stringValue(latestQuote?.t ?? latestQuote?.timestamp) ?? new Date().toISOString();
  if (bid === null || ask === null || ask < bid) throw new Error(`No usable quote for ${row.contract_symbol}`);
  return { bid, ask, mark: (bid + ask) / 2, observed_at: observedAt };
}

export async function runSystemTestTrade(env: AlpacaEnv, input: SystemTestInput = {}) {
  if (env.EXECUTION_MODE !== "paper") throw new Error("system test requires EXECUTION_MODE=paper");
  const marketClock = await getUsMarketClock(env);
  const gate = paperEntryGate(marketClock);
  if (!gate.allowed) {
    return { executed: false, status: "market_closed", reason: gate.reason, market_clock: marketClock };
  }

  const existing = await env.DB.prepare(`
    SELECT id, ticker, contract_symbol, opened_at, close_after_at
    FROM paper_system_test_positions
    WHERE status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  `).first<{ id: string; ticker: string; contract_symbol: string; opened_at: string; close_after_at: string }>();
  if (existing) {
    return {
      executed: false,
      status: "already_open",
      reason: "Only one isolated system-test position may be open at a time.",
      position: existing,
    };
  }

  const maxDebitUsd = Math.max(25, Math.min(input.max_debit_usd ?? 200, 500));
  const horizonMinutes = Math.max(15, Math.min(input.horizon_minutes ?? 30, 120));
  const requested = Array.isArray(input.tickers) && input.tickers.length
    ? input.tickers
    : DEFAULT_UNIVERSE;
  const tickers = Array.from(new Set(requested.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))).slice(0, 10);

  let chosen: TestCandidate | null = null;
  const attempts: Array<{ ticker: string; eligible_contracts: number; error?: string }> = [];
  for (const ticker of tickers) {
    try {
      const candidates = await affordableCandidatesForTicker(env, ticker, maxDebitUsd);
      attempts.push({ ticker, eligible_contracts: candidates.length });
      if (candidates.length) {
        chosen = candidates[0] ?? null;
        break;
      }
    } catch (error) {
      attempts.push({ ticker, eligible_contracts: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!chosen) {
    return {
      executed: false,
      status: "no_affordable_quality_contract",
      max_debit_usd: maxDebitUsd,
      attempts,
      note: "The system test does not relax spread, volume, open-interest, or 7+ DTE quality gates just to force a fill.",
    };
  }

  const now = new Date().toISOString();
  const closeAfterAt = addMinutes(now, horizonMinutes);
  const positionId = crypto.randomUUID();
  const option = chosen.option;
  const mark = option.mark ?? (option.bid + option.ask) / 2;

  await env.DB.prepare(`
    INSERT INTO paper_system_test_positions(
      id, ticker, contract_symbol, option_type, strike, expiration_date, quantity,
      entry_bid, entry_ask, entry_fill_price, notional_usd, opened_at, close_after_at,
      status, last_bid, last_ask, last_mark, last_marked_at, unrealized_pnl_usd,
      metadata_json
    ) VALUES(
      ?1, ?2, ?3, ?4, ?5, ?6, 1,
      ?7, ?8, ?8, ?9, ?10, ?11,
      'open', ?7, ?8, ?12, ?13, ?14, ?15
    )
  `).bind(
    positionId,
    chosen.ticker,
    option.contract_symbol,
    option.option_type,
    option.strike,
    option.expiration_date,
    option.bid,
    option.ask,
    chosen.debit_usd,
    now,
    closeAfterAt,
    mark,
    option.observed_at,
    (mark - option.ask) * 100,
    JSON.stringify({
      lane: "system_test",
      purpose: "mechanical end-to-end paper validation only",
      strategy_signal: false,
      excluded_from_strategy_proof: true,
      option_quality_score: chosen.score,
      liquidity_score: chosen.liquidityScore,
      spread_pct: chosen.spreadPct,
      dte: chosen.dte,
      max_debit_usd: maxDebitUsd,
      selection_rule: "highest quality affordable call-or-put; direction is not a strategy claim",
    }),
  ).run();

  return {
    executed: true,
    mode: "paper",
    lane: "system_test",
    excluded_from_strategy_proof: true,
    position_id: positionId,
    ticker: chosen.ticker,
    contract_symbol: option.contract_symbol,
    option_type: option.option_type,
    strike: option.strike,
    expiration_date: option.expiration_date,
    simulated_fill_price: option.ask,
    debit_usd: chosen.debit_usd,
    option_quality_score: chosen.score,
    spread_pct: chosen.spreadPct,
    volume: option.volume ?? null,
    open_interest: option.open_interest ?? null,
    opened_at: now,
    auto_close_after: closeAfterAt,
    attempts,
    note: "This is a mechanical paper test, not a CALL/PUT recommendation and not evidence of profitability.",
  };
}

export async function maintainSystemTestPositions(env: AlpacaEnv) {
  const rows = await env.DB.prepare(`
    SELECT id, ticker, contract_symbol, option_type, strike, expiration_date, quantity,
           entry_fill_price, close_after_at
    FROM paper_system_test_positions
    WHERE status = 'open'
    ORDER BY opened_at ASC
    LIMIT 10
  `).all<{
    id: string;
    ticker: string;
    contract_symbol: string;
    option_type: "call" | "put";
    strike: number;
    expiration_date: string;
    quantity: number;
    entry_fill_price: number;
    close_after_at: string;
  }>();

  const now = new Date();
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows.results) {
    try {
      const quote = await currentQuoteForPosition(env, row);
      const unrealized = (quote.mark - row.entry_fill_price) * 100 * row.quantity;
      const due = now.getTime() >= new Date(row.close_after_at).getTime();
      if (due && quote.bid > 0) {
        const realized = (quote.bid - row.entry_fill_price) * 100 * row.quantity;
        await env.DB.prepare(`
          UPDATE paper_system_test_positions SET
            status = 'closed', last_bid = ?2, last_ask = ?3, last_mark = ?4,
            last_marked_at = ?5, unrealized_pnl_usd = NULL, closed_at = ?5,
            exit_price = ?2, realized_pnl_usd = ?6,
            close_method = 'current_indicative_bid'
          WHERE id = ?1 AND status = 'open'
        `).bind(row.id, quote.bid, quote.ask, quote.mark, quote.observed_at, realized).run();
        results.push({ id: row.id, status: "closed", exit_price: quote.bid, realized_pnl_usd: realized });
      } else {
        await env.DB.prepare(`
          UPDATE paper_system_test_positions SET
            last_bid = ?2, last_ask = ?3, last_mark = ?4,
            last_marked_at = ?5, unrealized_pnl_usd = ?6
          WHERE id = ?1 AND status = 'open'
        `).bind(row.id, quote.bid, quote.ask, quote.mark, quote.observed_at, unrealized).run();
        results.push({ id: row.id, status: "open", mark: quote.mark, unrealized_pnl_usd: unrealized, due });
      }
    } catch (error) {
      results.push({ id: row.id, status: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    open_positions_seen: rows.results.length,
    closed: results.filter((item) => item.status === "closed").length,
    marked: results.filter((item) => item.status === "open").length,
    errors: results.filter((item) => item.status === "error").length,
    results,
  };
}
