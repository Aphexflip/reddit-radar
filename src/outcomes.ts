import type { AlpacaEnv } from "./alpaca";
import { recordOutcome } from "./engine";

export interface ScheduleOutcomeInput {
  prediction_id: string;
  published_at: string;
  horizon_minutes: number;
}

export interface OutcomeTargetSpec {
  horizon_label: string;
  target_time: string;
  not_before_time: string;
}

interface DueTargetRow {
  target_id: string;
  prediction_id: string;
  horizon_label: string;
  target_time: string;
  ticker: string;
  contract_symbol: string | null;
  market_entry: number | null;
  option_entry_mark: number | null;
  paper_order_id: string | null;
  paper_order_status: string | null;
  paper_fill_price: number | null;
  paper_notional_usd: number | null;
  paper_filled_at: string | null;
  prediction_horizon_minutes: number;
}

interface PriceBar {
  t: string;
  c: number;
  h?: number;
  l?: number;
}

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

function parseBar(value: unknown): PriceBar | null {
  const item = record(value);
  if (!item) return null;
  const timestamp = typeof item.t === "string" ? item.t : typeof item.timestamp === "string" ? item.timestamp : null;
  const close = finiteNumber(item.c ?? item.close);
  if (!timestamp || close === null) return null;
  const high = finiteNumber(item.h ?? item.high);
  const low = finiteNumber(item.l ?? item.low);
  return {
    t: timestamp,
    c: close,
    ...(high === null ? {} : { h: high }),
    ...(low === null ? {} : { l: low }),
  };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

function authHeaders(env: AlpacaEnv): HeadersInit {
  if (!env.ALPACA_API_KEY_ID?.trim() || !env.ALPACA_API_SECRET_KEY?.trim()) {
    throw new Error("Alpaca credentials are required for automated outcome collection");
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
  if (!payload) throw new Error("Alpaca returned an unexpected historical-data payload");
  return payload;
}

function firstBarAtOrAfter(bars: PriceBar[], targetTime: string): PriceBar | null {
  const target = new Date(targetTime).getTime();
  return bars
    .filter((bar) => new Date(bar.t).getTime() >= target)
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())[0] ?? null;
}

async function stockBarAtOrAfter(
  env: AlpacaEnv,
  ticker: string,
  targetTime: string,
): Promise<PriceBar | null> {
  const start = addMinutes(targetTime, -5);
  const end = addDays(targetTime, 4);
  const feed = env.ALPACA_STOCK_FEED?.trim().toLowerCase() || "iex";
  const params = new URLSearchParams({
    timeframe: "1Min",
    start,
    end,
    feed,
    adjustment: "all",
    sort: "asc",
    limit: "5000",
  });
  const payload = await getJson(
    `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(ticker)}/bars?${params}`,
    authHeaders(env),
  );
  const rawBars = Array.isArray(payload.bars) ? payload.bars : [];
  const bars = rawBars.map(parseBar).filter((bar): bar is PriceBar => bar !== null);
  return firstBarAtOrAfter(bars, targetTime);
}

async function optionBarAtOrAfter(
  env: AlpacaEnv,
  contractSymbol: string,
  targetTime: string,
): Promise<PriceBar | null> {
  const start = addMinutes(targetTime, -5);
  const end = addDays(targetTime, 4);
  const params = new URLSearchParams({
    symbols: contractSymbol,
    timeframe: "1Min",
    start,
    end,
    sort: "asc",
    limit: "5000",
  });
  const payload = await getJson(
    `https://data.alpaca.markets/v1beta1/options/bars?${params}`,
    authHeaders(env),
  );
  const barsRoot = payload.bars;
  let rawBars: unknown[] = [];
  if (Array.isArray(barsRoot)) rawBars = barsRoot;
  else {
    const bySymbol = record(barsRoot);
    const candidate = bySymbol?.[contractSymbol];
    if (Array.isArray(candidate)) rawBars = candidate;
  }
  const bars = rawBars.map(parseBar).filter((bar): bar is PriceBar => bar !== null);
  return firstBarAtOrAfter(bars, targetTime);
}

export function buildOutcomeTargetSpecs(
  publishedAt: string,
  horizonMinutes: number,
  optionFeed: string,
): OutcomeTargetSpec[] {
  const collectionDelayMinutes = optionFeed.trim().toLowerCase() === "opra" ? 2 : 20;
  const fixedTargets = [
    { label: "30m_elapsed", minutes: 30 },
    { label: "24h_elapsed", minutes: 1_440 },
    { label: "72h_elapsed", minutes: 4_320 },
    { label: "120h_elapsed", minutes: 7_200 },
    { label: "predicted_elapsed", minutes: Math.max(30, horizonMinutes) },
  ];

  return fixedTargets.map((target) => {
    const targetTime = addMinutes(publishedAt, target.minutes);
    return {
      horizon_label: target.label,
      target_time: targetTime,
      not_before_time: addMinutes(targetTime, collectionDelayMinutes),
    };
  });
}

export async function scheduleOutcomeTargets(env: Env, input: ScheduleOutcomeInput) {
  const feed = (env as AlpacaEnv).ALPACA_OPTION_FEED?.trim().toLowerCase() || "indicative";
  const targets = buildOutcomeTargetSpecs(
    input.published_at,
    input.horizon_minutes,
    feed,
  );

  for (const target of targets) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO outcome_targets(
        id, prediction_id, horizon_label, target_time, not_before_time
      ) VALUES(?1, ?2, ?3, ?4, ?5)
    `).bind(
      crypto.randomUUID(),
      input.prediction_id,
      target.horizon_label,
      target.target_time,
      target.not_before_time,
    ).run();
  }

  return targets;
}

async function dueTargets(env: Env, limit: number): Promise<DueTargetRow[]> {
  const result = await env.DB.prepare(`
    SELECT
      ot.id AS target_id,
      ot.prediction_id,
      ot.horizon_label,
      ot.target_time,
      e.ticker,
      ocs.contract_symbol,
      ms.underlying_price AS market_entry,
      ocs.mark AS option_entry_mark,
      po.id AS paper_order_id,
      po.status AS paper_order_status,
      po.fill_price AS paper_fill_price,
      po.notional_usd AS paper_notional_usd,
      po.filled_at AS paper_filled_at,
      p.horizon_minutes AS prediction_horizon_minutes
    FROM outcome_targets ot
    JOIN predictions p ON p.id = ot.prediction_id
    JOIN entities e ON e.id = p.entity_id
    JOIN recommendations r ON r.id = p.recommendation_id
    LEFT JOIN market_snapshots ms ON ms.id = r.market_snapshot_id
    LEFT JOIN recommendation_contracts rc ON rc.recommendation_id = r.id
    LEFT JOIN option_contract_snapshots ocs ON ocs.id = rc.option_snapshot_id
    LEFT JOIN paper_orders po ON po.prediction_id = p.id
    WHERE ot.status IN ('pending', 'retry')
      AND ot.not_before_time <= ?1
    ORDER BY ot.not_before_time ASC
    LIMIT ?2
  `).bind(new Date().toISOString(), limit).all<DueTargetRow>();
  return result.results;
}

async function bookPaperClose(
  env: Env,
  target: DueTargetRow,
  actualBarTime: string,
  exitPrice: number,
) {
  if (
    !target.paper_order_id ||
    target.paper_order_status !== "filled" ||
    target.paper_fill_price === null
  ) {
    return null;
  }

  const realizedPnlUsd = (exitPrice - target.paper_fill_price) * 100;
  const closeDate = actualBarTime.slice(0, 10);

  await env.DB.prepare(`
    INSERT OR IGNORE INTO daily_risk_state(trading_date) VALUES(?1)
  `).bind(closeDate).run();

  const update = await env.DB.prepare(`
    UPDATE paper_orders SET
      status = 'closed',
      exit_target_time = ?2,
      closed_at = ?3,
      exit_price = ?4,
      realized_pnl_usd = ?5,
      exit_method = 'historical_trade_bar_close'
    WHERE id = ?1 AND status = 'filled'
  `).bind(
    target.paper_order_id,
    target.target_time,
    actualBarTime,
    exitPrice,
    realizedPnlUsd,
  ).run();

  if ((update.meta.changes ?? 0) > 0) {
    await env.DB.prepare(`
      UPDATE daily_risk_state SET
        realized_pnl_usd = realized_pnl_usd + ?2,
        updated_at = CURRENT_TIMESTAMP
      WHERE trading_date = ?1
    `).bind(closeDate, realizedPnlUsd).run();
  }

  return {
    order_id: target.paper_order_id,
    exit_price: exitPrice,
    realized_pnl_usd: realizedPnlUsd,
    exit_method: "historical_trade_bar_close",
    risk_date: closeDate,
  };
}

export async function collectDueOutcomes(env: AlpacaEnv, limit = 20) {
  const targets = await dueTargets(env, Math.max(1, Math.min(limit, 100)));
  const results: Array<Record<string, unknown>> = [];

  for (const target of targets) {
    try {
      await env.DB.prepare(`
        UPDATE outcome_targets
        SET attempts = attempts + 1, last_attempt_at = ?2, last_error = NULL
        WHERE id = ?1
      `).bind(target.target_id, new Date().toISOString()).run();

      const stockBar = await stockBarAtOrAfter(env, target.ticker, target.target_time);
      const optionBar = target.contract_symbol
        ? await optionBarAtOrAfter(env, target.contract_symbol, target.target_time)
        : null;

      if (!stockBar) throw new Error("no stock bar was available at or after the target time");
      if (target.contract_symbol && !optionBar) {
        throw new Error("no option bar was available at or after the target time");
      }

      const targetMs = new Date(target.target_time).getTime();
      const actualBarTime = optionBar?.t ?? stockBar.t;
      const lagMinutes = (new Date(actualBarTime).getTime() - targetMs) / 60_000;

      const outcome = await recordOutcome(env, {
        prediction_id: target.prediction_id,
        horizon_label: target.horizon_label,
        target_time: target.target_time,
        observed_at: actualBarTime,
        underlying_exit_price: stockBar.c,
        ...(optionBar ? { option_exit_mid: optionBar.c } : {}),
        metadata: {
          collector: "alpaca-historical-bars-v0.1",
          target_time: target.target_time,
          stock_bar_time: stockBar.t,
          option_bar_time: optionBar?.t ?? null,
          lag_minutes: lagMinutes,
          option_reference_type: optionBar ? "1Min_trade_bar_close" : null,
          execution_grade: false,
          note: "Option historical bar close is a trade-price reference, not a bid/ask executable exit. Live proof must use execution-grade quotes or broker fills.",
        },
      });

      let paperClose: Record<string, unknown> | null = null;
      if (target.horizon_label === "predicted_elapsed" && optionBar) {
        paperClose = await bookPaperClose(env, target, actualBarTime, optionBar.c);
      }

      await env.DB.prepare(`
        UPDATE outcome_targets SET
          status = 'measured',
          measured_at = ?2,
          last_error = NULL
        WHERE id = ?1
      `).bind(target.target_id, new Date().toISOString()).run();

      results.push({
        target_id: target.target_id,
        prediction_id: target.prediction_id,
        horizon_label: target.horizon_label,
        status: "measured",
        outcome,
        paper_close: paperClose,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await env.DB.prepare(`
        UPDATE outcome_targets SET
          status = CASE WHEN attempts >= 8 THEN 'failed' ELSE 'retry' END,
          last_error = ?2,
          not_before_time = ?3
        WHERE id = ?1
      `).bind(
        target.target_id,
        message,
        addMinutes(new Date().toISOString(), 30),
      ).run();
      results.push({
        target_id: target.target_id,
        prediction_id: target.prediction_id,
        horizon_label: target.horizon_label,
        status: "retry",
        error: message,
      });
    }
  }

  return {
    due_targets: targets.length,
    measured: results.filter((item) => item.status === "measured").length,
    retry_or_failed: results.filter((item) => item.status !== "measured").length,
    results,
  };
}
