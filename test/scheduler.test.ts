import { describe, expect, it } from "vitest";
import { paperEntryGate } from "../src/scheduler";

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
    expect(result.reason).toContain("less than 30 minutes");
  });
});
