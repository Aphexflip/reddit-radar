import { maintainAlpacaPaperBroker } from "./broker-maintenance";
import { runAutonomousPaperCycle, type AutonomousPaperEnv } from "./cycle";
import { getUsMarketClock, paperEntryGate, type AlpacaClock } from "./market";
import { collectDueOutcomes } from "./outcomes";
import { maintainSystemTestPositions } from "./system-test";

export { getUsMarketClock, paperEntryGate } from "./market";

const MIN_DECISION_INTERVAL_MINUTES = 12;

type LatestCycleRow = {
  started_at: string;
};

export interface ScheduledTickSummary {
  timestamp: string;
  broker_maintenance: Awaited<ReturnType<typeof maintainAlpacaPaperBroker>> | null;
  outcome_collection: Awaited<ReturnType<typeof collectDueOutcomes>> | null;
  system_test_positions: Awaited<ReturnType<typeof maintainSystemTestPositions>> | null;
  market_clock: AlpacaClock | null;
  paper_cycle: Awaited<ReturnType<typeof runAutonomousPaperCycle>> | null;
  decision_cycle_due: boolean;
  decision_cycle_skipped_reason: string | null;
  new_entries_skipped_reason: string | null;
  errors: string[];
}

export function decisionCycleDue(
  lastStartedAt: string | null,
  nowMs = Date.now(),
  minimumMinutes = MIN_DECISION_INTERVAL_MINUTES,
): boolean {
  if (!lastStartedAt) return true;
  const lastMs = Date.parse(lastStartedAt);
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= Math.max(1, minimumMinutes) * 60_000;
}

async function latestDecisionCycleStartedAt(env: AutonomousPaperEnv): Promise<string | null> {
  const row = await env.DB.prepare(`
    SELECT started_at
    FROM paper_cycle_runs
    ORDER BY started_at DESC
    LIMIT 1
  `).first<LatestCycleRow>();
  return row?.started_at ?? null;
}

export async function runScheduledPaperTick(
  env: AutonomousPaperEnv,
): Promise<ScheduledTickSummary> {
  const errors: string[] = [];
  let brokerMaintenance: Awaited<ReturnType<typeof maintainAlpacaPaperBroker>> | null = null;
  let outcomeCollection: Awaited<ReturnType<typeof collectDueOutcomes>> | null = null;
  let systemTestPositions: Awaited<ReturnType<typeof maintainSystemTestPositions>> | null = null;
  let marketClock: AlpacaClock | null = null;
  let paperCycle: Awaited<ReturnType<typeof runAutonomousPaperCycle>> | null = null;
  let decisionDue = false;
  let decisionCycleSkippedReason: string | null = null;
  let newEntriesSkippedReason: string | null = null;

  // Broker reconciliation runs first. In alpaca_paper mode a horizon-due position
  // is moved out of local "filled" state before any historical outcome reference
  // can run, so the old simulator can never masquerade as the broker exit.
  try {
    brokerMaintenance = await maintainAlpacaPaperBroker(env);
  } catch (error) {
    errors.push(`broker maintenance: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Research/reference outcomes remain independent from broker execution proof.
  try {
    outcomeCollection = await collectDueOutcomes(env, 50);
  } catch (error) {
    errors.push(`outcome collection: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    systemTestPositions = await maintainSystemTestPositions(env);
  } catch (error) {
    errors.push(`system test positions: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    marketClock = await getUsMarketClock(env);
    const gate = paperEntryGate(marketClock);
    if (!gate.allowed) {
      newEntriesSkippedReason = gate.reason;
    } else if (env.EXECUTION_MODE !== "paper") {
      newEntriesSkippedReason = "EXECUTION_MODE is not paper";
    } else {
      const lastStartedAt = await latestDecisionCycleStartedAt(env);
      decisionDue = decisionCycleDue(lastStartedAt);
      if (!decisionDue) {
        decisionCycleSkippedReason = "monitoring heartbeat only; full paper decision cycle is still inside its ~15-minute cadence";
      } else {
        paperCycle = await runAutonomousPaperCycle(env, {
          pulse_hours: 1,
          trend_limit: 25,
          candidate_limit: 10,
          prediction_horizon_minutes: 1_440,
          signal_lookback_hours: 6,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`market/cycle: ${message}`);
    newEntriesSkippedReason = `market state uncertain: ${message}`;
  }

  return {
    timestamp: new Date().toISOString(),
    broker_maintenance: brokerMaintenance,
    outcome_collection: outcomeCollection,
    system_test_positions: systemTestPositions,
    market_clock: marketClock,
    paper_cycle: paperCycle,
    decision_cycle_due: decisionDue,
    decision_cycle_skipped_reason: decisionCycleSkippedReason,
    new_entries_skipped_reason: newEntriesSkippedReason,
    errors,
  };
}
