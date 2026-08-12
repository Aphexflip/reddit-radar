import { describe, expect, it } from "vitest";
import { decideOpportunity, scoreSignals, type OptionCandidate, type SignalForScoring } from "../src/scoring";

const now = "2026-08-10T20:00:00.000Z";

function signal(
  id: string,
  direction_hint: "bullish" | "bearish",
  strength: number,
  confidence = 0.9,
  signalType = id,
  observedAt = now,
): SignalForScoring {
  return {
    id,
    signal_type: signalType,
    observed_at: observedAt,
    normalized_value: strength,
    direction_hint,
    confidence,
  };
}

function option(overrides: Partial<OptionCandidate> = {}): OptionCandidate {
  return {
    contract_symbol: "XYZ260904C00100000",
    option_type: "call",
    strike: 100,
    expiration_date: "2026-09-04",
    observed_at: now,
    provider: "test",
    underlying_price: 95,
    bid: 0.90,
    ask: 1.00,
    mark: 0.95,
    volume: 350,
    open_interest: 2400,
    implied_volatility: 0.48,
    delta: 0.36,
    gamma: 0.03,
    theta: -0.04,
    vega: 0.08,
    ...overrides,
  };
}

describe("signal scoring", () => {
  it("produces a strong bullish score from independent bullish evidence", () => {
    const result = scoreSignals([
      signal("a", "bullish", 0.9),
      signal("b", "bullish", 0.8, 0.85),
      signal("c", "bullish", 0.7, 0.8),
      signal("d", "bearish", 0.2, 0.5),
    ]);

    expect(result.directionalScore).toBeGreaterThan(0.45);
    expect(result.opportunityScore).toBeGreaterThan(0.60);
    expect(result.bullishSignalIds).toHaveLength(3);
    expect(result.effectiveSignalCount).toBe(4);
  });

  it("does not let neutral context dilute a directional signal", () => {
    const base = scoreSignals([
      signal("bull", "bullish", 0.70, 0.90),
    ]);
    const withContext = scoreSignals([
      signal("bull", "bullish", 0.70, 0.90),
      {
        id: "velocity",
        signal_type: "reddit_mention_velocity",
        observed_at: now,
        normalized_value: 1,
        direction_hint: "neutral",
        confidence: 1,
      },
      {
        id: "spread",
        signal_type: "reddit_subreddit_spread",
        observed_at: now,
        normalized_value: 1,
        direction_hint: "neutral",
        confidence: 1,
      },
    ]);

    expect(withContext.directionalScore).toBeCloseTo(base.directionalScore, 8);
    expect(withContext.dataQuality).toBeGreaterThan(base.dataQuality);
  });

  it("uses only the newest observation for a repeated feature type", () => {
    const result = scoreSignals([
      signal("old-bull", "bullish", 1, 1, "market_intraday_return", "2026-08-10T19:30:00.000Z"),
      signal("new-bear", "bearish", 0.8, 1, "market_intraday_return", "2026-08-10T20:00:00.000Z"),
    ]);

    expect(result.rawSignalCount).toBe(2);
    expect(result.effectiveSignalCount).toBe(1);
    expect(result.bearishSignalIds).toEqual(["new-bear"]);
    expect(result.bullishSignalIds).toEqual([]);
    expect(result.directionalScore).toBeLessThan(-0.7);
  });

  it("does not manufacture data quality by polling one feature repeatedly", () => {
    const repeated = Array.from({ length: 20 }, (_, index) =>
      signal(
        `repeat-${index}`,
        "bullish",
        0.7,
        0.9,
        "reddit_sentiment_now",
        new Date(Date.parse(now) - ((19 - index) * 60_000)).toISOString(),
      ));
    const repeatedScore = scoreSignals(repeated);
    const singleScore = scoreSignals([repeated[19]!]);

    expect(repeatedScore.effectiveSignalCount).toBe(1);
    expect(repeatedScore.dataQuality).toBeCloseTo(singleScore.dataQuality, 8);
    expect(repeatedScore.opportunityScore).toBeCloseTo(singleScore.opportunityScore, 8);
  });

  it("passes on weak conflicting evidence", () => {
    const result = decideOpportunity([
      signal("a", "bullish", 0.25, 0.6),
      signal("b", "bearish", 0.25, 0.6),
    ], [option()], now);

    expect(result.recommendation).toBe("PASS");
  });
});

describe("option selection", () => {
  it("selects a liquid call for a strong bullish thesis", () => {
    const result = decideOpportunity([
      signal("a", "bullish", 0.95),
      signal("b", "bullish", 0.85),
      signal("c", "bullish", 0.80),
      signal("d", "bullish", 0.70),
    ], [option()], now);

    expect(result.recommendation).toBe("CALL");
    expect(result.selectedOption?.option.contract_symbol).toBe("XYZ260904C00100000");
    expect(result.estimatedEvScore).toBeGreaterThan(0.5);
  });

  it("returns PASS instead of forcing a bad illiquid option", () => {
    const result = decideOpportunity([
      signal("a", "bullish", 0.95),
      signal("b", "bullish", 0.85),
      signal("c", "bullish", 0.80),
      signal("d", "bullish", 0.70),
    ], [option({ bid: 0.20, ask: 1.00, open_interest: 2, volume: 0 })], now);

    expect(result.direction).toBe("bullish");
    expect(result.recommendation).toBe("PASS");
    expect(result.reasons.join(" ")).toContain("good stock thesis");
  });

  it("selects a put for bearish evidence", () => {
    const result = decideOpportunity([
      signal("a", "bearish", 0.95),
      signal("b", "bearish", 0.85),
      signal("c", "bearish", 0.80),
      signal("d", "bearish", 0.75),
    ], [option({ contract_symbol: "XYZ260904P00090000", option_type: "put", strike: 90, delta: -0.34 })], now);

    expect(result.recommendation).toBe("PUT");
    expect(result.selectedOption?.option.option_type).toBe("put");
  });
});
