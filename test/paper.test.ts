import { describe, expect, it } from "vitest";
import { evaluatePaperPolicy, type PaperPolicyInput, type PaperRiskInput } from "../src/paper";

const basePolicy: PaperPolicyInput = {
  dailyTargetUsd: 50,
  dailyHardCapUsd: 100,
  maxSingleTradeUsd: 100,
  maxOpenRiskUsd: 200,
  dailyLossStopUsd: 40,
  minOpportunityScore: 0.60,
  exceptionalOpportunityScore: 0.75,
};

const baseRisk: PaperRiskInput = {
  deployedUsd: 0,
  openRiskUsd: 0,
  realizedPnlUsd: 0,
  newPositionsBlocked: false,
};

function decision(overrides: {
  debitUsd?: number;
  estimatedEvScore?: number;
  policy?: Partial<PaperPolicyInput>;
  risk?: Partial<PaperRiskInput>;
} = {}) {
  return evaluatePaperPolicy({
    debitUsd: overrides.debitUsd ?? 40,
    estimatedEvScore: overrides.estimatedEvScore ?? 0.65,
    policy: { ...basePolicy, ...overrides.policy },
    risk: { ...baseRisk, ...overrides.risk },
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
      risk: { deployedUsd: 30 },
    })).toMatchObject({ status: "blocked" });

    expect(decision({
      debitUsd: 40,
      estimatedEvScore: 0.82,
      risk: { deployedUsd: 30 },
    })).toMatchObject({ status: "eligible_exceptional", tier: "exceptional" });
  });

  it("requires user escalation above the $100 daily hard cap", () => {
    expect(decision({
      debitUsd: 40,
      estimatedEvScore: 0.95,
      risk: { deployedUsd: 80 },
    })).toMatchObject({ status: "requires_escalation", tier: "escalation" });
  });

  it("requires user escalation when one contract costs more than the autonomous single-trade max", () => {
    expect(decision({ debitUsd: 125, estimatedEvScore: 0.95 }))
      .toMatchObject({ status: "requires_escalation" });
  });

  it("requires user escalation when total open option debit risk would exceed $200", () => {
    expect(decision({
      debitUsd: 60,
      estimatedEvScore: 0.95,
      risk: { openRiskUsd: 160 },
    })).toMatchObject({
      status: "requires_escalation",
      tier: "escalation",
      reason: "total open option debit risk would exceed the autonomous cap; user approval required",
    });
  });

  it("allows a qualifying trade when global open risk remains inside the cap", () => {
    expect(decision({
      debitUsd: 40,
      estimatedEvScore: 0.82,
      risk: { deployedUsd: 30, openRiskUsd: 150 },
    })).toMatchObject({ status: "eligible_exceptional" });
  });

  it("blocks new risk at the daily realized-loss stop", () => {
    expect(decision({
      estimatedEvScore: 0.95,
      risk: { realizedPnlUsd: -40 },
    })).toMatchObject({ status: "blocked", reason: "daily loss stop reached" });
  });

  it("never lets a low-score trade through merely because budget remains", () => {
    expect(decision({ estimatedEvScore: 0.45 }))
      .toMatchObject({ status: "blocked" });
  });
});
