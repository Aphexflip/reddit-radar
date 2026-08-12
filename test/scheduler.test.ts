import { describe, expect, it } from "vitest";
import { decisionCycleDue, paperEntryGate } from "../src/scheduler";

describe("scheduled paper entry gate", () => {
  it("blocks new entries when the market is closed", () => {
    expect(paperEntryGate({
      is_open: false,
      next_open: "2026-08-11T13:30:00Z",
      next_close: "2026-08-11T20:00:00Z",
    }, Date.parse("2026-08-10T21:00:00Z"))).toEqual({
      allowed: false,
      reason: "US market is closed according to Alpaca market clock",
    });
  });

  it("allows paper entries with sufficient time before close", () => {
    expect(paperEntryGate({
      is_open: true,
      next_close: "2026-08-10T20:00:00Z",
    }, Date.parse("2026-08-10T18:00:00Z"))).toEqual({ allowed: true, reason: null });
  });

  it("blocks new entries in the final 30 minutes", () => {
    const result = paperEntryGate({
      is_open: true,
      next_close: "2026-08-10T20:00:00Z",
    }, Date.parse("2026-08-10T19:45:00Z"));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("30 minutes or less");
  });

  it("blocks the exact 30-minute boundary", () => {
    expect(paperEntryGate({
      is_open: true,
      next_close: "2026-08-11T20:00:00Z",
    }, Date.parse("2026-08-11T19:30:00Z"))).toEqual({
      allowed: false,
      reason: "30 minutes or less remain before the regular market close",
    });
  });
});

describe("decision cadence", () => {
  const now = Date.parse("2026-08-12T14:00:00.000Z");

  it("runs when there has never been a decision cycle", () => {
    expect(decisionCycleDue(null, now)).toBe(true);
  });

  it("keeps a 5-minute heartbeat from creating a new full prediction cycle", () => {
    expect(decisionCycleDue("2026-08-12T13:55:00.000Z", now)).toBe(false);
  });

  it("allows a new full cycle after the cadence window", () => {
    expect(decisionCycleDue("2026-08-12T13:45:00.000Z", now)).toBe(true);
  });
});
