import type { AlpacaEnv } from "./alpaca";
import { getUsMarketClock, paperEntryGate } from "./market";

export interface PaperPolicyInput {
  dailyTargetUsd: number;
  dailyHardCapUsd: number;
  maxSingleTradeUsd: number;
  maxOpenRiskUsd: number;
  dailyLossStopUsd: number;
  minOpportunityScore: number;
  exceptionalOpportunityScore: number;
}

export interface PaperRiskInput {
  deployedUsd: number;
  openRiskUsd: number;
  realizedPnlUsd: number;
  newPositionsBlocked: boolean;
  blockReason?: string | null;
}

export interface PaperDecisionInput {
  debitUsd: number;
  estimatedEvScore: number;
  policy: PaperPolicyInput;
  risk: PaperRiskInput;
}

export interface PaperPolicyDecision {
  status: "eligible_normal" | "eligible_exceptional" | "blocked" | "requires_escalation";
  tier: "normal" | "exceptional" | "escalation" | "blocked";
  reason: string | null;
}

interface PredictionContextRow {
  prediction_id: string;
  recommendation_type: "CALL" | "PUT" | "PASS";
  estimated_ev_score: number;
  option_snapshot_id: string | null;
  contract_symbol: string | null;
  option_ask: number | null;
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

function tradingDate(iso: string): string {
  return iso.slice(0, 10);
}

export function evaluatePaperPolicy(input: PaperDecisionInput): PaperPolicyDecision {
  const { debitUsd, estimatedEvScore, policy, risk } = input;
  const projectedDeployment = risk.deployedUsd + debitUsd;
  const projectedOpenRisk = risk.openRiskUsd + debitUsd;

  if (risk.newPositionsBlocked) {
    return {
      status: "blocked",
      tier: "blocked",
      reason: risk.blockReason || "new positions are blocked",
    };
  }

  if (risk.realizedPnlUsd <= -Math.abs(policy.dailyLossStopUsd)) {
    return {
      status: "blocked",
      tier: "blocked",
      reason: "daily loss stop reached",
    };
  }

  if (estimatedEvScore < policy.minOpportunityScore) {
    return {
      status: "blocked",
      tier: "blocked",
      reason: "opportunity score below normal execution threshold",
    };
  }

  if (debitUsd > policy.maxSingleTradeUsd) {
    return {
      status: "requires_escalation",
      tier: "escalation",
      reason: "single trade exceeds autonomous max; user approval required",
    };
  }

  if (projectedOpenRisk > policy.maxOpenRiskUsd) {
    return {
      status: "requires_escalation",
      tier: "escalation",
      reason: "total open option debit risk would exceed the autonomous cap; user approval required",
    };
  }

  if (projectedDeployment > policy.dailyHardCapUsd) {
    return {
      status: "requires_escalation",
      tier: "escalation",
      reason: "daily hard cap would be exceeded; user approval required",
    };
  }

  if (projectedDeployment <= policy.dailyTargetUsd) {
    return {
      status: "eligible_normal",
      tier: "normal",
      reason: null,
    };
  }

  if (estimatedEvScore < policy.exceptionalOpportunityScore) {
    return {
      status: "blocked",
      tier: "blocked",
      reason: "trade would use the exceptional $50-$100 budget tier but does not clear the exceptional opportunity threshold",
    };
  }

  return {
    status: "eligible_exceptional",
    tier: "exceptional",
    reason: null,
  };
}

export async function executeTieredPaperPrediction(env: AlpacaEnv, predictionId: string) {
  if (env.EXECUTION_MODE !== "paper") {
    throw new Error("paper executor is disabled because EXECUTION_MODE is not paper");
  }

  const context = await env.DB.prepare(`
    SELECT
      p.id AS prediction_id,
      r.recommendation_type,
      r.estimated_ev_score,
      ocs.id AS option_snapshot_id,
      ocs.contract_symbol,
      ocs.ask AS option_ask
    FROM predictions p
    JOIN recommendations r ON r.id = p.recommendation_id
    LEFT JOIN recommendation_contracts rc ON rc.recommendation_id = r.id
    LEFT JOIN option_contract_snapshots ocs ON ocs.id = rc.option_snapshot_id
    WHERE p.id = ?1
    LIMIT 1
  `).bind(predictionId).first<PredictionContextRow>();

  if (!context) throw new Error("prediction not found");

  const existing = await env.DB.prepare(`
    SELECT id, status, block_reason, notional_usd, fill_price
    FROM paper_orders
    WHERE prediction_id = ?1
    LIMIT 1
  `).bind(predictionId).first<{
    id: string;
    status: string;
    block_reason: string | null;
    notional_usd: number;
    fill_price: number | null;
  }>();

  if (existing) {
    return {
      already_processed: true,
      order_id: existing.id,
      status: existing.status,
      reason: existing.block_reason,
      debit_usd: existing.notional_usd,
      simulated_fill_price: existing.fill_price,
    };
  }

  if (
    context.recommendation_type === "PASS" ||
    !context.option_snapshot_id ||
    !context.contract_symbol ||
    context.option_ask === null ||
    context.option_ask <= 0
  ) {
    return {
      executed: false,
      status: "not_tradeable",
      tier: "blocked",
      reason: "prediction is PASS or has no executable selected option",
    };
  }

  const marketClock = await getUsMarketClock(env);
  const marketGate = paperEntryGate(marketClock);
  if (!marketGate.allowed) {
    return {
      executed: false,
      status: "market_closed",
      tier: "blocked",
      reason: marketGate.reason,
      market_clock: marketClock,
    };
  }

  const policy = await env.DB.prepare(`
    SELECT
      id,
      daily_target_usd,
      daily_hard_cap_usd,
      max_single_trade_usd,
      max_open_risk_usd,
      daily_loss_stop_usd,
      min_opportunity_score,
      exceptional_opportunity_score
    FROM execution_policies
    WHERE active = 1
    ORDER BY created_at DESC
    LIMIT 1
  `).first<PolicyRow>();

  if (!policy) throw new Error("no active execution policy");

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

  const debitUsd = context.option_ask * 100;
  const policyDecision = evaluatePaperPolicy({
    debitUsd,
    estimatedEvScore: context.estimated_ev_score,
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
    context.option_snapshot_id,
    context.contract_symbol,
    context.option_ask,
    debitUsd,
    storedStatus,
    policyDecision.reason,
    filled ? now : null,
    filled ? context.option_ask : null,
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
    contract_symbol: context.contract_symbol,
    simulated_fill_price: filled ? context.option_ask : null,
    debit_usd: debitUsd,
    status: storedStatus,
    reason: policyDecision.reason,
    estimated_ev_score: context.estimated_ev_score,
    normal_threshold: policy.min_opportunity_score,
    exceptional_threshold: policy.exceptional_opportunity_score,
    daily_target_usd: policy.daily_target_usd,
    daily_hard_cap_usd: policy.daily_hard_cap_usd,
    max_open_risk_usd: policy.max_open_risk_usd,
    open_risk_before_trade_usd: openRisk?.open_risk_usd ?? 0,
    open_risk_after_trade_usd: filled ? (openRisk?.open_risk_usd ?? 0) + debitUsd : (openRisk?.open_risk_usd ?? 0),
    deployed_before_trade_usd: risk.deployed_usd,
    deployed_after_trade_usd: filled ? risk.deployed_usd + debitUsd : risk.deployed_usd,
    market_clock: marketClock,
  };
}
