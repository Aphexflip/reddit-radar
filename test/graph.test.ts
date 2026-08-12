import { describe, expect, it } from "vitest";
import { graphEntityId, normalizePredicate } from "../src/graph";

describe("relationship graph identifiers", () => {
  it("keeps US security IDs stable across company names", () => {
    expect(graphEntityId({ ticker: "nvda", name: "NVIDIA Corporation" })).toBe("security:US:NVDA");
    expect(graphEntityId({ ticker: "NVDA", name: "NVIDIA" })).toBe("security:US:NVDA");
  });

  it("creates deterministic non-security entity IDs", () => {
    expect(graphEntityId({ name: "HBM Memory", entity_type: "technology" }))
      .toBe("entity:technology:hbm-memory");
  });

  it("normalizes predicates into typed graph edges", () => {
    expect(normalizePredicate("supplies to")).toBe("SUPPLIES_TO");
    expect(normalizePredicate("regulated-by")).toBe("REGULATED_BY");
  });
});
