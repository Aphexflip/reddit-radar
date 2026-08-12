export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Reddit Radar — Options Intelligence</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing:border-box; }
    body { margin: 0; background: #090b10; color: #f4f6fb; }
    main { width: min(1220px, calc(100% - 28px)); margin: 0 auto; padding: 28px 0 60px; }
    .top { display:flex; gap:18px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; }
    .topPills { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    h1 { font-size: clamp(28px, 4vw, 52px); margin: 0; letter-spacing:-.04em; }
    h2 { font-size:24px; margin:4px 0 6px; letter-spacing:-.025em; }
    .sub { color:#9ca5b8; max-width:850px; line-height:1.5; }
    .pill { border:1px solid #30394b; border-radius:999px; padding:8px 12px; color:#dbe6ff; background:#141925; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    .policyok { color:#7ff5ac; border-color:#28563a; background:#0e2016; }
    .policywarn { color:#f4d477; border-color:#665829; background:#201b0d; }
    .livepill { display:inline-flex; align-items:center; gap:7px; }
    .dot { width:8px; height:8px; border-radius:999px; background:#7ff5ac; box-shadow:0 0 14px #7ff5ac; animation:pulse 1.6s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:24px 0; }
    .card { border:1px solid #232a38; background:#10141d; border-radius:16px; padding:16px; }
    .metric { font-size:28px; font-weight:800; margin-top:5px; }
    .label { color:#8f98aa; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
    .detail { color:#7f899b; font-size:12px; line-height:1.4; margin-top:8px; }
    .brain { margin-top:24px; border-color:#2e3b50; background:linear-gradient(180deg,#111823,#0e131c); }
    .brainhead { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; flex-wrap:wrap; }
    .engineMeta { text-align:right; min-width:220px; }
    .engineMeta .detail { margin-top:6px; }
    .funnel { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; margin:18px 0; }
    .stage { border:1px solid #273145; border-radius:12px; padding:12px; background:#0d121a; min-height:75px; }
    .stage strong { display:block; font-size:13px; margin-bottom:5px; }
    .stage span { color:#7f899b; font-size:11px; line-height:1.35; }
    .arrow { color:#59657a; display:none; }
    .queueHead { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin:20px 0 10px; }
    .queueSummary { color:#96a0b3; font-size:12px; }
    .candidateGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .candidate { border:1px solid #252e3e; border-radius:14px; padding:14px; background:#0c1118; }
    .candidateTop { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .ticker { font-size:21px; font-weight:900; letter-spacing:-.02em; }
    .badge { border:1px solid #344057; border-radius:999px; padding:5px 8px; font-size:10px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:#b9c4d7; white-space:nowrap; }
    .badge.near { color:#f4d477; border-color:#665829; background:#201b0d; }
    .badge.trade { color:#7ff5ac; border-color:#28563a; background:#0e2016; }
    .badge.put { color:#ff9ba5; border-color:#61323b; background:#251014; }
    .badge.blocked { color:#ffb579; border-color:#6b4930; background:#24170d; }
    .badge.test { color:#b9ccff; border-color:#39517c; background:#10182a; }
    .scoreline { display:flex; justify-content:space-between; gap:10px; margin-top:13px; font-size:12px; color:#a5afc0; }
    .meter { height:8px; background:#1b2230; border-radius:999px; overflow:hidden; margin-top:6px; position:relative; }
    .meter::after { content:""; position:absolute; top:0; bottom:0; left:100%; width:1px; background:#e8edf7; opacity:.5; }
    .fill { height:100%; border-radius:999px; background:linear-gradient(90deg,#65748d,#9db8ea); }
    .fill.hit { background:linear-gradient(90deg,#4cb878,#7ff5ac); }
    .direction { display:flex; gap:8px; align-items:center; margin-top:12px; color:#a5afc0; font-size:12px; }
    .dirbar { flex:1; height:7px; border-radius:999px; background:linear-gradient(90deg,#ff7d89 0%,#263044 48%,#263044 52%,#69e99d 100%); position:relative; }
    .needle { position:absolute; top:-3px; width:2px; height:13px; background:white; box-shadow:0 0 7px white; }
    .reason { margin-top:12px; color:#8792a5; font-size:12px; line-height:1.45; border-top:1px solid #202735; padding-top:10px; }
    .microgrid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-top:10px; }
    .micro { background:#121824; border-radius:9px; padding:8px; }
    .micro b { display:block; font-size:13px; }
    .micro span { display:block; color:#6f7a8f; font-size:9px; text-transform:uppercase; letter-spacing:.06em; margin-top:2px; }
    .empty { color:#7f899b; padding:18px 0; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th,td { text-align:left; padding:12px 10px; border-bottom:1px solid #212735; vertical-align:top; }
    th { color:#8f98aa; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .call { color:#7ff5ac; font-weight:800; }
    .put { color:#ff8d98; font-weight:800; }
    .pass { color:#aab2c2; font-weight:800; }
    .pnlpos { color:#7ff5ac; font-weight:800; }
    .pnlneg { color:#ff8d98; font-weight:800; }
    .warn { border:1px solid #665829; background:#201b0d; color:#f4d477; padding:12px 14px; border-radius:12px; margin:16px 0; line-height:1.5; }
    .portfolio { margin:24px 0; }
    .portfolioHead { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; margin-bottom:10px; }
    .portfolioNote { max-width:780px; color:#8792a5; font-size:12px; line-height:1.5; }
    .sectionGap { margin-top:24px; }
    code { color:#b9ccff; }
    @media (max-width: 900px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .funnel{grid-template-columns:repeat(2,minmax(0,1fr));} .candidateGrid{grid-template-columns:1fr;} .tablewrap{overflow:auto;} .engineMeta{text-align:left;} }
    @media (max-width: 520px) { .grid { grid-template-columns:1fr; } .funnel{grid-template-columns:1fr;} .topPills{justify-content:flex-start;} }
  </style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>Options Intelligence</h1>
      <p class="sub">Internal proof dashboard. Recommendations are immutable. Paper P&amp;L, historical option-reference returns, and execution-grade returns are deliberately separated so a favorable mark cannot masquerade as a tradable edge.</p>
    </div>
    <div class="topPills">
      <span class="pill">Paper Mode</span>
      <span id="policyState" class="pill">Policy loading</span>
    </div>
  </div>

  <section class="card brain">
    <div class="brainhead">
      <div>
        <div class="label">Live decision engine</div>
        <h2>Trade Queue</h2>
        <div class="sub">Research contract ranking stays budget-independent. Execution v0.2 separately searches for the best quality contract inside the active paper budget, then applies the unchanged risk policy.</div>
      </div>
      <div class="engineMeta">
        <span id="engineState" class="pill livepill"><span class="dot"></span> Loading</span>
        <div id="lastCycle" class="detail">Waiting for session status…</div>
        <div id="nextWake" class="detail">—</div>
      </div>
    </div>

    <div class="funnel">
      <div class="stage"><strong>1 · DISCOVER</strong><span>Pulse mentions, acceleration and candidate ranking.</span></div>
      <div class="stage"><strong>2 · MARKET CHECK</strong><span>Intraday move, previous close, range position and volume context.</span></div>
      <div class="stage"><strong>3 · EVIDENCE GATE</strong><span>Opportunity ≥ 60 and absolute direction ≥ 20.</span></div>
      <div class="stage"><strong>4 · OPTION CHECK</strong><span>Best research contract + best qualifying contract inside the active single-trade budget.</span></div>
      <div class="stage"><strong>5 · PAPER EXECUTE</strong><span>Daily target, open risk, hard cap and loss-stop policy decide simulated fill or block.</span></div>
    </div>

    <div class="queueHead">
      <div>
        <div class="label">Closest to a trade right now</div>
        <div id="queueSummary" class="queueSummary">Loading candidates…</div>
      </div>
      <div id="riskSummary" class="queueSummary">Loading current paper risk…</div>
    </div>
    <div id="tradeQueue" class="candidateGrid"><div class="empty">Loading live decision state…</div></div>
  </section>

  <div id="warning" class="warn">Loading proof ledger…</div>

  <section class="grid">
    <div class="card"><div class="label">Predictions</div><div id="predictions" class="metric">—</div><div class="detail">Immutable calls / puts / passes</div></div>
    <div class="card"><div class="label">Open strategy trades</div><div id="openPaper" class="metric">—</div><div class="detail">Autonomous strategy fills still awaiting horizon exit</div></div>
    <div class="card"><div class="label">Closed strategy trades</div><div id="closedPaper" class="metric">—</div><div id="paperWin" class="detail">—</div></div>
    <div class="card"><div class="label">Strategy realized P&amp;L</div><div id="paperPnl" class="metric">—</div><div class="detail">Paper exits; system tests excluded</div></div>
    <div class="card"><div class="label">Option reference outcomes</div><div id="markOutcomes" class="metric">—</div><div id="markWin" class="detail">—</div></div>
    <div class="card"><div class="label">Execution-grade outcomes</div><div id="execOutcomes" class="metric">—</div><div id="execWin" class="detail">—</div></div>
    <div class="card"><div class="label">Outcome checkpoints</div><div id="targets" class="metric">—</div><div id="targetDetail" class="detail">—</div></div>
    <div class="card"><div class="label">Autonomous cycles</div><div id="cycles" class="metric">—</div><div id="cycleDetail" class="detail">—</div></div>
  </section>

  <section class="card portfolio">
    <div class="portfolioHead">
      <div>
        <div class="label">Paper portfolio</div>
        <h2>Open Positions</h2>
        <div class="portfolioNote">Midpoint marks are reference values, not assumed exits. For strategy positions Radar now shows both midpoint reference P&amp;L and a more conservative bid-side exit P&amp;L. <b>SYSTEM TEST</b> rows remain excluded from strategy proof.</div>
      </div>
      <span id="portfolioSummary" class="pill">Loading</span>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Lane</th><th>Ticker</th><th>Side</th><th>Contract</th><th>Entry</th><th>Debit</th><th>Mark / Exit P&amp;L</th><th>Opened</th></tr></thead>
        <tbody id="openPositionRows"><tr><td colspan="8">Loading…</td></tr></tbody>
      </table>
    </div>

    <div class="sectionGap">
      <div class="label">Paper portfolio</div>
      <h2>Completed Trades</h2>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Lane</th><th>Ticker</th><th>Side</th><th>Contract</th><th>Entry</th><th>Exit</th><th>Realized P&amp;L</th><th>Closed</th></tr></thead>
          <tbody id="closedTradeRows"><tr><td colspan="8">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="label">Latest immutable opportunities</div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Ticker</th><th>Verdict</th><th>Confidence</th><th>EV rank</th><th>Research contract</th><th>Ask</th><th>Paper</th><th>Published</th></tr></thead>
        <tbody id="rows"><tr><td colspan="8">Loading…</td></tr></tbody>
      </table>
    </div>
  </section>

  <p class="sub">Core loop: <code>Pulse sync → Alpaca market evidence → evidence gate → research option rank → budget-aware execution contract → paper risk policy → scheduled outcome collection → proof ledger</code>.</p>
</main>
<script>
const pctRatio = n => n == null ? '—' : (n * 100).toFixed(1) + '%';
const pctValue = n => n == null ? '—' : Number(n).toFixed(1) + '%';
const score = n => n == null ? '—' : (n * 100).toFixed(0);
const usd = n => n == null ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n));
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function nextQuarterHour(){
  const d = new Date();
  const mins = d.getMinutes();
  const add = 15 - (mins % 15 || 15);
  d.setSeconds(0,0);
  d.setMinutes(mins + (add === 0 ? 15 : add));
  return d;
}

function ageText(iso){
  if (!iso) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return seconds + 's ago';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  return Math.floor(seconds / 3600) + 'h ago';
}

function stageFor(x){
  const opp = Number(x.opportunity_score || 0);
  const dir = Math.abs(Number(x.directional_score || 0));
  const rec = x.recommendation;
  const status = String(x.execution_status || '');
  const execReason = String(x.execution_reason || '').toLowerCase();
  const reason = Array.isArray(x.reasons) ? x.reasons.join(' ').toLowerCase() : '';
  if (status === 'filled') return {label:'PAPER FILLED', cls:'trade'};
  if (status === 'budget_blocked') return {label:'BUDGET BLOCKED', cls:'blocked'};
  if (status === 'requires_escalation' && execReason.includes('open option debit risk')) return {label:'RISK BLOCKED', cls:'blocked'};
  if (status === 'requires_escalation') return {label:'EXECUTION BLOCKED', cls:'blocked'};
  if (status === 'blocked') return {label:'POLICY BLOCKED', cls:'blocked'};
  if (status === 'market_closed') return {label:'MARKET CLOSED', cls:'blocked'};
  if (rec === 'CALL' && x.execution_contract_symbol) return {label:'CALL QUALIFIED', cls:'trade'};
  if (rec === 'PUT' && x.execution_contract_symbol) return {label:'PUT QUALIFIED', cls:'put'};
  if (rec === 'CALL') return {label:'CALL THESIS', cls:'trade'};
  if (rec === 'PUT') return {label:'PUT THESIS', cls:'put'};
  if (opp >= .60 && dir >= .20 && reason.includes('no ') && reason.includes('option')) return {label:'OPTION FILTERED', cls:'blocked'};
  if (opp >= .60 && dir >= .20) return {label:'CHAIN CHECK', cls:'near'};
  if (opp >= .48 || dir >= .16) return {label:'NEAR GATE', cls:'near'};
  return {label:'WATCHING', cls:''};
}

function renderCandidate(x){
  const opp = Number(x.opportunity_score || 0);
  const dir = Number(x.directional_score || 0);
  const conf = Number(x.confidence || 0);
  const dq = Number(x.data_quality || 0);
  const st = stageFor(x);
  const progress = Math.max(0, Math.min(100, (opp / .60) * 100));
  const needle = Math.max(0, Math.min(100, ((dir + 1) / 2) * 100));
  const dirText = dir > .03 ? 'Bullish +' + (dir * 100).toFixed(0) : dir < -.03 ? 'Bearish ' + (dir * 100).toFixed(0) : 'Neutral ' + (dir * 100).toFixed(0);
  const gap = Math.max(0, .60 - opp);
  const reasons = Array.isArray(x.reasons) && x.reasons.length ? x.reasons.join(' · ') : 'Waiting for more evidence.';
  const exec = x.execution_contract_symbol
    ? ' Execution contract ' + esc(x.execution_contract_symbol) + (x.execution_debit_usd == null ? '' : ' · ' + usd(x.execution_debit_usd)) + '.'
    : '';
  const execReason = x.execution_reason ? ' ' + esc(x.execution_reason) : '';
  return '<div class="candidate">' +
    '<div class="candidateTop"><div><div class="ticker">' + esc(x.ticker) + '</div><div class="detail">Pulse score ' + (x.smart_score == null ? '—' : Number(x.smart_score).toFixed(1)) + '</div></div><span class="badge ' + st.cls + '">' + st.label + '</span></div>' +
    '<div class="scoreline"><span>Underlying opportunity</span><b>' + (opp * 100).toFixed(1) + ' / 60</b></div>' +
    '<div class="meter"><div class="fill ' + (opp >= .60 ? 'hit' : '') + '" style="width:' + progress.toFixed(1) + '%"></div></div>' +
    '<div class="direction"><span>PUT</span><div class="dirbar"><span class="needle" style="left:' + needle.toFixed(1) + '%"></span></div><span>CALL</span></div>' +
    '<div class="microgrid">' +
      '<div class="micro"><b>' + esc(dirText) + '</b><span>Direction</span></div>' +
      '<div class="micro"><b>' + (conf * 100).toFixed(0) + '%</b><span>Confidence</span></div>' +
      '<div class="micro"><b>' + (dq * 100).toFixed(0) + '%</b><span>Data quality</span></div>' +
    '</div>' +
    '<div class="reason">' + (gap > 0 ? 'Needs +' + (gap * 100).toFixed(1) + ' opportunity points. ' : 'Underlying gate cleared. ') + esc(reasons) + exec + execReason + '</div>' +
  '</div>';
}

function laneBadge(row){
  return row.lane === 'system_test'
    ? '<span class="badge test">SYSTEM TEST</span>'
    : '<span class="badge trade">STRATEGY</span>';
}

function sideText(row){
  if (row.lane === 'system_test') return String(row.option_type || '').toUpperCase() + ' TEST';
  return row.recommendation_type || row.option_type || '—';
}

function quoteCell(row){
  if (row.last_mark != null) {
    const refPnl = Number(row.unrealized_pnl_usd || 0);
    const refCls = refPnl > 0 ? 'pnlpos' : refPnl < 0 ? 'pnlneg' : '';
    const bid = row.last_bid == null ? null : Number(row.last_bid);
    const ask = row.last_ask == null ? null : Number(row.last_ask);
    const conservative = row.conservative_exit_pnl_usd == null ? null : Number(row.conservative_exit_pnl_usd);
    const conservativeCls = conservative == null ? '' : conservative > 0 ? 'pnlpos' : conservative < 0 ? 'pnlneg' : '';
    const feed = row.quote_feed ? String(row.quote_feed).toUpperCase() : row.lane === 'system_test' ? 'TEST QUOTE' : 'QUOTE';
    const ref = 'MID $' + Number(row.last_mark).toFixed(2) + ' · <span class="' + refCls + '">' + usd(refPnl) + ' ref</span>';
    const exit = row.lane === 'strategy' && bid != null && conservative != null
      ? '<div class="detail">BID EXIT $' + bid.toFixed(2) + ' · <span class="' + conservativeCls + '">' + usd(conservative) + ' conservative</span></div>'
      : '';
    return ref + exit + '<div class="detail">bid ' + (bid == null ? '—' : '$' + bid.toFixed(2)) + ' · ask ' + (ask == null ? '—' : '$' + ask.toFixed(2)) + ' · ' + esc(feed) + ' · ' + ageText(row.last_marked_at) + '</div>';
  }
  if (row.mark_error) return '<span class="pnlneg">Mark unavailable</span><div class="detail">' + esc(row.mark_error) + '</div>';
  return 'Waiting for quote';
}

function renderPortfolio(portfolio){
  const strategyOpen = portfolio.strategy?.open || [];
  const systemOpen = portfolio.system_test?.open || [];
  const strategyClosed = portfolio.strategy?.closed || [];
  const systemClosed = portfolio.system_test?.closed || [];
  const opens = [...strategyOpen, ...systemOpen];
  const closed = [...strategyClosed, ...systemClosed];

  document.querySelector('#portfolioSummary').textContent = opens.length + ' OPEN · ' + closed.length + ' CLOSED';
  const openRows = document.querySelector('#openPositionRows');
  if (!opens.length) {
    openRows.innerHTML = '<tr><td colspan="8">No open paper positions yet.</td></tr>';
  } else {
    openRows.innerHTML = opens.map(row => {
      const entry = row.lane === 'system_test' ? row.entry_fill_price : row.fill_price;
      const opened = row.lane === 'system_test' ? row.opened_at : row.filled_at;
      return '<tr>' +
        '<td>' + laneBadge(row) + '</td>' +
        '<td><b>' + esc(row.ticker) + '</b></td>' +
        '<td>' + esc(sideText(row)) + '</td>' +
        '<td>' + esc(row.contract_symbol) + '</td>' +
        '<td>' + (entry == null ? '—' : '$' + Number(entry).toFixed(2)) + '</td>' +
        '<td>' + usd(row.notional_usd) + '</td>' +
        '<td>' + quoteCell(row) + '</td>' +
        '<td>' + (opened ? new Date(opened).toLocaleString() : '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  const closedRows = document.querySelector('#closedTradeRows');
  if (!closed.length) {
    closedRows.innerHTML = '<tr><td colspan="8">No completed paper trades yet.</td></tr>';
  } else {
    closedRows.innerHTML = closed.map(row => {
      const entry = row.lane === 'system_test' ? row.entry_fill_price : row.fill_price;
      const pnl = Number(row.realized_pnl_usd || 0);
      const cls = pnl > 0 ? 'pnlpos' : pnl < 0 ? 'pnlneg' : '';
      return '<tr>' +
        '<td>' + laneBadge(row) + '</td>' +
        '<td><b>' + esc(row.ticker) + '</b></td>' +
        '<td>' + esc(sideText(row)) + '</td>' +
        '<td>' + esc(row.contract_symbol) + '</td>' +
        '<td>' + (entry == null ? '—' : '$' + Number(entry).toFixed(2)) + '</td>' +
        '<td>' + (row.exit_price == null ? '—' : '$' + Number(row.exit_price).toFixed(2)) + '</td>' +
        '<td class="' + cls + '">' + usd(pnl) + '</td>' +
        '<td>' + (row.closed_at ? new Date(row.closed_at).toLocaleString() : '—') + '</td>' +
      '</tr>';
    }).join('');
  }
}

function renderPolicyAndRisk(portfolio){
  const risk = portfolio.risk || {};
  const policy = portfolio.active_policy || null;
  const riskSummary = document.querySelector('#riskSummary');
  const over = Boolean(risk.open_risk_over_cap);
  riskSummary.textContent = 'Today deployed ' + usd(risk.today_deployed_usd || 0) + ' · current open risk ' + usd(risk.current_open_strategy_risk_usd || 0) +
    (over && policy ? ' · OVER ' + usd(policy.max_open_risk_usd) + ' CAP' : '');

  const policyState = document.querySelector('#policyState');
  if (!policy) {
    policyState.textContent = 'Policy unavailable';
    policyState.className = 'pill policywarn';
    return;
  }
  const mode = String(policy.mode || 'standard').toUpperCase();
  policyState.textContent = mode + ' · ' + usd(policy.max_single_trade_usd) + ' MAX';
  policyState.className = 'pill ' + (over ? 'policywarn' : 'policyok');
  policyState.title = 'Daily cap ' + usd(policy.daily_hard_cap_usd) +
    ' · open-risk cap ' + usd(policy.max_open_risk_usd) +
    ' · loss stop ' + usd(policy.daily_loss_stop_usd) +
    ' · minimum opportunity ' + Number(policy.min_opportunity_score || 0).toFixed(2);
}

async function loadSession(){
  try {
    const res = await fetch('/api/session/status', {cache:'no-store'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const session = await res.json();
    const latest = session.latest_cycle || null;
    const today = session.today || {};
    const state = document.querySelector('#engineState');
    state.innerHTML = '<span class="dot"></span>' + (latest && latest.status === 'completed' ? 'Radar Live' : latest ? esc(latest.status) : 'Waiting');
    document.querySelector('#lastCycle').textContent = latest ? 'Last cycle ' + ageText(latest.completed_at || latest.started_at) + ' · ' + (latest.candidates_seen || 0) + ' candidates' : 'No cycle yet today';
    document.querySelector('#nextWake').textContent = 'Next decision wake ~' + nextQuarterHour().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) + ' · maintenance every ~5m';
    document.querySelector('#queueSummary').textContent = (today.calls || 0) + ' CALL · ' + (today.puts || 0) + ' PUT · ' + (today.passes || 0) + ' PASS · ' + (today.paper_fills || 0) + ' fills today';
    const queue = document.querySelector('#tradeQueue');
    const candidates = session.latest_cycle_diagnostics && Array.isArray(session.latest_cycle_diagnostics.closest_to_underlying_gate) ? session.latest_cycle_diagnostics.closest_to_underlying_gate : [];
    queue.innerHTML = candidates.length ? candidates.slice(0,6).map(renderCandidate).join('') : '<div class="empty">No candidates in the latest cycle yet.</div>';
  } catch (err) {
    document.querySelector('#engineState').textContent = 'Status unavailable';
    document.querySelector('#tradeQueue').innerHTML = '<div class="empty">Live decision visualizer error: ' + esc(err.message) + '</div>';
  }
}

async function loadCore(){
  const [proofRes, oppRes, portfolioRes] = await Promise.all([
    fetch('/api/proof', {cache:'no-store'}),
    fetch('/api/opportunities?limit=30', {cache:'no-store'}),
    fetch('/api/paper/portfolio', {cache:'no-store'}),
  ]);
  if (!proofRes.ok || !oppRes.ok || !portfolioRes.ok) throw new Error('One or more Radar APIs are unavailable');
  const proof = await proofRes.json();
  const opp = await oppRes.json();
  const portfolio = await portfolioRes.json();
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
  renderPolicyAndRisk(portfolio);
  renderPortfolio(portfolio);
  const rows = document.querySelector('#rows');
  if (!opp.length) { rows.innerHTML = '<tr><td colspan="8">No predictions yet.</td></tr>'; return; }
  rows.innerHTML = opp.map(x => {
    const cls = x.recommendation_type === 'CALL' ? 'call' : x.recommendation_type === 'PUT' ? 'put' : 'pass';
    return '<tr>' +
      '<td><b>' + esc(x.ticker) + '</b></td>' +
      '<td class="' + cls + '">' + esc(x.recommendation_type) + '</td>' +
      '<td>' + pctRatio(x.confidence) + '</td>' +
      '<td>' + score(x.estimated_ev_score) + '</td>' +
      '<td>' + esc(x.contract_symbol || '—') + '</td>' +
      '<td>' + (x.ask == null ? '—' : '$' + Number(x.ask).toFixed(2)) + '</td>' +
      '<td>' + esc(x.paper_status || 'not run') + '</td>' +
      '<td>' + new Date(x.published_at).toLocaleString() + '</td>' +
    '</tr>';
  }).join('');
}

loadCore().catch(err => { document.querySelector('#warning').textContent = 'Dashboard error: ' + err.message; });
loadSession();
setInterval(loadSession, 10000);
setInterval(() => loadCore().catch(() => {}), 60000);
</script>
</body>
</html>`;
}
