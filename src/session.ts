type CycleRow = {
  id: string;
  started_at: string;
  completed_at: string | null;
  candidates_seen: number;
  predictions_created: number;
  calls: number;
  puts: number;
  passes: number;
  paper_fills: number;
  escalations: number;
  errors: number;
  status: string;
  summary_json: string | null;
};

type SessionAggregate = {
  cycles: number;
  candidates_seen: number;
  predictions_created: number;
  calls: number;
  puts: number;
  passes: number;
  paper_fills: number;
  escalations: number;
  errors: number;
};

type CycleItemRow = {
  cycle_run_id: string;
  rank: number;
  ticker: string;
  smart_score: number | null;
  prediction_id: string | null;
  recommendation_type: string | null;
  estimated_ev_score: number | null;
  paper_order_id: string | null;
  execution_status: string | null;
  execution_tier: string | null;
  error_message: string | null;
  created_at: string;
};

type PaperOrderRow = {
  id: string;
  prediction_id: string;
  contract_symbol: string;
  quantity: number;
  limit_price: number;
  notional_usd: number;
  status: string;
  block_reason: string | null;
  created_at: string;
  filled_at: string | null;
  fill_price: number | null;
};

type RiskStateRow = {
  trading_date: string;
  deployed_usd: number;
  realized_pnl_usd: number;
  open_risk_usd: number;
  new_positions_blocked: number;
  block_reason: string | null;
  updated_at: string;
};

function marketDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function paperSessionStatus(env: Env): Promise<Record<string, unknown>> {
  const tradingDate = marketDate();

  const [latestCycle, aggregate, itemsResult, ordersResult, riskState] = await Promise.all([
    env.DB.prepare(`
      SELECT id, started_at, completed_at, candidates_seen, predictions_created,
             calls, puts, passes, paper_fills, escalations, errors, status, summary_json
      FROM paper_cycle_runs
      ORDER BY started_at DESC
      LIMIT 1
    `).first<CycleRow>(),
    env.DB.prepare(`
      SELECT
        COUNT(*) AS cycles,
        COALESCE(SUM(candidates_seen), 0) AS candidates_seen,
        COALESCE(SUM(predictions_created), 0) AS predictions_created,
        COALESCE(SUM(calls), 0) AS calls,
        COALESCE(SUM(puts), 0) AS puts,
        COALESCE(SUM(passes), 0) AS passes,
        COALESCE(SUM(paper_fills), 0) AS paper_fills,
        COALESCE(SUM(escalations), 0) AS escalations,
        COALESCE(SUM(errors), 0) AS errors
      FROM paper_cycle_runs
      WHERE date(started_at) = ?
    `).bind(tradingDate).first<SessionAggregate>(),
    env.DB.prepare(`
      SELECT pci.cycle_run_id, pci.rank, pci.ticker, pci.smart_score, pci.prediction_id,
             pci.recommendation_type, pci.estimated_ev_score, pci.paper_order_id,
             pci.execution_status, pci.execution_tier, pci.error_message, pci.created_at
      FROM paper_cycle_items pci
      JOIN paper_cycle_runs pcr ON pcr.id = pci.cycle_run_id
      WHERE date(pcr.started_at) = ?
      ORDER BY pci.created_at DESC, pci.rank ASC
      LIMIT 50
    `).bind(tradingDate).all<CycleItemRow>(),
    env.DB.prepare(`
      SELECT id, prediction_id, contract_symbol, quantity, limit_price, notional_usd,
             status, block_reason, created_at, filled_at, fill_price
      FROM paper_orders
      WHERE date(created_at) = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(tradingDate).all<PaperOrderRow>(),
    env.DB.prepare(`
      SELECT trading_date, deployed_usd, realized_pnl_usd, open_risk_usd,
             new_positions_blocked, block_reason, updated_at
      FROM daily_risk_state
      WHERE trading_date = ?
      LIMIT 1
    `).bind(tradingDate).first<RiskStateRow>(),
  ]);

  const summary = aggregate ?? {
    cycles: 0,
    candidates_seen: 0,
    predictions_created: 0,
    calls: 0,
    puts: 0,
    passes: 0,
    paper_fills: 0,
    escalations: 0,
    errors: 0,
  };

  return {
    trading_date: tradingDate,
    execution_mode: env.EXECUTION_MODE,
    live_trading_enabled: false,
    generated_at: new Date().toISOString(),
    today: {
      ...summary,
      paper_orders: ordersResult.results.length,
      deployed_usd: riskState?.deployed_usd ?? 0,
      realized_pnl_usd: riskState?.realized_pnl_usd ?? 0,
      open_risk_usd: riskState?.open_risk_usd ?? 0,
      new_positions_blocked: Boolean(riskState?.new_positions_blocked),
      block_reason: riskState?.block_reason ?? null,
    },
    latest_cycle: latestCycle,
    latest_decisions: itemsResult.results,
    latest_paper_orders: ordersResult.results,
    risk_state: riskState,
  };
}
