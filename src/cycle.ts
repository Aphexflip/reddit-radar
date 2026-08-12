import { alpacaPredict, type AlpacaEnv } from "./alpaca";
import { executeTieredPaperPredictionV03 } from "./paper-v03";
import { syncPulseTrends, type PulseEnv } from "./pulse";

export type AutonomousPaperEnv = AlpacaEnv & PulseEnv;

export interface PaperCycleInput {
  pulse_hours?: number;
  trend_limit?: number;
  candidate_limit?: number;
  prediction_horizon_minutes?: number;
  signal_lookback_hours?: number;
}

interface CycleItemSummary {
  rank: number;
  ticker: string;
  smart_score: number;
  prediction_id: string | null;
  recommendation: string | null;
  estimated_ev_score: number | null;
  execution_status: string | null;
  execution_tier: string | null;
  execution_contract_symbol: string | null;
  execution_debit_usd: number | null;
  execution_reason: string | null;
  paper_order_id: string | null;
  error: string | null;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function runAutonomousPaperCycle(
  env: AutonomousPaperEnv,
  input: PaperCycleInput = {},
) {
  if (env.EXECUTION_MODE !== "paper") {
    throw new Error("autonomous paper cycle is disabled unless EXECUTION_MODE=paper");
  }
  if (!env.ALPACA_API_KEY_ID?.trim() || !env.ALPACA_API_SECRET_KEY?.trim()) {
    throw new Error("Alpaca paper/data credentials are required before running the autonomous paper cycle");
  }

  const pulseHours = Math.max(1, Math.min(input.pulse_hours ?? 1, 24));
  const trendLimit = Math.max(5, Math.min(input.trend_limit ?? 25, 100));
  const candidateLimit = Math.max(1, Math.min(input.candidate_limit ?? 10, 25));
  const signalLookbackHours = Math.max(1, Math.min(input.signal_lookback_hours ?? 6, 48));
  const cycleId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO paper_cycle_runs(
      id, started_at, mode, pulse_hours, requested_trend_limit, requested_candidate_limit
    ) VALUES(?1, ?2, 'paper', ?3, ?4, ?5)
  `).bind(cycleId, startedAt, pulseHours, trendLimit, candidateLimit).run();

  const items: CycleItemSummary[] = [];
  let predictionsCreated = 0;
  let calls = 0;
  let puts = 0;
  let passes = 0;
  let paperFills = 0;
  let escalations = 0;
  let errors = 0;

  try {
    const pulse = await syncPulseTrends(env, {
      hours: pulseHours,
      limit: trendLimit,
    });

    const candidates = pulse.results
      .filter((item) => item.ticker)
      .sort((a, b) => b.smart_score - a.smart_score)
      .slice(0, candidateLimit);

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const rank = index + 1;
      const itemId = crypto.randomUUID();
      let predictionId: string | null = null;
      let recommendation: string | null = null;
      let estimatedEvScore: number | null = null;
      let executionStatus: string | null = null;
      let executionTier: string | null = null;
      let executionContractSymbol: string | null = null;
      let executionDebitUsd: number | null = null;
      let executionReason: string | null = null;
      let paperOrderId: string | null = null;
      let errorMessage: string | null = null;

      try {
        // Sequential provider calls are intentional. We favor deterministic,
        // rate-limit-friendly collection over maximizing throughput before the system
        // has proved any trading edge.
        const prediction = await alpacaPredict(env, {
          ticker: candidate.ticker,
          lookback_hours: signalLookbackHours,
          ...(input.prediction_horizon_minutes === undefined
            ? {}
            : { horizon_minutes: input.prediction_horizon_minutes }),
        });

        predictionId = prediction.prediction_id;
        recommendation = prediction.recommendation;
        estimatedEvScore = finite(prediction.estimated_ev_score);
        predictionsCreated += 1;

        if (recommendation === "CALL") calls += 1;
        else if (recommendation === "PUT") puts += 1;
        else passes += 1;

        if ((recommendation === "CALL" || recommendation === "PUT") && predictionId) {
          const execution = await executeTieredPaperPredictionV03(env, predictionId);
          executionStatus = "status" in execution ? String(execution.status) : null;
          executionTier = "tier" in execution && execution.tier !== undefined
            ? String(execution.tier)
            : null;
          executionContractSymbol = "contract_symbol" in execution && execution.contract_symbol
            ? String(execution.contract_symbol)
            : null;
          executionDebitUsd = "debit_usd" in execution && typeof execution.debit_usd === "number"
            ? execution.debit_usd
            : null;
          executionReason = "reason" in execution && execution.reason !== undefined && execution.reason !== null
            ? String(execution.reason)
            : null;
          paperOrderId = "order_id" in execution && execution.order_id
            ? String(execution.order_id)
            : null;

          if (executionStatus === "filled") paperFills += 1;
          if (executionStatus === "requires_escalation") escalations += 1;
        }
      } catch (error) {
        errors += 1;
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      await env.DB.prepare(`
        INSERT INTO paper_cycle_items(
          id, cycle_run_id, rank, ticker, smart_score, prediction_id,
          recommendation_type, estimated_ev_score, paper_order_id,
          execution_status, execution_tier, execution_contract_symbol,
          execution_debit_usd, execution_reason, error_message
        ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
      `).bind(
        itemId,
        cycleId,
        rank,
        candidate.ticker,
        candidate.smart_score,
        predictionId,
        recommendation,
        estimatedEvScore,
        paperOrderId,
        executionStatus,
        executionTier,
        executionContractSymbol,
        executionDebitUsd,
        executionReason,
        errorMessage,
      ).run();

      items.push({
        rank,
        ticker: candidate.ticker,
        smart_score: candidate.smart_score,
        prediction_id: predictionId,
        recommendation,
        estimated_ev_score: estimatedEvScore,
        execution_status: executionStatus,
        execution_tier: executionTier,
        execution_contract_symbol: executionContractSymbol,
        execution_debit_usd: executionDebitUsd,
        execution_reason: executionReason,
        paper_order_id: paperOrderId,
        error: errorMessage,
      });
    }

    const completedAt = new Date().toISOString();
    const summary = {
      cycle_id: cycleId,
      started_at: startedAt,
      completed_at: completedAt,
      pulse_hours: pulseHours,
      candidates_seen: candidates.length,
      predictions_created: predictionsCreated,
      calls,
      puts,
      passes,
      paper_fills: paperFills,
      escalations,
      errors,
      items,
      execution_mode: "paper",
      execution_selector: "budget_aware_v0.3_brokered",
      live_trading_enabled: false,
      note: "Research contract ranking remains budget-independent. Eligible strategy orders route through the configured paper broker mode; alpaca_paper uses only Alpaca's PAPER Trading API and broker fills are reconciled separately from historical research references.",
    };

    await env.DB.prepare(`
      UPDATE paper_cycle_runs SET
        completed_at = ?2,
        candidates_seen = ?3,
        predictions_created = ?4,
        calls = ?5,
        puts = ?6,
        passes = ?7,
        paper_fills = ?8,
        escalations = ?9,
        errors = ?10,
        status = 'completed',
        summary_json = ?11
      WHERE id = ?1
    `).bind(
      cycleId,
      completedAt,
      candidates.length,
      predictionsCreated,
      calls,
      puts,
      passes,
      paperFills,
      escalations,
      errors,
      JSON.stringify(summary),
    ).run();

    return summary;
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(`
      UPDATE paper_cycle_runs SET
        completed_at = ?2,
        status = 'failed',
        errors = errors + 1,
        summary_json = ?3
      WHERE id = ?1
    `).bind(
      cycleId,
      completedAt,
      JSON.stringify({ error: message }),
    ).run();
    throw error;
  }
}
