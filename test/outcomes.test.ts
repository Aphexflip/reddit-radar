import { describe, expect, it } from "vitest";
import { buildOutcomeTargetSpecs } from "../src/outcomes";

describe("outcome target scheduling", () => {
  const publishedAt = "2026-08-10T20:00:00.000Z";

  it("creates fixed truth checkpoints plus the predicted horizon", () => {
    const targets = buildOutcomeTargetSpecs(publishedAt, 2_880, "indicative");
    expect(targets).toHaveLength(5);
    expect(targets.map((target) => target.horizon_label)).toEqual([
      "30m_elapsed",
      "24h_elapsed",
      "72h_elapsed",
      "120h_elapsed",
      "predicted_elapsed",
    ]);
    expect(targets.find((target) => target.horizon_label === "predicted_elapsed")?.target_time)
      .toBe("2026-08-12T20:00:00.000Z");
  });

  it("waits longer for delayed indicative option data", () => {
    const indicative = buildOutcomeTargetSpecs(publishedAt, 1_440, "indicative")[0]!;
    const opra = buildOutcomeTargetSpecs(publishedAt, 1_440, "opra")[0]!;

    expect(indicative.target_time).toBe(opra.target_time);
    expect(new Date(indicative.not_before_time).getTime() - new Date(indicative.target_time).getTime())
      .toBe(20 * 60_000);
    expect(new Date(opra.not_before_time).getTime() - new Date(opra.target_time).getTime())
      .toBe(2 * 60_000);
  });

  it("enforces a minimum 30-minute predicted horizon", () => {
    const target = buildOutcomeTargetSpecs(publishedAt, 5, "opra")
      .find((item) => item.horizon_label === "predicted_elapsed");
    expect(target?.target_time).toBe("2026-08-10T20:30:00.000Z");
  });
});
