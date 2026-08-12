type StrategyOrderRow = {
  id: string;
  prediction_id: string;
  ticker: string;
  recommendation_type: "CALL" | "PUT" | "PASS";
  contract_symbol: string;
  option_type: "call" | "put" | null;
  strike: number | null;
  expiration_date: string | null;
  quantity: number;
  status: string;
  block_reason: string | null;
  created_at: string;
  filled_at: string | null;
  fill_price: number | null;
  notional_usd: number;
  closed_at: string | null;
  exit_price: number | null;
  realized_pnl_usd: number | null;
  exit_method: string | null;
  horizon_minutes: number;
  underlying_opportunity_score: number;
};

type SystemTestRow = {
  id: string;
  ticker: string;
  contract_symbol: string;
  option_type: "call" | "put";
  strike: number;
  expiration_date: string;
  quantity: number;
  entry_bid: number | null;
  entry_ask: number;
  entry_fill_price: number;
  notional_usd: number;
  opened_at: string;
  close_after_at: string;
  status: "open" | "closed";
  last_bid: number | null;
  last_ask: number | null;
  last_mark: number | null;
  last_marked_at: string | null;
  unrealized_pnl_usd: number | null;
  closed_at: string | null;
  exit_price: number | null;
  realized_pnl_usd: number | null;
  close_method: string | null;
};

type ActivePolicyRow = {
  id: string;
  name: string;
  daily_target_usd: number;
  daily_hard_cap_usd: number;
  max_single_trade_usd: number;
  max_open_risk_usd: number;
  daily_loss_stop_usd: number;
  min_opportunity_score: number;
  exceptional_opportunity_score: number;
  max_bid_ask_spread_pct: number;
  min_open_interest: number;
  min_volume: number;
  min_days_to_expiration: number;
  allow_0dte: number;
  live_enabled: number;
};

type DailyRiskRow = {
  deployed_usd: number;
  realized_pnl_usd: number;
  new_positions_blocked: number;
  block_reason: string | null;
};

type RuntimePortfolioEnv = Env & {
  ALPACA_API_KEY_ID?: string;
  ALPACA_API_SECRET_KEY?: string;
  ALPACA_OPTION_FEED?: string;
};

type JsonRecord = Record<string, unknown>;

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

function marketDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function authHeaders(env: RuntimePortfolioEnv): HeadersInit {
  if (!env.ALPACA_API_KEY_ID?.trim() || !env.ALPACA_API_SECRET_KEY?.trim()) {
    throw new Error("Alpaca credentials are unavailable for strategy position marks");
  }
  return {
    "APCA-API-KEY-ID": env.ALPACA_API_KEY_ID,
    "APCA-API-SECRET-KEY": env.ALPACA_API_SECRET_KEY,
    "Accept": "application/json",
  };
}

async function getJson(url: string, headers: HeadersInit): Promise<JsonRecord> {
  const response = await fetch(url, { headers });
  if (response.status === 429) throw new Error("Alpaca rate limit reached while marking strategy positions");
  if (!response.ok) throw new Error(`Alpaca mark request failed with HTTP ${response.status}`);
  const payload = record(await response.json());
  if (!payload) throw new Error("Alpaca returned an unexpected strategy-mark payload");
  return payload;
}

async function currentStrategyQuote(env: RuntimePortfolioEnv, row: StrategyOrderRow) {
  if (!row.option_type || row.strike === null || !row.expiration_date) {
    throw new Error("Selected option metadata is incomplete");
  }
  const optionFeed = env.ALPACA_OPTION_FEED?.trim().toLowerCase() || "indicative";
  if (optionFeed !== "indicative" && optionFeed !== "opra") {
    throw new Error(`Unsupported ALPACA_OPTION_FEED: ${optionFeed}`);
  }

  const params = new URLSearchParams({
    feed: optionFeed,
    type: row.option_type,
    expiration_date_gte: row.expiration_date,
    expiration_date_lte: row.expiration_date,
    strike_price_gte: row.strike.toFixed(2),
    strike_price_lte: row.strike.toFixed(2),
    limit: "1000",
  });
  const payload = await getJson(
    `https://data.alpaca.markets/v1beta1/options/snapshots/${encodeURIComponent(row.ticker)}?${params}`,
    authHeaders(env),
  );
  const snapshots = record(payload.snapshots) ?? {};
  const snapshot = record(snapshots[row.contract_symbol]);
  if (!snapshot) throw new Error(`No current option snapshot for ${row.contract_symbol}`);
  const latestQuote = record(snapshot.latestQuote ?? snapshot.latest_quote);
  const bid = finiteNumber(latestQuote?.bp ?? latestQuote?.bid_price);
  const ask = finiteNumber(latestQuote?.ap ?? latestQuote?.ask_price);
  const observedAt = stringValue(latestQuote?.t ?? latestQuote?.timestamp) ?? new Date().toISOString();
  if (bid === null || ask === null || bid < 0 || ask <= 0 || ask < bid) {
    throw new Error(`No usable current quote for ${row.contract_symbol}`);
  }
  return {
    bid,
    ask,
    mark: (bid + ask) / 2,
    observed_at: observedAt,
    feed: optionFeed,
  };
}

async function markOpenStrategies(env: RuntimePortfolioEnv, strategy: StrategyOrderRow[]) {
  const marked: Array<StrategyOrderRow & Record<string, unknown>> = [];
  for (const row of strategy) {
    if (row.status !== "filled" || row.fill_price === null) {
      marked.push(row);
      continue;
    }
    try {
      const quote = await currentStrategyQuote(env, row);
      const multiplier = 100 * Math.max(1, row.quantity || 1);
      marked.push({
        ...row,
        last_bid: quote.bid,
        last_ask: quote.ask,
        last_mark: quote.mark,
        last_marked_at: quote.observed_at,
        quote_feed: quote.feed,
        quote_reference: "current_option_quote_mid",
        unrealized_pnl_usd: (quote.mark - row.fill_price) * multiplier,
        conservative_exit_pnl_usd: (quote.bid - row.fill_price) * multiplier,
      });
    } catch (error) {
      marked.push({
        ...row,
        mark_error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return marked;
}

export async function paperPortfolio(env: RuntimePortfolioEnv) {
  const tradingDate = marketDate();
  const [strategyResult, systemTestResult, activePolicy, todayRisk] = await Promise.all([
    env.DB.prepare(`
      SELECT
        po.id,
        po.prediction_id,
        e.ticker,
        r.recommendation_type,
        po.contract_symbol,
        ocs.option_type,
        ocs.strike,
        ocs.expiration_date,
        po.quantity,
        po.status,
        po.block_reason,
        po.created_at,
        po.filled_at,
        po.fill_price,
        po.notional_usd,
        po.closed_at,
        po.exit_price,
        po.realized_pnl_usd,
        po.exit_method,
        p.horizon_minutes,
        r.underlying_opportunity_score
      FROM paper_orders po
      JOIN predictions p ON p.id = po.prediction_id
      JOIN entities e ON e.id = p.entity_id
      JOIN recommendations r ON r.id = p.recommendation_id
      LEFT JOIN option_contract_snapshots ocs ON ocs.id = po.option_snapshot_id
      ORDER BY po.created_at DESC
      LIMIT 100
    `).all<StrategyOrderRow>(),
    env.DB.prepare(`
      SELECT
        id, ticker, contract_symbol, option_type, strike, expiration_date, quantity,
        entry_bid, entry_ask, entry_fill_price, notional_usd, opened_at, close_after_at,
        status, last_bid, last_ask, last_mark, last_marked_at, unrealized_pnl_usd,
        closed_at, exit_price, realized_pnl_usd, close_method
      FROM paper_system_test_positions
      ORDER BY opened_at DESC
      LIMIT 100
    `).all<SystemTestRow>(),
    env.DB.prepare(`
      SELECT id, name, daily_target_usd, daily_hard_cap_usd, max_single_trade_usd,
             max_open_risk_usd, daily_loss_stop_usd, min_opportunity_score,
             exceptional_opportunity_score, max_bid_ask_spread_pct,
             min_open_interest, min_volume, min_days_to_expiration,
             allow_0dte, live_enabled
      FROM execution_policies
      WHERE active = 1
      ORDER BY created_at DESC
      LIMIT 1
    `).first<ActivePolicyRow>(),
    env.DB.prepare(`
      SELECT deployed_usd, realized_pnl_usd, new_positions_blocked, block_reason
      FROM daily_risk_state
      WHERE trading_date = ?1
      LIMIT 1
    `).bind(tradingDate).first<DailyRiskRow>(),
  ]);

  const strategyRows = strategyResult.results;
  const strategy = await markOpenStrategies(env, strategyRows);
  const systemTest = systemTestResult.results.map((row) => ({
    lane: "system_test" as const,
    excluded_from_strategy_proof: true,
    ...row,
  }));
  const markedStrategy = strategy.map((row) => ({
    lane: "strategy" as const,
    ...row,
  }));
  const openStrategy = markedStrategy.filter((row) => row.status === "filled");
  const currentOpenRiskUsd = openStrategy.reduce((sum, row) => sum + Number(row.notional_usd || 0), 0);
  const policyMode = activePolicy?.id.includes("validation") ? "validation" : "standard";

  return {
    generated_at: new Date().toISOString(),
    trading_date: tradingDate,
    note: "SYSTEM TEST positions are isolated mechanical validations and are excluded from strategy proof/performance metrics. Strategy marks use the current configured Alpaca option quote feed and remain paper/research references.",
    active_policy: activePolicy ? {
      ...activePolicy,
      mode: policyMode,
      live_enabled: Boolean(activePolicy.live_enabled),
      allow_0dte: Boolean(activePolicy.allow_0dte),
    } : null,
    risk: {
      today_deployed_usd: todayRisk?.deployed_usd ?? 0,
      today_realized_pnl_usd: todayRisk?.realized_pnl_usd ?? 0,
      current_open_strategy_risk_usd: currentOpenRiskUsd,
      current_open_strategy_positions: openStrategy.length,
      open_risk_over_cap: activePolicy ? currentOpenRiskUsd > activePolicy.max_open_risk_usd : false,
      new_positions_blocked: Boolean(todayRisk?.new_positions_blocked),
      block_reason: todayRisk?.block_reason ?? null,
    },
    strategy: {
      open: openStrategy,
      closed: markedStrategy.filter((row) => row.status === "closed"),
      other: markedStrategy.filter((row) => row.status !== "filled" && row.status !== "closed"),
    },
    system_test: {
      open: systemTest.filter((row) => row.status === "open"),
      closed: systemTest.filter((row) => row.status === "closed"),
    },
  };
}
