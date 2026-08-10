import { describe, expect, it } from "vitest";
import { pulseTrendSignals, type PulseTrend } from "../src/pulse";

function trend(overrides: Partial<PulseTrend> = {}): PulseTrend {
  return {
    symbol: "XYZ",
    asset_type: "stock",
    mentions_now: 30,
    mentions_previous: 10,
    mentions_per_minute: 2.5,
    growth_pct: 200,
    sentiment_now: 0.55,
    sentiment_previous: 0.15,
    sentiment_shift: 0.40,
    subreddit_count: 4,
    engagement_total: 400,
    engagement_average: 13.3,
    smart_score: 88,
    alert_level: "high",
    alert_reason: "surging",
    ...overrides,
  };
}

describe("Pulse trend normalization", () => {
  it("uses sentiment for direction while treating attention as neutral", () => {
    const signals = pulseTrendSignals(trend());
    const now = signals.find((signal) => signal.signal_type === "reddit_sentiment_now");
    const velocity = signals.find((signal) => signal.signal_type === "reddit_mention_velocity");

    expect(now?.direction_hint).toBe("bullish");
    expect(now?.normalized_value).toBeGreaterThan(0);
    expect(velocity?.direction_hint).toBe("neutral");
  });

  it("marks negative Reddit sentiment as bearish", () => {
    const signals = pulseTrendSignals(trend({ sentiment_now: -0.60, sentiment_shift: -0.35 }));
    expect(signals.find((signal) => signal.signal_type === "reddit_sentiment_now")?.direction_hint).toBe("bearish");
    expect(signals.find((signal) => signal.signal_type === "reddit_sentiment_shift")?.direction_hint).toBe("bearish");
  });

  it("does not assign direction to raw growth spikes", () => {
    const signals = pulseTrendSignals(trend({ growth_pct: 900 }));
    expect(signals.find((signal) => signal.signal_type === "reddit_growth_acceleration")?.direction_hint).toBe("neutral");
  });
});
