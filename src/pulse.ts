import { ingestEvent } from "./engine";

export type PulseEnv = Env & {
  PULSE_API_ORIGIN?: string;
  PULSE_API_TOKEN?: string;
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

const DEFAULT_PULSE_ORIGIN = "https://redditpulse-v0.aphexflip.workers.dev";

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

function configuredOrigin(env: PulseEnv): string {
  const raw = (env.PULSE_API_ORIGIN || DEFAULT_PULSE_ORIGIN).trim().replace(/\/$/, "");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("PULSE_API_ORIGIN must use https");
  if (url.pathname !== "/" && url.pathname !== "") throw new Error("PULSE_API_ORIGIN must be an origin without a path");
  return url.origin;
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
  const origin = configuredOrigin(env);
  const url = `${origin}/api/trends?hours=${hours}`;
  const headers = new Headers({ accept: "application/json" });
  if (env.PULSE_API_TOKEN?.trim()) headers.set("Authorization", `Bearer ${env.PULSE_API_TOKEN}`);

  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Pulse trends request failed with HTTP ${response.status}`);
  const payload = await response.json() as PulseTrendsResponse;
  if (!Array.isArray(payload.items)) throw new Error("Pulse trends response did not contain an items array");

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
        provider: "redditpulse-v0",
        reliability_prior: 0.60,
      },
      source_event_id: sourceEventId,
      event_type: "reddit_trend_snapshot",
      event_time: eventTime,
      canonical_url: url,
      title: `${ticker} Reddit trend snapshot`,
      summary: trend.alert_reason || `${ticker} aggregate Reddit market discussion snapshot`,
      ticker,
      signals: pulseTrendSignals(trend),
      metadata: {
        hours: payload.hours,
        pulse_trend: trend,
        normalization_version: "pulse-trend-v0.1",
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
    source: origin,
    hours: payload.hours,
    checked_stock_trends: trends.length,
    ingested: results.filter((item) => item.status === "ingested").length,
    duplicates: results.filter((item) => item.status === "duplicate").length,
    results,
    warning: "Pulse trend normalization is a versioned heuristic feature set, not a proven trading signal. The outcome ledger must determine whether it adds predictive value.",
  };
}
