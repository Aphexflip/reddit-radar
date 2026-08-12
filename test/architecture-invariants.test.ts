import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function filesBelow(relativeDir: string, suffix: string): string[] {
  const start = resolve(ROOT, relativeDir);
  const found: string[] = [];

  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(suffix)) found.push(path);
    }
  }

  walk(start);
  return found;
}

const state = JSON.parse(read("project-state.json")) as {
  canonical_branch: string;
  current_phase: string;
  system_version: string;
  execution_mode: string;
  broker_mode: string;
  next_build: string;
  current_policy: {
    daily_target_usd: number;
    daily_hard_cap_usd: number;
    max_single_trade_usd: number;
    max_open_strategy_risk_usd: number;
    daily_realized_loss_stop_usd: number;
    min_opportunity_score: number;
    exceptional_opportunity_score: number;
    absolute_direction_gate: number;
    max_bid_ask_spread_pct: number;
    min_open_interest: number;
    min_volume: number;
    min_days_to_expiration: number;
    allow_0dte: boolean;
    live_enabled: boolean;
  };
};

const sourceText = filesBelow("src", ".ts")
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

describe("Radar repository continuity contract", () => {
  it("keeps the required recovery files in the repository", () => {
    for (const path of [
      "AGENTS.md",
      "CHATGPT_START_HERE.md",
      "project-state.json",
      "docs/PRODUCT_CONTRACT.md",
      "docs/CURRENT_CHECKPOINT.md",
      "docs/ROADMAP.md",
      "docs/DECISION_LOG.md",
    ]) {
      expect(existsSync(resolve(ROOT, path)), `${path} must exist`).toBe(true);
      expect(read(path).trim().length, `${path} must not be empty`).toBeGreaterThan(20);
    }
  });

  it("keeps machine-readable phase state aligned with deployed Wrangler state", () => {
    const wrangler = read("wrangler.jsonc");
    expect(state.canonical_branch).toBe("agent/v01-options-intelligence-foundation");
    expect(state.current_phase).toBe("autonomous_paper_evidence");
    expect(state.next_build).toBe("execution_market_state_observability");
    expect(wrangler).toContain(`"SYSTEM_VERSION": "${state.system_version}"`);
    expect(wrangler).toContain(`"EXECUTION_MODE": "${state.execution_mode}"`);
    expect(wrangler).toContain(`"BROKER_MODE": "${state.broker_mode}"`);
    expect(wrangler).toContain(`"DAILY_TARGET_USD": "${state.current_policy.daily_target_usd}"`);
    expect(wrangler).toContain(`"DAILY_HARD_CAP_USD": "${state.current_policy.daily_hard_cap_usd}"`);
    expect(wrangler).toContain(`"MAX_SINGLE_TRADE_USD": "${state.current_policy.max_single_trade_usd}"`);
    expect(wrangler).toContain(`"DAILY_LOSS_STOP_USD": "${state.current_policy.daily_realized_loss_stop_usd}"`);
  });

  it("cannot accidentally introduce the Alpaca live-money Trading API in application source", () => {
    expect(state.execution_mode).toBe("paper");
    expect(state.broker_mode).toBe("alpaca_paper");
    expect(sourceText).not.toContain("https://api.alpaca.markets");

    const broker = read("src/broker-alpaca-paper.ts");
    expect(broker).toContain("https://paper-api.alpaca.markets");
    expect(broker).toContain('EXECUTION_MODE !== "paper"');
  });

  it("keeps published predictions append-only in application code", () => {
    expect(sourceText).not.toMatch(/\bUPDATE\s+predictions\b/i);
    expect(sourceText).not.toMatch(/\bDELETE\s+FROM\s+predictions\b/i);
    expect(sourceText).not.toMatch(/\bREPLACE\s+INTO\s+predictions\b/i);
  });

  it("keeps direct Pulse D1 access read-only", () => {
    const pulse = read("src/pulse.ts");
    const statements = [...pulse.matchAll(/PULSE_DB\.prepare\(\s*`([\s\S]*?)`\s*\)/g)]
      .map((match) => (match[1] ?? "").trim());

    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      expect(sql.toUpperCase().startsWith("SELECT"), `Pulse D1 statement must be SELECT-only: ${sql.slice(0, 80)}`).toBe(true);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i);
    }
  });

  it("protects the current standard paper policy from silent later migration changes", () => {
    const baseline = read("migrations/0011_restore_standard_paper_policy.sql");
    const p = state.current_policy;

    for (const fragment of [
      `daily_target_usd = ${p.daily_target_usd}`,
      `daily_hard_cap_usd = ${p.daily_hard_cap_usd}`,
      `max_single_trade_usd = ${p.max_single_trade_usd}`,
      `daily_loss_stop_usd = ${p.daily_realized_loss_stop_usd}`,
      `min_opportunity_score = ${p.min_opportunity_score.toFixed(2)}`,
      `max_bid_ask_spread_pct = ${p.max_bid_ask_spread_pct.toFixed(2)}`,
      `min_open_interest = ${p.min_open_interest}`,
      `min_volume = ${p.min_volume}`,
      `min_days_to_expiration = ${p.min_days_to_expiration}`,
      `allow_0dte = ${p.allow_0dte ? 1 : 0}`,
      `live_enabled = ${p.live_enabled ? 1 : 0}`,
      `exceptional_opportunity_score = ${p.exceptional_opportunity_score.toFixed(2)}`,
      `max_open_risk_usd = ${p.max_open_strategy_risk_usd}`,
    ]) {
      expect(baseline).toContain(fragment);
    }

    const laterPolicyMutations = readdirSync(resolve(ROOT, "migrations"))
      .filter((name: string) => name.endsWith(".sql") && name > "0011_restore_standard_paper_policy.sql")
      .filter((name: string) => /\bexecution_policies\b/i.test(read(`migrations/${name}`)));

    expect(
      laterPolicyMutations,
      "A migration after 0011 changes execution_policies. Update project-state, product contract, decision log, checkpoint, roadmap and this invariant deliberately in the same PR.",
    ).toEqual([]);
  });
});
