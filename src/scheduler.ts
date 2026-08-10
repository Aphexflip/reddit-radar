import type { AlpacaEnv } from "./alpaca";
import { runAutonomousPaperCycle, type AutonomousPaperEnv } from "./cycle";
import { collectDueOutcomes } from "./outcomes";

interface AlpacaClock {
  timestamp?: string;
  is_open?: boolean;
  next_open?: string;
  next_close?: string;
}

export interface ScheduledTickSummary {
  timestamp: string;
  outcome_collection: Awaited<ReturnType<typeof collectDueOutcomes>> | null;
  market_clock: AlpacaClock | null;
  paper_cycle: Awaited<ReturnType<typeof runAutonomousPaperCycle>> | null;
  new_entries_skipped_reason: string | null;
  errors: string[];
}

function authHeaders(env: AlpacaEnv): HeadersInit {
  if (!env.ALPACA_API_KEY_ID?.trim() || !env.ALPACA_API_SECRET_KEY?.trim()) {
    throw new Error("Alpaca credentials are required for scheduled market checks");
  }
  return {
    "APCA-API-KEY-ID": env.ALPACA_API_KEY_ID,
    "APCA-API-SECRET-KEY": env.ALPACA_API_SECRET_KEY,
    "Accept": "application/json",
  };
}

export async function getUsMarketClock(env: AlpacaEnv): Promise<AlpacaClock> {
  const response = await fetch("https://paper-api.alpaca.markets/v2/clock", {
    headers: authHeaders(env),
  });
  if (!response.ok) {
    throw new Error(`Alpaca market clock failed with HTTP ${response.status}`);
  }
  const payload = await response.json() as AlpacaClock;
  if (typeof payload.is_open !== "boolean") {
    throw new Error("Alpaca market clock response did not contain is_open");
  }
  return payload;
}

function minutesUntil(iso: string | undefined, from = Date.now()): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  return (target - from) / 60_000;
}

export function paperEntryGate(clock: AlpacaClock, nowMs = Date.now()): {
  allowed: boolean;
  reason: string | null;
} {
  if (!clock.is_open) {
    return { allowed: false, reason: "US market is closed according to Alpaca market clock" };
  }

  const minutesToClose = minutesUntil(clock.next_close, nowMs);
  if (minutesToClose !== null && minutesToClose < 30) {
    return { allowed: false, reason: "less than 30 minutes remain before the regular market close" };
  }

  return { allowed: true, reason: null };
}

export async function runScheduledPaperTick(
  env: AutonomousPaperEnv,
): Promise<ScheduledTickSummary> {
  const errors: string[] = [];
  let outcomeCollection: Awaited<ReturnType<typeof collectDueOutcomes>> | null = null;
  let marketClock: AlpacaClock | null = null;
  let paperCycle: Awaited<ReturnType<typeof runAutonomousPaperCycle>> | null = null;
  let newEntriesSkippedReason: string | null = null;

  try {
    outcomeCollection = await collectDueOutcomes(env, 50);
  } catch (error) {
    errors.push(`outcome collection: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    marketClock = await getUsMarketClock(env);
    const gate = paperEntryGate(marketClock);
    if (!gate.allowed) {
      newEntriesSkippedReason = gate.reason;
    } else if (env.EXECUTION_MODE !== "paper") {
      newEntriesSkippedReason = "EXECUTION_MODE is not paper";
    } else {
      paperCycle = await runAutonomousPaperCycle(env, {
        pulse_hours: 1,
        trend_limit: 25,
        candidate_limit: 10,
        prediction_horizon_minutes: 1_440,
        signal_lookback_hours: 6,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`market/cycle: ${message}`);
    newEntriesSkippedReason = `market state uncertain: ${message}`;
  }

  return {
    timestamp: new Date().toISOString(),
    outcome_collection: outcomeCollection,
    market_clock: marketClock,
    paper_cycle: paperCycle,
    new_entries_skipped_reason: newEntriesSkippedReason,
    errors,
  };
}
