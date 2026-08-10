export async function proofSummary(env: Env) {
  const prediction = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM predictions
  `).first<{ count: number }>();

  const paper = await env.DB.prepare(`
    SELECT
      COUNT(*) AS order_count,
      SUM(CASE WHEN status = 'filled' THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count,
      SUM(CASE WHEN status = 'requires_escalation' THEN 1 ELSE 0 END) AS escalation_count,
      SUM(CASE WHEN status = 'closed' THEN realized_pnl_usd ELSE 0 END) AS realized_pnl_usd,
      AVG(CASE
        WHEN status = 'closed' AND notional_usd > 0
        THEN (realized_pnl_usd / notional_usd) * 100
        ELSE NULL
      END) AS avg_closed_return_pct,
      SUM(CASE WHEN status = 'closed' AND realized_pnl_usd > 0 THEN 1 ELSE 0 END) AS closed_wins
    FROM paper_orders
  `).first<{
    order_count: number;
    open_count: number | null;
    closed_count: number | null;
    escalation_count: number | null;
    realized_pnl_usd: number | null;
    avg_closed_return_pct: number | null;
    closed_wins: number | null;
  }>();

  const mark = await env.DB.prepare(`
    SELECT
      COUNT(*) AS outcome_count,
      SUM(CASE WHEN option_mid_return_pct > 0 THEN 1 ELSE 0 END) AS wins,
      AVG(option_mid_return_pct) AS avg_return_pct,
      MIN(option_mid_return_pct) AS worst_return_pct,
      MAX(option_mid_return_pct) AS best_return_pct,
      AVG(underlying_return_pct) AS avg_underlying_return_pct
    FROM outcomes
    WHERE option_mid_return_pct IS NOT NULL
  `).first<{
    outcome_count: number;
    wins: number | null;
    avg_return_pct: number | null;
    worst_return_pct: number | null;
    best_return_pct: number | null;
    avg_underlying_return_pct: number | null;
  }>();

  const executable = await env.DB.prepare(`
    SELECT
      COUNT(*) AS outcome_count,
      SUM(CASE WHEN executable_return_pct > 0 THEN 1 ELSE 0 END) AS wins,
      AVG(executable_return_pct) AS avg_return_pct,
      MIN(executable_return_pct) AS worst_return_pct,
      MAX(executable_return_pct) AS best_return_pct
    FROM outcomes
    WHERE executable_return_pct IS NOT NULL
  `).first<{
    outcome_count: number;
    wins: number | null;
    avg_return_pct: number | null;
    worst_return_pct: number | null;
    best_return_pct: number | null;
  }>();

  const targets = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) AS retrying,
      SUM(CASE WHEN status = 'measured' THEN 1 ELSE 0 END) AS measured,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM outcome_targets
  `).first<{
    total: number;
    pending: number | null;
    retrying: number | null;
    measured: number | null;
    failed: number | null;
  }>();

  const cycles = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM paper_cycle_runs
  `).first<{ total: number; completed: number | null; failed: number | null }>();

  const closedCount = paper?.closed_count ?? 0;
  const markCount = mark?.outcome_count ?? 0;
  const executableCount = executable?.outcome_count ?? 0;

  const evidenceLevel = executableCount >= 100
    ? "execution-sample"
    : closedCount >= 100
      ? "forward-paper-sample"
      : markCount >= 30
        ? "reference-sample"
        : "insufficient-sample";

  const warnings: string[] = [];
  if (markCount < 30) {
    warnings.push("Fewer than 30 option-reference outcomes exist; no performance claim is justified.");
  }
  if (closedCount < 30) {
    warnings.push("Fewer than 30 closed forward paper trades exist; paper profitability is not established.");
  }
  if (executableCount < 30) {
    warnings.push("Fewer than 30 execution-grade outcomes exist; historical trade-bar marks must not be treated as executable returns.");
  }

  return {
    evidence_level: evidenceLevel,
    prediction_count: prediction?.count ?? 0,

    paper: {
      order_count: paper?.order_count ?? 0,
      open_count: paper?.open_count ?? 0,
      closed_count: closedCount,
      escalation_count: paper?.escalation_count ?? 0,
      realized_pnl_usd: paper?.realized_pnl_usd ?? 0,
      closed_win_rate: closedCount > 0 ? (paper?.closed_wins ?? 0) / closedCount : null,
      avg_closed_return_pct: paper?.avg_closed_return_pct ?? null,
      quality: "forward paper orders; exits currently use historical option trade-bar closes, not guaranteed executable fills",
    },

    option_reference: {
      outcome_count: markCount,
      win_rate: markCount > 0 ? (mark?.wins ?? 0) / markCount : null,
      avg_return_pct: mark?.avg_return_pct ?? null,
      best_return_pct: mark?.best_return_pct ?? null,
      worst_return_pct: mark?.worst_return_pct ?? null,
      avg_underlying_return_pct: mark?.avg_underlying_return_pct ?? null,
      quality: "historical option 1-minute trade-bar references; useful for research, not execution proof",
    },

    executable: {
      outcome_count: executableCount,
      win_rate: executableCount > 0 ? (executable?.wins ?? 0) / executableCount : null,
      avg_return_pct: executable?.avg_return_pct ?? null,
      best_return_pct: executable?.best_return_pct ?? null,
      worst_return_pct: executable?.worst_return_pct ?? null,
      quality: "reserved for bid/ask-aware or broker-fill evidence",
    },

    outcome_targets: {
      total: targets?.total ?? 0,
      pending: targets?.pending ?? 0,
      retrying: targets?.retrying ?? 0,
      measured: targets?.measured ?? 0,
      failed: targets?.failed ?? 0,
    },

    paper_cycles: {
      total: cycles?.total ?? 0,
      completed: cycles?.completed ?? 0,
      failed: cycles?.failed ?? 0,
    },

    warnings,
  };
}
