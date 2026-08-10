import { generatePrediction } from "./engine";
import { scheduleOutcomeTargets } from "./outcomes";
import { scoreSignals, type OptionCandidate, type SignalForScoring } from "./scoring";

export type AlpacaEnv = Env & {
  ALPACA_API_KEY_ID?: string;
  ALPACA_API_SECRET_KEY?: string;
  ALPACA_STOCK_FEED?: string;
  ALPACA_OPTION_FEED?: string;
};

export interface AlpacaPredictInput {
  ticker: string;
  horizon_minutes?: number;
  lookback_hours?: number;
  min_dte?: number;
  max_dte?: number;
  strike_band_pct?: number;
}

interface AlpacaOptionContract {
  symbol?: string;
  expiration_date?: string;
  type?: "call" | "put";
  strike_price?: string;
  open_interest?: string;
  tradable?: boolean;
  status?: string;
}

interface AlpacaContractResponse {
  option_contracts?: AlpacaOptionContract[];
  page_token?: string;
  next_page_token?: string;
}

type JsonRecord = Record<string, unknown>;

const allowedStockFeeds = new Set(["iex", "sip", "delayed_sip", "boats", "overnight", "otc"]);
const allowedOptionFeeds = new Set(["indicative", "opra"]);

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function datePlusDays(from: Date, days: number): string {
  const copy = new Date(from.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function authHeaders(env: AlpacaEnv): HeadersInit {
  if (!env.ALPACA_API_KEY_ID?.trim() || !env.ALPACA_API_SECRET_KEY?.trim()) {
    throw new Error("Alpaca credentials are not configured. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY as Worker secrets.");
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
  const payload = await response.json();
  const parsed = record(payload);
  if (!parsed) throw new Error("Alpaca returned a non-object JSON response");
  return parsed;
}

function parseStockSnapshot(payload: JsonRecord) {
  const latestTrade = record(payload.latestTrade ?? payload.latest_trade);
  const latestQuote = record(payload.latestQuote ?? payload.latest_quote);
  const dailyBar = record(payload.dailyBar ?? payload.daily_bar);

  const tradePrice = finiteNumber(latestTrade?.p ?? latestTrade?.price);
  const bid = finiteNumber(latestQuote?.bp ?? latestQuote?.bid_price);
  const ask = finiteNumber(latestQuote?.ap ?? latestQuote?.ask_price);
  const quoteMid = bid !== null && ask !== null && ask >= bid ? (bid + ask) / 2 : null;
  const dailyClose = finiteNumber(dailyBar?.c ?? dailyBar?.close);
  const price = tradePrice ?? quoteMid ?? dailyClose;
  if (price === null || price <= 0) throw new Error("Alpaca stock snapshot did not contain a usable underlying price");

  const observedAt = stringValue(latestQuote?.t ?? latestQuote?.timestamp)
    ?? stringValue(latestTrade?.t ?? latestTrade?.timestamp)
    ?? new Date().toISOString();

  return {
    observed_at: observedAt,
    underlying_price: price,
    bid,
    ask,
    last: tradePrice,
    volume: finiteNumber(dailyBar?.v ?? dailyBar?.volume),
  };
}

function parseOptionSnapshot(
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
  if (bid === null || ask === null) return null;

  const observedAt = stringValue(latestQuote?.t ?? latestQuote?.timestamp)
    ?? new Date().toISOString();
  const volume = finiteNumber(dailyBar?.v ?? dailyBar?.volume);
  const openInterest = finiteNumber(contract.open_interest);
  const impliedVolatility = finiteNumber(snapshot.impliedVolatility ?? snapshot.implied_volatility);
  const delta = finiteNumber(greeks?.delta);
  const gamma = finiteNumber(greeks?.gamma);
  const theta = finiteNumber(greeks?.theta);
  const vega = finiteNumber(greeks?.vega);

  return {
    contract_symbol: symbol,
    option_type: contract.type,
    strike,
    expiration_date: contract.expiration_date,
    observed_at: observedAt,
    provider,
    underlying_price: underlyingPrice,
    bid,
    ask,
    ...(ask >= bid ? { mark: (ask + bid) / 2 } : {}),
    ...(volume === null ? {} : { volume }),
    ...(openInterest === null ? {} : { open_interest: openInterest }),
    ...(impliedVolatility === null ? {} : { implied_volatility: impliedVolatility }),
    ...(delta === null ? {} : { delta }),
    ...(gamma === null ? {} : { gamma }),
    ...(theta === null ? {} : { theta }),
    ...(vega === null ? {} : { vega }),
  };
}

async function recentSignalScore(env: Env, ticker: string, lookbackHours: number) {
  const entity = await env.DB.prepare(`
    SELECT id FROM entities WHERE ticker = ?1 LIMIT 1
  `).bind(ticker).first<{ id: string }>();
  if (!entity) return { entityId: null, signals: [] as SignalForScoring[], score: scoreSignals([]) };

  const now = new Date();
  const cutoff = new Date(now.getTime() - lookbackHours * 3_600_000).toISOString();
  const result = await env.DB.prepare(`
    SELECT id, signal_type, observed_at, normalized_value, direction_hint, confidence
    FROM signals
    WHERE entity_id = ?1 AND observed_at >= ?2 AND observed_at <= ?3
    ORDER BY observed_at DESC
    LIMIT 200
  `).bind(entity.id, cutoff, now.toISOString()).all<SignalForScoring>();

  return { entityId: entity.id, signals: result.results, score: scoreSignals(result.results) };
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
  const headers = authHeaders(env);
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
  const payload = await getJson(`https://paper-api.alpaca.markets/v2/options/contracts?${params}`, headers);
  const typed = payload as AlpacaContractResponse;
  const contracts = new Map<string, AlpacaOptionContract>();
  for (const contract of typed.option_contracts ?? []) {
    if (contract.symbol && contract.tradable !== false) contracts.set(contract.symbol, contract);
  }
  return contracts;
}

async function fetchOptionChain(
  env: AlpacaEnv,
  ticker: string,
  type: "call" | "put",
  minExpiration: string,
  maxExpiration: string,
  strikeMin: number,
  strikeMax: number,
): Promise<Map<string, unknown>> {
  const headers = authHeaders(env);
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
      headers,
    );
    const snapshotObject = record(payload.snapshots) ?? {};
    for (const [symbol, value] of Object.entries(snapshotObject)) snapshots.set(symbol, value);

    pageToken = stringValue(payload.next_page_token ?? payload.nextPageToken);
    if (!pageToken) break;
  }

  return snapshots;
}

export async function alpacaPredict(env: AlpacaEnv, input: AlpacaPredictInput) {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) throw new Error("ticker is required");
  const lookbackHours = Math.max(1, Math.min(input.lookback_hours ?? 24, 168));
  const minDte = Math.max(7, Math.min(input.min_dte ?? 7, 90));
  const maxDte = Math.max(minDte, Math.min(input.max_dte ?? 45, 180));
  const strikeBandPct = Math.max(0.05, Math.min(input.strike_band_pct ?? 0.15, 0.50));

  const stockFeed = env.ALPACA_STOCK_FEED?.trim().toLowerCase() || "iex";
  const optionFeed = env.ALPACA_OPTION_FEED?.trim().toLowerCase() || "indicative";
  if (!allowedStockFeeds.has(stockFeed)) throw new Error(`Unsupported ALPACA_STOCK_FEED: ${stockFeed}`);
  if (!allowedOptionFeeds.has(optionFeed)) throw new Error(`Unsupported ALPACA_OPTION_FEED: ${optionFeed}`);

  const headers = authHeaders(env);
  const stockPayload = await getJson(
    `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(ticker)}/snapshot?feed=${encodeURIComponent(stockFeed)}`,
    headers,
  );
  const stock = parseStockSnapshot(stockPayload);
  const signalContext = await recentSignalScore(env, ticker, lookbackHours);

  const options: OptionCandidate[] = [];
  let directionUsed: "call" | "put" | null = null;

  if (signalContext.score.opportunityScore >= 0.60 && Math.abs(signalContext.score.directionalScore) >= 0.20) {
    directionUsed = signalContext.score.directionalScore > 0 ? "call" : "put";
    const now = new Date();
    const minExpiration = datePlusDays(now, minDte);
    const maxExpiration = datePlusDays(now, maxDte);
    const strikeMin = stock.underlying_price * (1 - strikeBandPct);
    const strikeMax = stock.underlying_price * (1 + strikeBandPct);

    const [contracts, snapshots] = await Promise.all([
      fetchContracts(env, ticker, directionUsed, minExpiration, maxExpiration, strikeMin, strikeMax),
      fetchOptionChain(env, ticker, directionUsed, minExpiration, maxExpiration, strikeMin, strikeMax),
    ]);

    for (const [symbol, snapshot] of snapshots.entries()) {
      const contract = contracts.get(symbol);
      if (!contract) continue;
      const normalized = parseOptionSnapshot(
        symbol,
        snapshot,
        contract,
        stock.underlying_price,
        `alpaca:${optionFeed}`,
      );
      if (normalized) options.push(normalized);
    }
  }

  const horizonMinutes = input.horizon_minutes ?? 1_440;
  const prediction = await generatePrediction(env, {
    ticker,
    horizon_minutes: horizonMinutes,
    lookback_hours: lookbackHours,
    market: {
      observed_at: stock.observed_at,
      provider: `alpaca:${stockFeed}`,
      underlying_price: stock.underlying_price,
      ...(stock.bid === null ? {} : { bid: stock.bid }),
      ...(stock.ask === null ? {} : { ask: stock.ask }),
      ...(stock.last === null ? {} : { last: stock.last }),
      ...(stock.volume === null ? {} : { volume: stock.volume }),
    },
    options,
  });

  const outcomeTargets = await scheduleOutcomeTargets(env, {
    prediction_id: prediction.prediction_id,
    published_at: prediction.published_at,
    horizon_minutes: horizonMinutes,
  });

  return {
    ...prediction,
    outcome_targets_scheduled: outcomeTargets.length,
    market_adapter: "alpaca-v0.1",
    stock_feed: stockFeed,
    option_feed: optionFeed,
    options_normalized: options.length,
    directional_chain_requested: directionUsed,
    execution_grade_data: optionFeed === "opra" && stockFeed === "sip",
    feed_warning: optionFeed === "indicative"
      ? "Alpaca indicative options data is delayed/modified and is paper-research only. Do not use it for live execution decisions."
      : null,
  };
}
