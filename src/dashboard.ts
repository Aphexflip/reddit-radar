export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Reddit Radar — Intelligence Lab</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing:border-box; }
    body { margin:0; background:#090b10; color:#f5f7fb; }
    main { width:min(1240px,calc(100% - 28px)); margin:0 auto; padding:26px 0 64px; }
    h1,h2,h3,p { margin-top:0; }
    h1 { font-size:clamp(30px,4vw,50px); letter-spacing:-.045em; margin-bottom:8px; }
    h2 { font-size:20px; letter-spacing:-.02em; }
    .muted { color:#929cad; line-height:1.5; }
    .top { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap; }
    .statusline { display:flex; gap:8px; flex-wrap:wrap; }
    .pill { border:1px solid #2d3544; background:#121722; color:#d7dfed; padding:7px 10px; border-radius:999px; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .pill.good { border-color:#24513a; color:#9df1bd; }
    .pill.warn { border-color:#5a4b25; color:#efd27a; }
    .tabs { display:flex; gap:6px; margin:22px 0; padding-bottom:1px; overflow:auto; }
    .tab { appearance:none; border:1px solid #282f3d; background:#0f131b; color:#9fa9bb; border-radius:10px; padding:10px 14px; min-height:42px; font-weight:800; cursor:pointer; white-space:nowrap; }
    .tab.active { color:#f5f7fb; background:#1a2130; border-color:#3a465c; }
    .panel { display:none; }
    .panel.active { display:block; }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:16px 0 20px; }
    .card { background:#10141d; border:1px solid #222936; border-radius:16px; padding:16px; min-width:0; }
    .label { color:#7f899a; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .metric { font-size:29px; font-weight:850; letter-spacing:-.03em; margin-top:6px; }
    .detail { color:#818b9c; font-size:12px; line-height:1.45; margin-top:7px; }
    .banner { padding:12px 14px; border-radius:12px; border:1px solid #4e4325; background:#1a170e; color:#e8ca77; line-height:1.5; margin-bottom:16px; }
    .sectionhead { display:flex; justify-content:space-between; gap:12px; align-items:end; flex-wrap:wrap; margin:22px 0 10px; }
    .sectionhead h2 { margin-bottom:0; }
    .tablewrap { overflow:auto; }
    table { width:100%; border-collapse:collapse; min-width:760px; font-size:13px; }
    th,td { padding:11px 9px; border-bottom:1px solid #202634; text-align:left; vertical-align:top; }
    th { color:#7e8899; font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
    .call { color:#85efae; font-weight:850; }
    .put { color:#ff99a3; font-weight:850; }
    .pass { color:#aab2bf; font-weight:850; }
    .roadmap { display:grid; gap:9px; }
    .mile { display:grid; grid-template-columns:58px 1fr auto; gap:12px; align-items:center; border-bottom:1px solid #202634; padding:10px 0; }
    .mile:last-child { border-bottom:0; }
    .code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:#b8c8eb; }
    .state { font-size:11px; font-weight:800; text-transform:uppercase; color:#8792a3; }
    .state.building { color:#e8ca77; }
    .state.ready { color:#8de9b0; }
    .split { display:grid; grid-template-columns:1.2fr .8fr; gap:12px; }
    @media (max-width:900px){ .grid{grid-template-columns:repeat(2,minmax(0,1fr));} .split{grid-template-columns:1fr;} }
    @media (max-width:520px){ .grid{grid-template-columns:1fr;} .mile{grid-template-columns:48px 1fr;} .mile .state{grid-column:2;} }
  </style>
</head>
<body>
<main>
  <header class="top">
    <div>
      <h1>Reddit Radar</h1>
      <p class="muted">Options Intelligence Lab — forward paper truth and historical research kept separate on purpose.</p>
    </div>
    <div class="statusline">
      <span class="pill good">Paper only</span>
      <span class="pill" id="researchPhase">Research B0</span>
      <span class="pill warn" id="evidenceLevel">Insufficient sample</span>
    </div>
  </header>

  <nav class="tabs" aria-label="Dashboard sections">
    <button class="tab active" data-panel="live">Live</button>
    <button class="tab" data-panel="research">Research Warehouse</button>
    <button class="tab" data-panel="backtests">Backtests</button>
    <button class="tab" data-panel="proof">Proof</button>
  </nav>

  <section id="live" class="panel active">
    <div class="banner" id="liveWarning">Loading live proof state…</div>
    <div class="grid">
      <div class="card"><div class="label">Predictions</div><div class="metric" id="predictions">—</div><div class="detail">Immutable CALL / PUT / PASS records</div></div>
      <div class="card"><div class="label">Open paper trades</div><div class="metric" id="openPaper">—</div><div class="detail">Forward positions still awaiting horizon exit</div></div>
      <div class="card"><div class="label">Completed cycles</div><div class="metric" id="cycles">—</div><div class="detail" id="cycleDetail">—</div></div>
      <div class="card"><div class="label">Pending checkpoints</div><div class="metric" id="pendingTargets">—</div><div class="detail">Future truth measurements still scheduled</div></div>
    </div>
    <div class="sectionhead"><h2>Latest opportunities</h2><div class="muted">Newest first</div></div>
    <div class="card tablewrap"><table><thead><tr><th>Ticker</th><th>Verdict</th><th>Confidence</th><th>EV rank</th><th>Contract</th><th>Ask</th><th>Paper</th><th>Published</th></tr></thead><tbody id="opportunityRows"><tr><td colspan="8">Loading…</td></tr></tbody></table></div>
  </section>

  <section id="research" class="panel">
    <div class="banner" id="researchWarning">Loading research warehouse…</div>
    <div class="grid">
      <div class="card"><div class="label">Datasets</div><div class="metric" id="datasetCount">—</div><div class="detail">Registered historical source families</div></div>
      <div class="card"><div class="label">Complete partitions</div><div class="metric" id="partitionCount">—</div><div class="detail" id="partitionDetail">—</div></div>
      <div class="card"><div class="label">Setup snapshots</div><div class="metric" id="setupCount">—</div><div class="detail">Point-in-time feature fingerprints</div></div>
      <div class="card"><div class="label">Outcome labels</div><div class="metric" id="labelCount">—</div><div class="detail">Future-only historical labels</div></div>
    </div>
    <div class="split">
      <div class="card">
        <div class="sectionhead"><h2>Dataset coverage</h2></div>
        <div class="tablewrap"><table><thead><tr><th>Dataset</th><th>Provider</th><th>Quality</th><th>Status</th><th>Complete</th><th>Failed</th><th>Coverage</th></tr></thead><tbody id="datasetRows"><tr><td colspan="7">Loading…</td></tr></tbody></table></div>
      </div>
      <div class="card">
        <div class="sectionhead"><h2>Roadmap</h2></div>
        <div class="roadmap" id="roadmap"></div>
      </div>
    </div>
  </section>

  <section id="backtests" class="panel">
    <div class="banner">Backtests are not allowed to claim edge until leakage audit, walk-forward validation and untouched time holdout all pass.</div>
    <div class="grid">
      <div class="card"><div class="label">Backtest runs</div><div class="metric" id="backtestCount">—</div><div class="detail">Versioned research evaluations</div></div>
      <div class="card"><div class="label">Latest sample</div><div class="metric" id="backtestSample">—</div><div class="detail">Rows in latest run</div></div>
      <div class="card"><div class="label">Leakage audit</div><div class="metric" id="leakageStatus">—</div><div class="detail">Must pass before any strategy claim</div></div>
      <div class="card"><div class="label">Strategy version</div><div class="metric code" id="strategyVersion">—</div><div class="detail">Exact evaluated rules/model</div></div>
    </div>
    <div class="card"><h2>Evaluation order</h2><p class="muted">Historical reconstruction → leakage audit → rolling walk-forward → untouched holdout → forward paper comparison. Controls include SPY, underlying-only direction, comparable ATM option, random eligible timestamps, momentum and mean-reversion baselines.</p></div>
  </section>

  <section id="proof" class="panel">
    <div class="grid">
      <div class="card"><div class="label">Closed paper trades</div><div class="metric" id="closedPaper">—</div><div class="detail" id="paperWin">—</div></div>
      <div class="card"><div class="label">Paper realized P&amp;L</div><div class="metric" id="paperPnl">—</div><div class="detail">Forward paper; exits not broker fills</div></div>
      <div class="card"><div class="label">Option reference outcomes</div><div class="metric" id="markOutcomes">—</div><div class="detail" id="markWin">—</div></div>
      <div class="card"><div class="label">Execution-grade outcomes</div><div class="metric" id="execOutcomes">—</div><div class="detail" id="execWin">—</div></div>
    </div>
    <div class="card"><h2>Proof rule</h2><p class="muted">Historical option trade-bar references, forward paper results, and execution-grade evidence stay separate. No blended win rate. Small samples remain visibly insufficient.</p></div>
  </section>
</main>
<script>
const pctRatio=n=>n==null?'—':(Number(n)*100).toFixed(1)+'%';
const pctValue=n=>n==null?'—':Number(n).toFixed(1)+'%';
const score=n=>n==null?'—':(Number(n)*100).toFixed(0);
const usd=n=>n==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));
  document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===btn.dataset.panel));
}));

async function load(){
  const [proofRes,oppRes,researchRes]=await Promise.all([
    fetch('/api/proof'),fetch('/api/opportunities?limit=30'),fetch('/api/research/status')
  ]);
  if(!proofRes.ok||!oppRes.ok||!researchRes.ok) throw new Error('one or more dashboard APIs failed');
  const [proof,opp,research]=await Promise.all([proofRes.json(),oppRes.json(),researchRes.json()]);

  document.querySelector('#evidenceLevel').textContent=(proof.evidence_level||'insufficient-sample').replaceAll('-',' ');
  document.querySelector('#researchPhase').textContent=(research.phase||'B0-foundation').replaceAll('-',' ');
  document.querySelector('#predictions').textContent=proof.prediction_count??0;
  document.querySelector('#openPaper').textContent=proof.paper?.open_count??0;
  document.querySelector('#cycles').textContent=proof.paper_cycles?.completed??0;
  document.querySelector('#cycleDetail').textContent=(proof.paper_cycles?.failed??0)+' failed cycles';
  document.querySelector('#pendingTargets').textContent=proof.outcome_targets?.pending??0;
  document.querySelector('#closedPaper').textContent=proof.paper?.closed_count??0;
  document.querySelector('#paperPnl').textContent=usd(proof.paper?.realized_pnl_usd??0);
  document.querySelector('#paperWin').textContent='Win rate '+pctRatio(proof.paper?.closed_win_rate)+' · avg '+pctValue(proof.paper?.avg_closed_return_pct);
  document.querySelector('#markOutcomes').textContent=proof.option_reference?.outcome_count??0;
  document.querySelector('#markWin').textContent='Reference win rate '+pctRatio(proof.option_reference?.win_rate)+' · avg '+pctValue(proof.option_reference?.avg_return_pct);
  document.querySelector('#execOutcomes').textContent=proof.executable?.outcome_count??0;
  document.querySelector('#execWin').textContent='Executable win rate '+pctRatio(proof.executable?.win_rate)+' · avg '+pctValue(proof.executable?.avg_return_pct);
  const warnings=Array.isArray(proof.warnings)?proof.warnings:[];
  document.querySelector('#liveWarning').textContent=warnings.length?warnings.join(' '):'Forward proof sample has cleared minimum warnings; this still does not guarantee future profitability.';

  const orows=document.querySelector('#opportunityRows');
  orows.innerHTML=opp.length?opp.map(x=>{
    const cls=x.recommendation_type==='CALL'?'call':x.recommendation_type==='PUT'?'put':'pass';
    return '<tr><td><b>'+esc(x.ticker)+'</b></td><td class="'+cls+'">'+esc(x.recommendation_type)+'</td><td>'+pctRatio(x.confidence)+'</td><td>'+score(x.estimated_ev_score)+'</td><td>'+esc(x.contract_symbol||'—')+'</td><td>'+(x.ask==null?'—':'$'+Number(x.ask).toFixed(2))+'</td><td>'+esc(x.paper_status||'not run')+'</td><td>'+new Date(x.published_at).toLocaleString()+'</td></tr>';
  }).join(''):'<tr><td colspan="8">No predictions yet.</td></tr>';

  document.querySelector('#researchWarning').textContent=research.warning||'Research warehouse status loaded.';
  document.querySelector('#datasetCount').textContent=research.counts?.datasets??0;
  document.querySelector('#partitionCount').textContent=research.counts?.partitions_complete??0;
  document.querySelector('#partitionDetail').textContent=(research.counts?.partitions_total??0)+' registered partitions';
  document.querySelector('#setupCount').textContent=research.counts?.setup_snapshots??0;
  document.querySelector('#labelCount').textContent=research.counts?.outcome_labels??0;
  document.querySelector('#backtestCount').textContent=research.counts?.backtests??0;
  document.querySelector('#backtestSample').textContent=research.latest_backtest?.sample_count??'—';
  document.querySelector('#leakageStatus').textContent=research.latest_backtest?.leakage_audit_status??'not run';
  document.querySelector('#strategyVersion').textContent=research.latest_backtest?.strategy_version??'—';

  const drows=document.querySelector('#datasetRows');
  drows.innerHTML=(research.datasets||[]).map(d=>{
    const c=d.coverage||{};
    const coverage=(c.first_complete_date||c.last_complete_date)?esc((c.first_complete_date||'—')+' → '+(c.last_complete_date||'—')):'—';
    return '<tr><td><b>'+esc(d.name)+'</b><div class="detail">'+esc(d.data_class)+'</div></td><td>'+esc(d.provider)+'</td><td>'+esc(d.quality_class)+'</td><td>'+esc(d.status)+'</td><td>'+esc(c.complete||0)+'</td><td>'+esc(c.failed||0)+'</td><td>'+coverage+'</td></tr>';
  }).join('')||'<tr><td colspan="7">No research datasets registered.</td></tr>';

  document.querySelector('#roadmap').innerHTML=(research.milestones||[]).map(m=>'<div class="mile"><div class="code">'+esc(m.id)+'</div><div><b>'+esc(m.name)+'</b></div><div class="state '+esc(m.status)+'">'+esc(m.status)+'</div></div>').join('');
}
load().catch(err=>{
  document.querySelector('#liveWarning').textContent='Dashboard error: '+err.message;
  document.querySelector('#researchWarning').textContent='Research dashboard error: '+err.message;
});
</script>
</body>
</html>`;
}
