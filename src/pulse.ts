import { ingestEvent } from "./engine";

export type PulseEnv = Env & {
  PULSE_API_ORIGIN?: string;
  PULSE_API_TOKEN?: string;
  PULSE_DB?: D1Database;
};

export interface PulseSyncInput {
  hours?: number;
  limit?: number;
  symbols?: string[];
}

export interface PulseTrend {
  symbol: string;
  asset_type: "stock" | "crypto" | string;
  mentions_now: number;
  mentions_previous: number;
  mentions_per_minute: number;
  growth_pct: number | null;
  sentiment_now: number;
  sentiment_previous: number;
  sentiment_shift: number;
  subreddit_count: number;
  engagement_total: number;
  engagement_average: number;
  smart_score: number;
  alert_level: "high" | "watch" | null;
  alert_reason: string;
}

interface PulseTrendsResponse {
  hours: number;
  items: PulseTrend[];
  alert: PulseTrend | null;
}

interface PulseAggregateRow {
  symbol: string;
  mentions_now: number;
  mentions_previous: number;
  sentiment_now: number | null;
  sentiment_previous: number | null;
  subreddit_count: number;
  engagement_total: number;
  engagement_average: number | null;
}

const DEFAULT_PULSE_ORIGIN = "https://redditpulse-v0.aphexflip.workers.dev";
const PULSE_D1_SOURCE = "cloudflare-d1:redditpulse-db";
const CRYPTO_SYMBOLS = new Set([
  "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "LTC", "BCH",
  "DOT", "SHIB", "UNI", "ATOM", "XLM", "ETC", "NEAR", "APT", "ARB", "OP",
  "SUI", "AAVE", "FIL", "ICP", "HBAR", "ALGO", "MKR", "PEPE", "BONK", "TRX",
]);

const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sentimentDirection(value: number): "bullish" | "bearish" | "neutral" {
  if (value >= 0.08) return "bullish";
  if (value <= -0.08) return "bearish";
  return "neutral";
}

function attentionScore(trend: PulseTrend): number {
  const mentionsPerMinute = Math.max(0, finite(trend.mentions_per_minute));
  const mentionComponent = clamp(Math.log1p(mentionsPerMinute) / Math.log(6));
  const spreadComponent = clamp(Math.max(0, finite(trend.subreddit_count)) / 5);
  const sampleComponent = clamp(Math.max(0, finite(trend.mentions_now)) / 20);
  return clamp((0.50 * mentionComponent) + (0.25 * spreadComponent) + (0.25 * sampleComponent));
}

function sampleConfidence(trend: PulseTrend): number {
  const mentions = Math.max(0, finite(trend.mentions_now));
  const subreddits = Math.max(0, finite(trend.subreddit_count));
  return clamp(0.30 + (0.45 * clamp(mentions / 20)) + (0.25 * clamp(subreddits / 4)));
}

function derivedSmartScore(input: {
  mentionsNow: number;
  mentionsPrevious: number;
  mentionsPerMinute: number;
  subredditCount: number;
  sentimentNow: number;
  engagementAverage: number;
}): number {
  const mentionComponent = clamp(Math.log1p(Math.max(0, input.mentionsPerMinute)) / Math.log(6));
  const spreadComponent = clamp(Math.max(0, input.subredditCount) / 5);
  const sampleComponent = clamp(Math.max(0, input.mentionsNow) / 20);
  const growth = input.mentionsPrevious > 0
    ? Math.abs((input.mentionsNow - input.mentionsPrevious) / input.mentionsPrevious)
    : input.mentionsNow > 0 ? 1 : 0;
  const growthComponent = clamp(growth / 3);
  const sentimentComponent = clamp(Math.abs(input.sentimentNow));
  const engagementComponent = clamp(Math.log1p(Math.max(0, input.engagementAverage)) / Math.log(101));

  return Math.round(1000 * clamp(
    (0.35 * mentionComponent) +
    (0.20 * spreadComponent) +
    (0.15 * sampleComponent) +
    (0.10 * growthComponent) +
    (0.10 * sentimentComponent) +
    (0.10 * engagementComponent),
  )) / 10;
}

function aggregateToTrend(row: PulseAggregateRow, hours: number): PulseTrend {
  const symbol = row.symbol.trim().toUpperCase();
  const mentionsNow = Math.max(0, finite(row.mentions_now));
  const mentionsPrevious = Math.max(0, finite(row.mentions_previous));
  const sentimentNow = clamp(finite(row.sentiment_now), -1, 1);
  const sentimentPrevious = clamp(finite(row.sentiment_previous), -1, 1);
  const subredditCount = Math.max(0, finite(row.subreddit_count));
  const engagementTotal = finite(row.engagement_total);
  const engagementAverage = finite(row.engagement_average);
  const mentionsPerMinute = mentionsNow / Math.max(1, hours * 60);
  const growthPct = mentionsPrevious > 0
    ? ((mentionsNow - mentionsPrevious) / mentionsPrevious) * 100
    : null;
  const sentimentShift = sentimentNow - sentimentPrevious;
  const smartScore = derivedSmartScore({
    mentionsNow,
    mentionsPrevious,
    mentionsPerMinute,
    subredditCount,
    sentimentNow,
    engagementAverage,
  });
  const alertLevel: "high" | "watch" | null = smartScore >= 75
    ? "high"
    : smartScore >= 50 ? "watch" : null;

  return {
    symbol,
    asset_type: CRYPTO_SYMBOLS.has(symbol) ? "crypto" : "stock",
    mentions_now: mentionsNow,
    mentions_previous: mentionsPrevious,
    mentions_per_minute: mentionsPerMinute,
    growth_pct: growthPct,
    sentiment_now: sentimentNow,
    sentiment_previous: sentimentPrevious,
    sentiment_shift: sentimentShift,
    subreddit_count: subredditCount,
    engagement_total: engagementTotal,
    engagement_average: engagementAverage,
    smart_score: smartScore,
    alert_level: alertLevel,
    alert_reason: alertLevel
      ? `${symbol} has elevated Reddit attention in the current ${hours}h window`
      : `${symbol} Reddit trend derived from live Pulse D1 evidence`,
  };
}

async function fetchPulseTrendsFromD1(env: PulseEnv, hours: number, limit: number): Promise<PulseTrendsResponse> {
  if (!env.PULSE_DB) throw new Error("PULSE_DB binding is not configured");

  const nowEpoch = Math.floor(Date.now() / 1000);
  const currentStart = nowEpoch - (hours * 60 * 60);
  const previousStart = currentStart - (hours * 60 * 60);

  const query = await env.PULSE_DB.prepare(`
    SELECT
      m.symbol AS symbol,
      SUM(CASE WHEN c.created_utc >= ?1 THEN 1 ELSE 0 END) AS mentions_now,
      SUM(CASE WHEN c.created_utc >= ?2 AND c.created_utc < ?1 THEN 1 ELSE 0 END) AS mentions_previous,
      AVG(CASE WHEN c.created_utc >= ?1 THEN c.sentiment_score END) AS sentiment_now,
      AVG(CASE WHEN c.created_utc >= ?2 AND c.created_utc < ?1 THEN c.sentiment_score END) AS sentiment_previous,
      COUNT(DISTINCT CASE WHEN c.created_utc >= ?1 THEN c.subreddit END) AS subreddit_count,
      SUM(CASE WHEN c.created_utc >= ?1 THEN c.score ELSE 0 END) AS engagement_total,
      AVG(CASE WHEN c.created_utc >= ?1 THEN c.score END) AS engagement_average
    FROM mentions m
    JOIN comments c ON c.id = m.comment_id
    WHERE c.created_utc >= ?2
    GROUP BY m.symbol
    HAVING SUM(CASE WHEN c.created_utc >= ?1 THEN 1 ELSE 0 END) > 0
    ORDER BY mentions_now DESC, subreddit_count DESC
    LIMIT ?3
  `).bind(currentStart, previousStart, limit).all<PulseAggregateRow>();

  const items = query.results
    .map((row) => aggregateToTrend(row, hours))
    .sort((a, b) => b.smart_score - a.smart_score);

  return {
    hours,
    items,
    alert: items.find((item) => item.alert_level === "high") ?? items.find((item) => item.alert_level === "watch") ?? null,
  };
}

function configuredOrigin(env: PulseEnv): string {
  const raw = (env.PULSE_API_ORIGIN || DEFAULT_PULSE_ORIGIN).trim().replace(/\/$/, "");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("PULSE_API_ORIGIN must use https");
  if (url.pathname !== "/" && url.pathname !== "") throw new Error("PULSE_API_ORIGIN must be an origin without a path");
  return url.origin;
}

async function fetchPulseTrendsFromHttp(env: PulseEnv, hours: number): Promise<{ payload: PulseTrendsResponse; url: string }> {
  const origin = configuredOrigin(env);
  const url = `${origin}/api/trends?hours=${hours}`;
  const headers = new Headers({ accept: "application/json" });
  if (env.PULSE_API_TOKEN?.trim()) headers.set("Authorization", `Bearer ${env.PULSE_API_TOKEN}`);

  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Pulse trends request failed with HTTP ${response.status}`);
  const payload = await response.json() as PulseTrendsResponse;
  if (!Array.isArray(payload.items)) throw new Error("Pulse trends response did not contain an items array");
  return { payload, url };
}

export function pulseTrendSignals(trend: PulseTrend) {
  const attention = attentionScore(trend);
  const confidence = sampleConfidence(trend);
  const sentimentNow = clamp(finite(trend.sentiment_now), -1, 1);
  const sentimentShift = clamp(finite(trend.sentiment_shift), -1, 1);
  const growth = trend.growth_pct === null ? 0 : finite(trend.growth_pct);
  const growthStrength = clamp(Math.abs(growth) / 300);
  const engagement = Math.max(0, finite(trend.engagement_average));
  const engagementStrength = clamp(Math.log1p(engagement) / Math.log(101));

  return [
    {
      signal_type: "reddit_sentiment_now",
      numeric_value: sentimentNow,
      normalized_value: clamp(Math.abs(sentimentNow) * (0.35 + 0.65 * attention)),
      baseline_value: 0,
      unit: "sentiment",
      direction_hint: sentimentDirection(sentimentNow),
      confidence,
      metadata: { attention_score: attention, mentions_now: trend.mentions_now },
    },
    {
      signal_type: "reddit_sentiment_shift",
      numeric_value: sentimentShift,
      normalized_value: clamp(Math.abs(sentimentShift) * (0.35 + 0.65 * attention)),
      baseline_value: 0,
      unit: "sentiment_delta",
      direction_hint: sentimentDirection(sentimentShift),
      confidence: clamp(confidence * 0.90),
      metadata: {
        sentiment_previous: trend.sentiment_previous,
        sentiment_now: trend.sentiment_now,
      },
    },
    {
      signal_type: "reddit_mention_velocity",
      numeric_value: Math.max(0, finite(trend.mentions_per_minute)),
      normalized_value: attention,
      baseline_value: Math.max(0, finite(trend.mentions_previous)),
      unit: "mentions_per_minute",
      direction_hint: "neutral" as const,
      confidence,
      metadata: {
        mentions_now: trend.mentions_now,
        mentions_previous: trend.mentions_previous,
      },
    },
    {
      signal_type: "reddit_growth_acceleration",
      numeric_value: growth,
      normalized_value: growthStrength,
      baseline_value: 0,
      unit: "percent",
      direction_hint: "neutral" as const,
      confidence: clamp(confidence * 0.85),
      metadata: { growth_pct: trend.growth_pct },
    },
    {
      signal_type: "reddit_subreddit_spread",
      numeric_value: Math.max(0, finite(trend.subreddit_count)),
      normalized_value: clamp(Math.max(0, finite(trend.subreddit_count)) / 5),
      baseline_value: 0,
      unit: "subreddits",
      direction_hint: "neutral" as const,
      confidence,
      metadata: {},
    },
    {
      signal_type: "reddit_engagement",
      numeric_value: engagement,
      normalized_value: engagementStrength,
      baseline_value: 0,
      unit: "average_score",
      direction_hint: "neutral" as const,
      confidence: clamp(confidence * 0.80),
      metadata: { engagement_total: trend.engagement_total },
    },
  ];
}

async function alreadyIngested(env: Env, sourceEventId: string): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT id FROM raw_events
    WHERE source_id = 'source:pulse-markets' AND source_event_id = ?1
    LIMIT 1
  `).bind(sourceEventId).first<{ id: string }>();
  return Boolean(row?.id);
}

export async function syncPulseTrends(env: PulseEnv, input: PulseSyncInput = {}) {
  const hours = Math.max(1, Math.min(input.hours ?? 1, 24));
  const limit = Math.max(1, Math.min(input.limit ?? 50, 250));
  const symbolFilter = input.symbols?.length
    ? new Set(input.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))
    : null;

  let payload: PulseTrendsResponse;
  let source = PULSE_D1_SOURCE;
  let canonicalUrl: string | undefined;
  let sourceMode: "d1" | "http" = "d1";
  let fallbackWarning: string | null = null;

  try {
    payload = await fetchPulseTrendsFromD1(env, hours, limit);
  } catch (d1Error) {
    const http = await fetchPulseTrendsFromHttp(env, hours);
    payload = http.payload;
    source = configuredOrigin(env);
    canonicalUrl = http.url;
    sourceMode = "http";
    fallbackWarning = `Direct Pulse D1 read failed; used HTTP fallback: ${d1Error instanceof Error ? d1Error.message : String(d1Error)}`;
  }

  const now = new Date();
  const eventTime = now.toISOString();
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const trends = payload.items
    .filter((trend) => trend.asset_type === "stock")
    .filter((trend) => !symbolFilter || symbolFilter.has(trend.symbol.trim().toUpperCase()))
    .sort((a, b) => finite(b.smart_score) - finite(a.smart_score))
    .slice(0, limit);

  const results: Array<{
    ticker: string;
    status: "ingested" | "duplicate";
    event_id?: string;
    smart_score: number;
  }> = [];

  for (const trend of trends) {
    const ticker = trend.symbol.trim().toUpperCase();
    if (!ticker) continue;
    const sourceEventId = `pulse-trend:${hours}h:${ticker}:${minuteBucket}`;
    if (await alreadyIngested(env, sourceEventId)) {
      results.push({ ticker, status: "duplicate", smart_score: finite(trend.smart_score) });
      continue;
    }

    const ingested = await ingestEvent(env, {
      source: {
        id: "source:pulse-markets",
        source_type: "reddit_aggregate",
        name: "Pulse Markets",
        provider: sourceMode === "d1" ? "redditpulse-d1" : "redditpulse-v0",
        reliability_prior: 0.60,
      },
      source_event_id: sourceEventId,
      event_type: "reddit_trend_snapshot",
      event_time: eventTime,
      ...(canonicalUrl ? { canonical_url: canonicalUrl } : {}),
      title: `${ticker} Reddit trend snapshot`,
      summary: trend.alert_reason || `${ticker} aggregate Reddit market discussion snapshot`,
      ticker,
      signals: pulseTrendSignals(trend),
      metadata: {
        hours: payload.hours,
        pulse_trend: trend,
        source_mode: sourceMode,
        normalization_version: sourceMode === "d1" ? "pulse-d1-trend-v0.1" : "pulse-trend-v0.1",
        note: "Attention/growth are non-directional. Direction comes only from sentiment level/shift and remains heuristic until calibrated against outcomes.",
      },
    });

    results.push({
      ticker,
      status: "ingested",
      event_id: ingested.event_id,
      smart_score: finite(trend.smart_score),
    });
  }

  return {
    source,
    source_mode: sourceMode,
    hours: payload.hours,
    checked_stock_trends: trends.length,
    ingested: results.filter((item) => item.status === "ingested").length,
    duplicates: results.filter((item) => item.status === "duplicate").length,
    results,
    fallback_warning: fallbackWarning,
    warning: "Pulse trend normalization is a versioned heuristic feature set, not a proven trading signal. The outcome ledger must determine whether it adds predictive value.",
  };
}
