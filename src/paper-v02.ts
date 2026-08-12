import type { AlpacaEnv } from "./alpaca";
import { getUsMarketClock, paperEntryGate } from "./market";
import { evaluatePaperPolicy } from "./paper";
import { scoreOptionCandidate, type OptionCandidate, type ScoredOption } from "./scoring";

interface PredictionContextRow {
  prediction_id: string;
  entity_id: string;
  published_at: string;
  recommendation_type: "CALL" | "PUT" | "PASS";
  underlying_opportunity_score: number;
  estimated_ev_score: number;
  research_option_snapshot_id: string | null;
  research_contract_symbol: string | null;
  research_option_type: "call" | "put" | null;
  research_strike: number | null;
  research_expiration_date: string | null;
  research_observed_at: string | null;
  research_provider: string | null;
  research_underlying_price: number | null;
  research_bid: number | null;
  research_ask: number | null;
  research_mark: number | null;
  research_volume: number | null;
  research_open_interest: number | null;
  research_implied_volatility: number | null;
  research_delta: number | null;
  research_gamma: number | null;
  research_theta: number | null;
  research_vega: number | null;
}

interface PolicyRow {
  id: string;
  daily_target_usd: number;
  daily_hard_cap_usd: number;
  max_single_trade_usd: number;
  max_open_risk_usd: number;
  daily_loss_stop_usd: number;
  min_opportunity_score: number;
  exceptional_opportunity_score: number;
}

interface DailyRiskRow {
  trading_date: string;
  deployed_usd: number;
  realized_pnl_usd: number;
  open_risk_usd: number;
  new_positions_blocked: number;
  block_reason: string | null;
}

interface OptionSnapshotRow {
  id: string;
  contract_symbol: string;
  option_type: "call" | "put";
  strike: number;
  expiration_date: string;
  observed_at: string;
  provider: string;
  underlying_price: number;
  bid: number;
  ask: number;
  mark: number | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

function tradingDate(iso: string): string {
  return iso.slice(0, 10);
}

function asCandidate(row: OptionSnapshotRow): OptionCandidate {
  return {
    contract_symbol: row.contract_symbol,
    option_type: row.option_type,
    strike: row.strike,
    expiration_date: row.expiration_date,
    observed_at: row.observed_at,
    provider: row.provider,
    underlying_price: row.underlying_price,
    bid: row.bid,
    ask: row.ask,
    ...(row.mark === null ? {} : { mark: row.mark }),
    ...(row.volume === null ? {} : { volume: row.volume }),
    ...(row.open_interest === null ? {} : { open_interest: row.open_interest }),
    ...(row.implied_volatility === null ? {} : { implied_volatility: row.implied_volatility }),
    ...(row.delta === null ? {} : { delta: row.delta }),
    ...(row.gamma === null ? {} : { gamma: row.gamma }),
    ...(row.theta === null ? {} : { theta: row.theta }),
    ...(row.vega === null ? {} : { vega: row.vega }),
  };
}

function researchCandidate(context: PredictionContextRow): { id: string; option: OptionCandidate } | null {
  if (
    !context.research_option_snapshot_id ||
    !context.research_contract_symbol ||
    !context.research_option_type ||
    context.research_strike === null ||
    !context.research_expiration_date ||
    !context.research_observed_at ||
    !context.research_provider ||
    context.research_underlying_price === null ||
    context.research_bid === null ||
    context.research_ask === null
  ) return null;

  return {
    id: context.research_option_snapshot_id,
    option: asCandidate({
      id: context.research_option_snapshot_id,
      contract_symbol: context.research_contract_symbol,
      option_type: context.research_option_type,
      strike: context.research_strike,
      expiration_date: context.research_expiration_date,
      observed_at: context.research_observed_at,
      provider: context.research_provider,
      underlying_price: context.research_underlying_price,
      bid: context.research_bid,
      ask: context.research_ask,
      mark: context.research_mark,
      volume: context.research_volume,
      open_interest: context.research_open_interest,
      implied_volatility: context.research_implied_volatility,
      delta: context.research_delta,
      gamma: context.research_gamma,
      theta: context.research_theta,
      vega: context.research_vega,
    }),
  };
}

async function selectBudgetExecutableOption(
  env: AlpacaEnv,
  context: PredictionContextRow,
  maxDebitUsd: number,
): Promise<{
  option_snapshot_id: string;
  scored: ScoredOption;
  source: "research_contract" | "same_cycle_budget_search";
} | null> {
  if (context.recommendation_type === "PASS") return null;
  const requiredType = context.recommendation_type === "CALL" ? "call" : "put";
  const publishedMs = Date.parse(context.published_at);
  const cutoff = new Date(publishedMs - (14 * 60_000)).toISOString();
  const ceiling = new Date(publishedMs + (2 * 60_000)).toISOString();

  const rows = await env.DB.prepare(`
    SELECT
      id, contract_symbol, option_type, strike, expiration_date, observed_at, provider,
      underlying_price, bid, ask, mark, volume, open_interest, implied_volatility,
      delta, gamma, theta, vega
    FROM option_contract_snapshots
    WHERE entity_id = ?1
      AND option_type = ?2
      AND observed_at >= ?3
      AND observed_at <= ?4
      AND ask > 0
      AND (ask * 100.0) <= ?5
    ORDER BY observed_at DESC
    LIMIT 1000
  `).bind(
    context.entity_id,
    requiredType,
    cutoff,
    ceiling,
    maxDebitUsd,
  ).all<OptionSnapshotRow>();

  const scored: Array<{ option_snapshot_id: string; scored: ScoredOption; source: "research_contract" | "same_cycle_budget_search" }> = [];
  for (const row of rows.results) {
    const candidate = scoreOptionCandidate(asCandidate(row), context.published_at);
    if (candidate) {
      scored.push({ option_snapshot_id: row.id, scored: candidate, source: "same_cycle_budget_search" });
    }
  }

  const research = researchCandidate(context);
  if (research && research.option.ask * 100 <= maxDebitUsd) {
    const candidate = scoreOptionCandidate(research.option, context.published_at);
    if (candidate && !scored.some((item) => item.option_snapshot_id === research.id)) {
      scored.push({ option_snapshot_id: research.id, scored: candidate, source: "research_contract" });
    }
  }

  scored.sort((a, b) => {
    if (b.scored.score !== a.scored.score) return b.scored.score - a.scored.score;
    if (b.scored.liquidityScore !== a.scored.liquidityScore) return b.scored.liquidityScore - a.scored.liquidityScore;
    if (a.scored.spreadPct !== b.scored.spreadPct) return a.scored.spreadPct - b.scored.spreadPct;
    return a.scored.option.ask - b.scored.option.ask;
  });

  return scored[0] ?? null;
}

export async function executeTieredPaperPredictionV02(env: AlpacaEnv, predictionId: string) {
  if (env.EXECUTION_MODE !== "paper") {
    throw new Error("paper executor is disabled because EXECUTION_MODE is not paper");
  }

  const context = await env.DB.prepare(`
    SELECT
      p.id AS prediction_id,
      p.entity_id,
      p.published_at,
      r.recommendation_type,
      r.underlying_opportunity_score,
      r.estimated_ev_score,
      ocs.id AS research_option_snapshot_id,
      ocs.contract_symbol AS research_contract_symbol,
      ocs.option_type AS research_option_type,
      ocs.strike AS research_strike,
      ocs.expiration_date AS research_expiration_date,
      ocs.observed_at AS research_observed_at,
      ocs.provider AS research_provider,
      ocs.underlying_price AS research_underlying_price,
      ocs.bid AS research_bid,
      ocs.ask AS research_ask,
      ocs.mark AS research_mark,
      ocs.volume AS research_volume,
      ocs.open_interest AS research_open_interest,
      ocs.implied_volatility AS research_implied_volatility,
      ocs.delta AS research_delta,
      ocs.gamma AS research_gamma,
      ocs.theta AS research_theta,
      ocs.vega AS research_vega
    FROM predictions p
    JOIN recommendations r ON r.id = p.recommendation_id
    LEFT JOIN recommendation_contracts rc
      ON rc.recommendation_id = r.id AND rc.leg_role = 'long'
    LEFT JOIN option_contract_snapshots ocs ON ocs.id = rc.option_snapshot_id
    WHERE p.id = ?1
    LIMIT 1
  `).bind(predictionId).first<PredictionContextRow>();

  if (!context) throw new Error("prediction not found");

  const existing = await env.DB.prepare(`
    SELECT id, status, block_reason, notional_usd, fill_price, contract_symbol
    FROM paper_orders
    WHERE prediction_id = ?1
    LIMIT 1
  `).bind(predictionId).first<{
    id: string;
    status: string;
    block_reason: string | null;
    notional_usd: number;
    fill_price: number | null;
    contract_symbol: string;
  }>();

  if (existing) {
    return {
      already_processed: true,
      order_id: existing.id,
      contract_symbol: existing.contract_symbol,
      status: existing.status,
      reason: existing.block_reason,
      debit_usd: existing.notional_usd,
      simulated_fill_price: existing.fill_price,
      selection_mode: "budget_aware_v0.2",
    };
  }

  if (context.recommendation_type === "PASS") {
    return {
      executed: false,
      status: "not_tradeable",
      tier: "blocked",
      reason: "prediction is PASS",
      selection_mode: "budget_aware_v0.2",
    };
  }

  const policy = await env.DB.prepare(`
    SELECT
      id, daily_target_usd, daily_hard_cap_usd, max_single_trade_usd,
      max_open_risk_usd, daily_loss_stop_usd, min_opportunity_score,
      exceptional_opportunity_score
    FROM execution_policies
    WHERE active = 1
    ORDER BY created_at DESC
    LIMIT 1
  `).first<PolicyRow>();
  if (!policy) throw new Error("no active execution policy");

  const selected = await selectBudgetExecutableOption(env, context, policy.max_single_trade_usd);
  const researchDebitUsd = context.research_ask === null ? null : context.research_ask * 100;
  if (!selected) {
    return {
      executed: false,
      status: "budget_blocked",
      tier: "blocked",
      reason: `No ${context.recommendation_type.toLowerCase()} passed the existing spread/liquidity/DTE gates within the ${policy.max_single_trade_usd.toFixed(0)} dollar single-trade paper cap.`,
      research_contract_symbol: context.research_contract_symbol,
      research_debit_usd: researchDebitUsd,
      max_single_trade_usd: policy.max_single_trade_usd,
      selection_mode: "budget_aware_v0.2",
    };
  }

  const executable = selected.scored.option;
  const debitUsd = executable.ask * 100;
  const marketClock = await getUsMarketClock(env);
  const marketGate = paperEntryGate(marketClock);
  if (!marketGate.allowed) {
    return {
      executed: false,
      status: "market_closed",
      tier: "blocked",
      reason: marketGate.reason,
      contract_symbol: executable.contract_symbol,
      debit_usd: debitUsd,
      research_contract_symbol: context.research_contract_symbol,
      research_debit_usd: researchDebitUsd,
      selection_source: selected.source,
      selection_mode: "budget_aware_v0.2",
      market_clock: marketClock,
    };
  }

  const now = new Date().toISOString();
  const date = tradingDate(now);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO daily_risk_state(trading_date) VALUES(?1)
  `).bind(date).run();

  const risk = await env.DB.prepare(`
    SELECT * FROM daily_risk_state WHERE trading_date = ?1
  `).bind(date).first<DailyRiskRow>();
  if (!risk) throw new Error("daily risk state unavailable");

  const openRisk = await env.DB.prepare(`
    SELECT COALESCE(SUM(notional_usd), 0) AS open_risk_usd
    FROM paper_orders
    WHERE status = 'filled'
  `).first<{ open_risk_usd: number }>();

  const policyDecision = evaluatePaperPolicy({
    debitUsd,
    estimatedEvScore: context.estimated_ev_score,
    underlyingOpportunityScore: context.underlying_opportunity_score,
    policy: {
      dailyTargetUsd: policy.daily_target_usd,
      dailyHardCapUsd: policy.daily_hard_cap_usd,
      maxSingleTradeUsd: policy.max_single_trade_usd,
      maxOpenRiskUsd: policy.max_open_risk_usd,
      dailyLossStopUsd: policy.daily_loss_stop_usd,
      minOpportunityScore: policy.min_opportunity_score,
      exceptionalOpportunityScore: policy.exceptional_opportunity_score,
    },
    risk: {
      deployedUsd: risk.deployed_usd,
      openRiskUsd: openRisk?.open_risk_usd ?? 0,
      realizedPnlUsd: risk.realized_pnl_usd,
      newPositionsBlocked: Boolean(risk.new_positions_blocked),
      blockReason: risk.block_reason,
    },
  });

  const filled = policyDecision.status === "eligible_normal" || policyDecision.status === "eligible_exceptional";
  const storedStatus = filled ? "filled" : policyDecision.status;
  const orderId = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO paper_orders(
      id, prediction_id, option_snapshot_id, contract_symbol, quantity,
      limit_price, notional_usd, status, block_reason, filled_at, fill_price
    ) VALUES(?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9, ?10)
  `).bind(
    orderId,
    predictionId,
    selected.option_snapshot_id,
    executable.contract_symbol,
    executable.ask,
    debitUsd,
    storedStatus,
    policyDecision.reason,
    filled ? now : null,
    filled ? executable.ask : null,
  ).run();

  if (filled) {
    await env.DB.prepare(`
      UPDATE daily_risk_state
      SET deployed_usd = deployed_usd + ?2,
          open_risk_usd = open_risk_usd + ?2,
          updated_at = CURRENT_TIMESTAMP
      WHERE trading_date = ?1
    `).bind(date, debitUsd).run();
  }

  return {
    executed: filled,
    mode: "paper",
    tier: policyDecision.tier,
    order_id: orderId,
    prediction_id: predictionId,
    contract_symbol: executable.contract_symbol,
    simulated_fill_price: filled ? executable.ask : null,
    debit_usd: debitUsd,
    status: storedStatus,
    reason: policyDecision.reason,
    selection_mode: "budget_aware_v0.2",
    selection_source: selected.source,
    research_contract_symbol: context.research_contract_symbol,
    research_debit_usd: researchDebitUsd,
    substituted_for_research_contract: Boolean(
      context.research_contract_symbol && context.research_contract_symbol !== executable.contract_symbol
    ),
    executable_option_score: selected.scored.score,
    executable_liquidity_score: selected.scored.liquidityScore,
    executable_spread_pct: selected.scored.spreadPct,
    executable_dte: selected.scored.dte,
    underlying_opportunity_score: context.underlying_opportunity_score,
    estimated_ev_score: context.estimated_ev_score,
    normal_threshold: policy.min_opportunity_score,
    exceptional_threshold: policy.exceptional_opportunity_score,
    daily_target_usd: policy.daily_target_usd,
    daily_hard_cap_usd: policy.daily_hard_cap_usd,
    max_single_trade_usd: policy.max_single_trade_usd,
    max_open_risk_usd: policy.max_open_risk_usd,
    open_risk_before_trade_usd: openRisk?.open_risk_usd ?? 0,
    open_risk_after_trade_usd: filled ? (openRisk?.open_risk_usd ?? 0) + debitUsd : (openRisk?.open_risk_usd ?? 0),
    deployed_before_trade_usd: risk.deployed_usd,
    deployed_after_trade_usd: filled ? risk.deployed_usd + debitUsd : risk.deployed_usd,
    market_clock: marketClock,
  };
}
