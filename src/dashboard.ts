export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Reddit Radar — Options Intelligence</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #090b10; color: #f4f6fb; }
    main { width: min(1220px, calc(100% - 28px)); margin: 0 auto; padding: 28px 0 60px; }
    .top { display:flex; gap:18px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; }
    h1 { font-size: clamp(28px, 4vw, 52px); margin: 0; letter-spacing:-.04em; }
    .sub { color:#9ca5b8; max-width:850px; line-height:1.5; }
    .pill { border:1px solid #30394b; border-radius:999px; padding:8px 12px; color:#dbe6ff; background:#141925; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:24px 0; }
    .card { border:1px solid #232a38; background:#10141d; border-radius:16px; padding:16px; }
    .metric { font-size:28px; font-weight:800; margin-top:5px; }
    .label { color:#8f98aa; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
    .detail { color:#7f899b; font-size:12px; line-height:1.4; margin-top:8px; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th,td { text-align:left; padding:12px 10px; border-bottom:1px solid #212735; vertical-align:top; }
    th { color:#8f98aa; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .call { color:#7ff5ac; font-weight:800; }
    .put { color:#ff8d98; font-weight:800; }
    .pass { color:#aab2c2; font-weight:800; }
    .warn { border:1px solid #665829; background:#201b0d; color:#f4d477; padding:12px 14px; border-radius:12px; margin:16px 0; line-height:1.5; }
    code { color:#b9ccff; }
    @media (max-width: 900px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .tablewrap{overflow:auto;} }
    @media (max-width: 520px) { .grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>Options Intelligence</h1>
      <p class="sub">Internal proof dashboard. Recommendations are immutable. Paper P&L, historical option-reference returns, and execution-grade returns are deliberately separated so a favorable mark cannot masquerade as a tradable edge.</p>
    </div>
    <span class="pill">Paper Mode</span>
  </div>

  <div id="warning" class="warn">Loading proof ledger…</div>

  <section class="grid">
    <div class="card"><div class="label">Predictions</div><div id="predictions" class="metric">—</div><div class="detail">Immutable calls / puts / passes</div></div>
    <div class="card"><div class="label">Open paper trades</div><div id="openPaper" class="metric">—</div><div class="detail">Simulated positions still awaiting horizon exit</div></div>
    <div class="card"><div class="label">Closed paper trades</div><div id="closedPaper" class="metric">—</div><div id="paperWin" class="detail">—</div></div>
    <div class="card"><div class="label">Paper realized P&amp;L</div><div id="paperPnl" class="metric">—</div><div class="detail">Mark-based paper exits; not broker fills</div></div>
    <div class="card"><div class="label">Option reference outcomes</div><div id="markOutcomes" class="metric">—</div><div id="markWin" class="detail">—</div></div>
    <div class="card"><div class="label">Execution-grade outcomes</div><div id="execOutcomes" class="metric">—</div><div id="execWin" class="detail">—</div></div>
    <div class="card"><div class="label">Outcome checkpoints</div><div id="targets" class="metric">—</div><div id="targetDetail" class="detail">—</div></div>
    <div class="card"><div class="label">Autonomous cycles</div><div id="cycles" class="metric">—</div><div id="cycleDetail" class="detail">—</div></div>
  </section>

  <section class="card">
    <div class="label">Latest immutable opportunities</div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Ticker</th><th>Verdict</th><th>Confidence</th><th>EV rank</th><th>Contract</th><th>Ask</th><th>Paper</th><th>Published</th></tr></thead>
        <tbody id="rows"><tr><td colspan="8">Loading…</td></tr></tbody>
      </table>
    </div>
  </section>

  <p class="sub">Core loop: <code>Pulse sync → Alpaca snapshot → immutable prediction → tiered paper execution → scheduled outcome collection → proof ledger</code>.</p>
</main>
<script>
const pctRatio = n => n == null ? '—' : (n * 100).toFixed(1) + '%';
const pctValue = n => n == null ? '—' : Number(n).toFixed(1) + '%';
const score = n => n == null ? '—' : (n * 100).toFixed(0);
const usd = n => n == null ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n));
async function load(){
  const [proofRes, oppRes] = await Promise.all([fetch('/api/proof'), fetch('/api/opportunities?limit=30')]);
  const proof = await proofRes.json();
  const opp = await oppRes.json();
  document.querySelector('#predictions').textContent = proof.prediction_count ?? 0;
  document.querySelector('#openPaper').textContent = proof.paper?.open_count ?? 0;
  document.querySelector('#closedPaper').textContent = proof.paper?.closed_count ?? 0;
  document.querySelector('#paperPnl').textContent = usd(proof.paper?.realized_pnl_usd ?? 0);
  document.querySelector('#paperWin').textContent = 'Win rate ' + pctRatio(proof.paper?.closed_win_rate) + ' · avg ' + pctValue(proof.paper?.avg_closed_return_pct);
  document.querySelector('#markOutcomes').textContent = proof.option_reference?.outcome_count ?? 0;
  document.querySelector('#markWin').textContent = 'Reference win rate ' + pctRatio(proof.option_reference?.win_rate) + ' · avg ' + pctValue(proof.option_reference?.avg_return_pct);
  document.querySelector('#execOutcomes').textContent = proof.executable?.outcome_count ?? 0;
  document.querySelector('#execWin').textContent = 'Executable win rate ' + pctRatio(proof.executable?.win_rate) + ' · avg ' + pctValue(proof.executable?.avg_return_pct);
  document.querySelector('#targets').textContent = proof.outcome_targets?.measured ?? 0;
  document.querySelector('#targetDetail').textContent = (proof.outcome_targets?.pending ?? 0) + ' pending · ' + (proof.outcome_targets?.retrying ?? 0) + ' retrying · ' + (proof.outcome_targets?.failed ?? 0) + ' failed';
  document.querySelector('#cycles').textContent = proof.paper_cycles?.completed ?? 0;
  document.querySelector('#cycleDetail').textContent = (proof.paper_cycles?.failed ?? 0) + ' failed cycles';
  const warning = document.querySelector('#warning');
  const warnings = Array.isArray(proof.warnings) ? proof.warnings : [];
  warning.textContent = warnings.length ? warnings.join(' ') : 'Minimum sample warnings cleared. This still does not guarantee future profitability.';
  const rows = document.querySelector('#rows');
  if (!opp.length) { rows.innerHTML = '<tr><td colspan="8">No predictions yet.</td></tr>'; return; }
  rows.innerHTML = opp.map(x => {
    const cls = x.recommendation_type === 'CALL' ? 'call' : x.recommendation_type === 'PUT' ? 'put' : 'pass';
    return '<tr>' +
      '<td><b>' + x.ticker + '</b></td>' +
      '<td class="' + cls + '">' + x.recommendation_type + '</td>' +
      '<td>' + pctRatio(x.confidence) + '</td>' +
      '<td>' + score(x.estimated_ev_score) + '</td>' +
      '<td>' + (x.contract_symbol || '—') + '</td>' +
      '<td>' + (x.ask == null ? '—' : '$' + Number(x.ask).toFixed(2)) + '</td>' +
      '<td>' + (x.paper_status || 'not run') + '</td>' +
      '<td>' + new Date(x.published_at).toLocaleString() + '</td>' +
    '</tr>';
  }).join('');
}
load().catch(err => { document.querySelector('#warning').textContent = 'Dashboard error: ' + err.message; });
</script>
</body>
</html>`;
}
