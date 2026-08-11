type StrategyOrderRow = {
  id: string;
  prediction_id: string;
  ticker: string;
  recommendation_type: "CALL" | "PUT" | "PASS";
  contract_symbol: string;
  option_type: "call" | "put" | null;
  strike: number | null;
  expiration_date: string | null;
  quantity: number;
  status: string;
  block_reason: string | null;
  created_at: string;
  filled_at: string | null;
  fill_price: number | null;
  notional_usd: number;
  closed_at: string | null;
  exit_price: number | null;
  realized_pnl_usd: number | null;
  exit_method: string | null;
  horizon_minutes: number;
  underlying_opportunity_score: number;
};

type SystemTestRow = {
  id: string;
  ticker: string;
  contract_symbol: string;
  option_type: "call" | "put";
  strike: number;
  expiration_date: string;
  quantity: number;
  entry_bid: number | null;
  entry_ask: number;
  entry_fill_price: number;
  notional_usd: number;
  opened_at: string;
  close_after_at: string;
  status: "open" | "closed";
  last_bid: number | null;
  last_ask: number | null;
  last_mark: number | null;
  last_marked_at: string | null;
  unrealized_pnl_usd: number | null;
  closed_at: string | null;
  exit_price: number | null;
  realized_pnl_usd: number | null;
  close_method: string | null;
};

export async function paperPortfolio(env: Env) {
  const [strategyResult, systemTestResult] = await Promise.all([
    env.DB.prepare(`
      SELECT
        po.id,
        po.prediction_id,
        e.ticker,
        r.recommendation_type,
        po.contract_symbol,
        ocs.option_type,
        ocs.strike,
        ocs.expiration_date,
        po.quantity,
        po.status,
        po.block_reason,
        po.created_at,
        po.filled_at,
        po.fill_price,
        po.notional_usd,
        po.closed_at,
        po.exit_price,
        po.realized_pnl_usd,
        po.exit_method,
        p.horizon_minutes,
        r.underlying_opportunity_score
      FROM paper_orders po
      JOIN predictions p ON p.id = po.prediction_id
      JOIN entities e ON e.id = p.entity_id
      JOIN recommendations r ON r.id = p.recommendation_id
      LEFT JOIN option_contract_snapshots ocs ON ocs.id = po.option_snapshot_id
      ORDER BY po.created_at DESC
      LIMIT 100
    `).all<StrategyOrderRow>(),
    env.DB.prepare(`
      SELECT
        id, ticker, contract_symbol, option_type, strike, expiration_date, quantity,
        entry_bid, entry_ask, entry_fill_price, notional_usd, opened_at, close_after_at,
        status, last_bid, last_ask, last_mark, last_marked_at, unrealized_pnl_usd,
        closed_at, exit_price, realized_pnl_usd, close_method
      FROM paper_system_test_positions
      ORDER BY opened_at DESC
      LIMIT 100
    `).all<SystemTestRow>(),
  ]);

  const strategy = strategyResult.results.map((row) => ({
    lane: "strategy" as const,
    ...row,
  }));
  const systemTest = systemTestResult.results.map((row) => ({
    lane: "system_test" as const,
    excluded_from_strategy_proof: true,
    ...row,
  }));

  return {
    generated_at: new Date().toISOString(),
    note: "SYSTEM TEST positions are isolated mechanical validations and are excluded from strategy proof/performance metrics.",
    strategy: {
      open: strategy.filter((row) => row.status === "filled"),
      closed: strategy.filter((row) => row.status === "closed"),
      other: strategy.filter((row) => row.status !== "filled" && row.status !== "closed"),
    },
    system_test: {
      open: systemTest.filter((row) => row.status === "open"),
      closed: systemTest.filter((row) => row.status === "closed"),
    },
  };
}
