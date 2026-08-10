import { runAutonomousPaperCycle, type AutonomousPaperEnv } from "./cycle";
import { getUsMarketClock, paperEntryGate, type AlpacaClock } from "./market";
import { collectDueOutcomes } from "./outcomes";

export { getUsMarketClock, paperEntryGate } from "./market";

export interface ScheduledTickSummary {
  timestamp: string;
  outcome_collection: Awaited<ReturnType<typeof collectDueOutcomes>> | null;
  market_clock: AlpacaClock | null;
  paper_cycle: Awaited<ReturnType<typeof runAutonomousPaperCycle>> | null;
  new_entries_skipped_reason: string | null;
  errors: string[];
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
