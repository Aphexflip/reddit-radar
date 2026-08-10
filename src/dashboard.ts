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
    main { width: min(1180px, calc(100% - 28px)); margin: 0 auto; padding: 28px 0 60px; }
    .top { display:flex; gap:18px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; }
    h1 { font-size: clamp(28px, 4vw, 52px); margin: 0; letter-spacing:-.04em; }
    .sub { color:#9ca5b8; max-width:780px; line-height:1.5; }
    .pill { border:1px solid #30394b; border-radius:999px; padding:8px 12px; color:#dbe6ff; background:#141925; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:24px 0; }
    .card { border:1px solid #232a38; background:#10141d; border-radius:16px; padding:16px; }
    .metric { font-size:28px; font-weight:800; margin-top:5px; }
    .label { color:#8f98aa; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th,td { text-align:left; padding:12px 10px; border-bottom:1px solid #212735; vertical-align:top; }
    th { color:#8f98aa; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .call { color:#7ff5ac; font-weight:800; }
    .put { color:#ff8d98; font-weight:800; }
    .pass { color:#aab2c2; font-weight:800; }
    .warn { border:1px solid #665829; background:#201b0d; color:#f4d477; padding:12px 14px; border-radius:12px; margin:16px 0; }
    code { color:#b9ccff; }
    @media (max-width: 800px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .tablewrap{overflow:auto;} }
  </style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>Options Intelligence</h1>
      <p class="sub">Internal proof dashboard. Recommendations are immutable research records; execution is paper-only until forward performance and operational reliability earn live capital.</p>
    </div>
    <span class="pill">Paper Mode</span>
  </div>

  <div id="warning" class="warn">Loading proof ledger…</div>

  <section class="grid">
    <div class="card"><div class="label">Predictions</div><div id="predictions" class="metric">—</div></div>
    <div class="card"><div class="label">Paper fills</div><div id="fills" class="metric">—</div></div>
    <div class="card"><div class="label">Measured outcomes</div><div id="outcomes" class="metric">—</div></div>
    <div class="card"><div class="label">Win rate</div><div id="winrate" class="metric">—</div></div>
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

  <p class="sub">API: <code>POST /api/events</code> → <code>POST /api/predictions</code> → <code>POST /api/paper/execute/:predictionId</code> → <code>POST /api/outcomes</code>.</p>
</main>
<script>
const pct = n => n == null ? '—' : (n * 100).toFixed(1) + '%';
const score = n => n == null ? '—' : (n * 100).toFixed(0);
async function load(){
  const [proofRes, oppRes] = await Promise.all([fetch('/api/proof'), fetch('/api/opportunities?limit=30')]);
  const proof = await proofRes.json();
  const opp = await oppRes.json();
  document.querySelector('#predictions').textContent = proof.prediction_count ?? 0;
  document.querySelector('#fills').textContent = proof.paper_filled_count ?? 0;
  document.querySelector('#outcomes').textContent = proof.measured_outcomes ?? 0;
  document.querySelector('#winrate').textContent = pct(proof.win_rate);
  const warning = document.querySelector('#warning');
  warning.textContent = proof.warning || 'Forward sample threshold cleared. Continue monitoring calibration and drawdown.';
  const rows = document.querySelector('#rows');
  if (!opp.length) { rows.innerHTML = '<tr><td colspan="8">No predictions yet.</td></tr>'; return; }
  rows.innerHTML = opp.map(x => {
    const cls = x.recommendation_type === 'CALL' ? 'call' : x.recommendation_type === 'PUT' ? 'put' : 'pass';
    return '<tr>' +
      '<td><b>' + x.ticker + '</b></td>' +
      '<td class="' + cls + '">' + x.recommendation_type + '</td>' +
      '<td>' + pct(x.confidence) + '</td>' +
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
