import { describe, expect, it } from "vitest";
import { evaluatePaperPolicy, type PaperDecisionInput } from "../src/paper";

function decision(overrides: Partial<PaperDecisionInput> = {}) {
  return evaluatePaperPolicy({
    debitUsd: 40,
    estimatedEvScore: 0.65,
    policy: {
      dailyTargetUsd: 50,
      dailyHardCapUsd: 100,
      maxSingleTradeUsd: 100,
      dailyLossStopUsd: 40,
      minOpportunityScore: 0.60,
      exceptionalOpportunityScore: 0.75,
    },
    risk: {
      deployedUsd: 0,
      realizedPnlUsd: 0,
      newPositionsBlocked: false,
    },
    ...overrides,
  });
}

describe("tiered paper execution policy", () => {
  it("allows a normal qualifying trade inside the first $50", () => {
    expect(decision()).toMatchObject({ status: "eligible_normal", tier: "normal" });
  });

  it("requires a stronger score to use the $50-$100 exceptional tier", () => {
    expect(decision({
      debitUsd: 40,
      estimatedEvScore: 0.70,
      risk: { deployedUsd: 30, realizedPnlUsd: 0, newPositionsBlocked: false },
    })).toMatchObject({ status: "blocked" });

    expect(decision({
      debitUsd: 40,
      estimatedEvScore: 0.82,
      risk: { deployedUsd: 30, realizedPnlUsd: 0, newPositionsBlocked: false },
    })).toMatchObject({ status: "eligible_exceptional", tier: "exceptional" });
  });

  it("requires user escalation above the $100 daily hard cap", () => {
    expect(decision({
      debitUsd: 40,
      estimatedEvScore: 0.95,
      risk: { deployedUsd: 80, realizedPnlUsd: 0, newPositionsBlocked: false },
    })).toMatchObject({ status: "requires_escalation", tier: "escalation" });
  });

  it("requires user escalation when one contract costs more than the autonomous single-trade max", () => {
    expect(decision({ debitUsd: 125, estimatedEvScore: 0.95 }))
      .toMatchObject({ status: "requires_escalation" });
  });

  it("blocks new risk at the daily realized-loss stop", () => {
    expect(decision({
      estimatedEvScore: 0.95,
      risk: { deployedUsd: 0, realizedPnlUsd: -40, newPositionsBlocked: false },
    })).toMatchObject({ status: "blocked", reason: "daily loss stop reached" });
  });

  it("never lets a low-score trade through merely because budget remains", () => {
    expect(decision({ estimatedEvScore: 0.45 }))
      .toMatchObject({ status: "blocked" });
  });
});
