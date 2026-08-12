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
    body { margin:0; background:#090b10; color:#f4f6fb; }
    main { width:min(1220px,calc(100% - 28px)); margin:0 auto; padding:28px 0 60px; }
    .top { display:flex; gap:18px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; }
    .topPills { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    h1 { font-size:clamp(28px,4vw,52px); margin:0; letter-spacing:-.04em; }
    h2 { font-size:24px; margin:4px 0 6px; letter-spacing:-.025em; }
    h3 { margin:0; font-size:24px; letter-spacing:-.025em; }
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
    .portfolioHead { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; margin-bottom:14px; }
    .portfolioNote { max-width:860px; color:#8792a5; font-size:12px; line-height:1.5; }
    .sectionGap { margin-top:28px; }
    .positionGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .positionCard { border:1px solid #2a3446; border-radius:16px; background:linear-gradient(180deg,#0d141e,#0b1018); padding:16px; }
    .positionTop { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
    .positionIdentity { display:flex; gap:12px; align-items:flex-start; }
    .positionSymbol { font-size:28px; font-weight:900; letter-spacing:-.035em; }
    .positionContract { color:#8f9ab0; font-size:12px; margin-top:4px; word-break:break-all; }
    .positionFacts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-top:15px; }
    .fact { padding:10px; border-radius:10px; background:#121824; border:1px solid #20293a; }
    .fact b { display:block; font-size:16px; }
    .fact span { display:block; color:#717d93; font-size:9px; letter-spacing:.07em; text-transform:uppercase; margin-top:3px; }
    .priceBand { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-top:10px; }
    .priceBox { padding:11px; border-radius:10px; background:#0f151f; border:1px solid #222c3d; }
    .priceBox b { font-size:18px; display:block; }
    .priceBox span { color:#758096; font-size:9px; text-transform:uppercase; letter-spacing:.07em; display:block; margin-top:3px; }
    .pnlBand { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }
    .pnlBox { padding:12px; border-radius:11px; background:#101720; border:1px solid #243044; }
    .pnlBox b { font-size:20px; display:block; }
    .pnlBox span { color:#778399; font-size:10px; display:block; margin-top:3px; }
    .timeline { margin-top:16px; padding-top:14px; border-top:1px solid #20293a; }
    .timelineHeader { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .timelineHeader b { font-size:15px; }
    .timelineTrack { height:9px; border-radius:999px; background:#1a2230; overflow:hidden; margin:10px 0 7px; }
    .timelineProgress { height:100%; border-radius:999px; background:linear-gradient(90deg,#5d75a0,#7ff5ac); }
    .timelineProgress.overdue { background:linear-gradient(90deg,#9f6a3c,#f4d477); }
    .timelineSteps { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
    .timelineStep { color:#707c91; font-size:10px; line-height:1.35; }
    .timelineStep strong { color:#c6cfdf; display:block; font-size:10px; }
    .positionFooter { display:flex; justify-content:space-between; gap:12px; margin-top:13px; color:#788398; font-size:11px; flex-wrap:wrap; }
    code { color:#b9ccff; }
    @media (max-width:900px) { .grid{grid-template-columns:repeat(2,minmax(0,1fr));} .funnel{grid-template-columns:repeat(2,minmax(0,1fr));} .candidateGrid,.positionGrid{grid-template-columns:1fr;} .tablewrap{overflow:auto;} .engineMeta{text-align:left;} }
    @media (max-width:620px) { .positionFacts,.priceBand{grid-template-columns:repeat(2,minmax(0,1fr));} .timelineSteps{grid-template-columns:repeat(2,minmax(0,1fr));} }
    @media (max-width:520px) { .grid{grid-template-columns:1fr;} .funnel{grid-template-columns:1fr;} .topPills{justify-content:flex-start;} }
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
      <div><div class="label">Closest to a trade right now</div><div id="queueSummary" class="queueSummary">Loading candidates…</div></div>
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
        <h2>Open Trade Cockpit</h2>
        <div class="portfolioNote">Each position shows the full lifecycle: contract terms, entry, current quote, conservative close-now value, thesis score, planned strategy-horizon exit, and option expiry. The planned exit is the stored research horizon; actual collection/closure happens on the first eligible maintenance cycle after that horizon.</div>
      </div>
      <span id="portfolioSummary" class="pill">Loading</span>
    </div>
    <div id="openPositionCards" class="positionGrid"><div class="empty">Loading open positions…</div></div>

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
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt = iso => iso ? new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '—';
const dateOnly = iso => iso ? new Date(String(iso)+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'}) : '—';

function nextQuarterHour(){ const d=new Date(); const mins=d.getMinutes(); const add=15-(mins%15||15); d.setSeconds(0,0); d.setMinutes(mins+(add===0?15:add)); return d; }
function ageText(iso){ if(!iso)return 'never'; const s=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/1000)); if(s<60)return s+'s ago'; if(s<3600)return Math.floor(s/60)+'m ago'; return Math.floor(s/3600)+'h ago'; }
function durationText(ms){ const abs=Math.abs(ms); const mins=Math.round(abs/60000); if(mins<60)return mins+'m'; const hrs=mins/60; if(hrs<48)return hrs.toFixed(hrs<10?1:0)+'h'; return (hrs/24).toFixed(1)+'d'; }
function plannedExit(row){ if(row.lane==='system_test') return row.close_after_at || null; if(!row.filled_at || !row.horizon_minutes)return null; return new Date(new Date(row.filled_at).getTime()+(Number(row.horizon_minutes)*60000)).toISOString(); }
function dteText(expiry){ if(!expiry)return '—'; const end=new Date(String(expiry)+'T16:00:00'); const d=Math.ceil((end.getTime()-Date.now())/86400000); return d<0?'expired':d+'d left'; }
function returnPct(entry,price){ if(entry==null||price==null||Number(entry)<=0)return null; return ((Number(price)-Number(entry))/Number(entry))*100; }

function stageFor(x){
  const opp=Number(x.opportunity_score||0), dir=Math.abs(Number(x.directional_score||0)), rec=x.recommendation;
  const status=String(x.execution_status||''), execReason=String(x.execution_reason||'').toLowerCase();
  const reason=Array.isArray(x.reasons)?x.reasons.join(' ').toLowerCase():'';
  if(status==='filled')return {label:'PAPER FILLED',cls:'trade'};
  if(status==='budget_blocked')return {label:'BUDGET BLOCKED',cls:'blocked'};
  if(status==='requires_escalation'&&execReason.includes('open option debit risk'))return {label:'RISK BLOCKED',cls:'blocked'};
  if(status==='requires_escalation')return {label:'EXECUTION BLOCKED',cls:'blocked'};
  if(status==='blocked')return {label:'POLICY BLOCKED',cls:'blocked'};
  if(status==='market_closed')return {label:'MARKET CLOSED',cls:'blocked'};
  if(rec==='CALL'&&x.execution_contract_symbol)return {label:'CALL QUALIFIED',cls:'trade'};
  if(rec==='PUT'&&x.execution_contract_symbol)return {label:'PUT QUALIFIED',cls:'put'};
  if(rec==='CALL')return {label:'CALL THESIS',cls:'trade'};
  if(rec==='PUT')return {label:'PUT THESIS',cls:'put'};
  if(opp>=.60&&dir>=.20&&reason.includes('no ')&&reason.includes('option'))return {label:'OPTION FILTERED',cls:'blocked'};
  if(opp>=.60&&dir>=.20)return {label:'CHAIN CHECK',cls:'near'};
  if(opp>=.48||dir>=.16)return {label:'NEAR GATE',cls:'near'};
  return {label:'WATCHING',cls:''};
}

function renderCandidate(x){
  const opp=Number(x.opportunity_score||0), dir=Number(x.directional_score||0), conf=Number(x.confidence||0), dq=Number(x.data_quality||0), st=stageFor(x);
  const progress=Math.max(0,Math.min(100,(opp/.60)*100)), needle=Math.max(0,Math.min(100,((dir+1)/2)*100));
  const dirText=dir>.03?'Bullish +'+(dir*100).toFixed(0):dir<-.03?'Bearish '+(dir*100).toFixed(0):'Neutral '+(dir*100).toFixed(0);
  const gap=Math.max(0,.60-opp), reasons=Array.isArray(x.reasons)&&x.reasons.length?x.reasons.join(' · '):'Waiting for more evidence.';
  const exec=x.execution_contract_symbol?' Execution contract '+esc(x.execution_contract_symbol)+(x.execution_debit_usd==null?'':' · '+usd(x.execution_debit_usd))+'.':'';
  const execReason=x.execution_reason?' '+esc(x.execution_reason):'';
  return '<div class="candidate">'+
    '<div class="candidateTop"><div><div class="ticker">'+esc(x.ticker)+'</div><div class="detail">Pulse score '+(x.smart_score==null?'—':Number(x.smart_score).toFixed(1))+'</div></div><span class="badge '+st.cls+'">'+st.label+'</span></div>'+
    '<div class="scoreline"><span>Underlying opportunity</span><b>'+(opp*100).toFixed(1)+' / 60</b></div>'+
    '<div class="meter"><div class="fill '+(opp>=.60?'hit':'')+'" style="width:'+progress.toFixed(1)+'%"></div></div>'+
    '<div class="direction"><span>PUT</span><div class="dirbar"><span class="needle" style="left:'+needle.toFixed(1)+'%"></span></div><span>CALL</span></div>'+
    '<div class="microgrid"><div class="micro"><b>'+esc(dirText)+'</b><span>Direction</span></div><div class="micro"><b>'+(conf*100).toFixed(0)+'%</b><span>Confidence</span></div><div class="micro"><b>'+(dq*100).toFixed(0)+'%</b><span>Data quality</span></div></div>'+
    '<div class="reason">'+(gap>0?'Needs +'+(gap*100).toFixed(1)+' opportunity points. ':'Underlying gate cleared. ')+esc(reasons)+exec+execReason+'</div></div>';
}

function laneBadge(row){ return row.lane==='system_test'?'<span class="badge test">SYSTEM TEST</span>':'<span class="badge trade">STRATEGY</span>'; }
function sideText(row){ if(row.lane==='system_test')return String(row.option_type||'').toUpperCase()+' TEST'; return row.recommendation_type||row.option_type||'—'; }

function renderOpenPositionCard(row){
  const entry=row.lane==='system_test'?Number(row.entry_fill_price):Number(row.fill_price);
  const opened=row.lane==='system_test'?row.opened_at:row.filled_at;
  const plan=plannedExit(row);
  const planMs=plan?new Date(plan).getTime():null;
  const openedMs=opened?new Date(opened).getTime():null;
  const horizonMs=planMs!=null&&openedMs!=null?Math.max(1,planMs-openedMs):null;
  const elapsedMs=openedMs!=null?Date.now()-openedMs:null;
  const progress=horizonMs&&elapsedMs!=null?Math.max(0,Math.min(100,(elapsedMs/horizonMs)*100)):0;
  const overdue=planMs!=null&&Date.now()>=planMs;
  const bid=row.last_bid==null?null:Number(row.last_bid), ask=row.last_ask==null?null:Number(row.last_ask), mid=row.last_mark==null?null:Number(row.last_mark);
  const conservative=row.conservative_exit_pnl_usd==null?null:Number(row.conservative_exit_pnl_usd);
  const ref=row.unrealized_pnl_usd==null?null:Number(row.unrealized_pnl_usd);
  const conservativePct=returnPct(entry,bid), refPct=returnPct(entry,mid);
  const pnlCls=conservative==null?'':conservative>0?'pnlpos':conservative<0?'pnlneg':'';
  const refCls=ref==null?'':ref>0?'pnlpos':ref<0?'pnlneg':'';
  const quoteAge=row.last_marked_at?ageText(row.last_marked_at):'waiting';
  const status=row.lane==='system_test'?'SYSTEM TEST':overdue?'EXIT DUE':'HOLDING';
  const statusCls=row.lane==='system_test'?'test':overdue?'near':'trade';
  const type=String(row.option_type||row.recommendation_type||'').toUpperCase();
  const strike=row.strike==null?'—':'$'+Number(row.strike).toFixed(2);
  const thesis=row.underlying_opportunity_score==null?'—':(Number(row.underlying_opportunity_score)*100).toFixed(1);
  const remaining=planMs==null?'No plan':overdue?'Due '+durationText(Date.now()-planMs)+' ago':durationText(planMs-Date.now())+' remaining';
  const feed=row.quote_feed?String(row.quote_feed).toUpperCase():'QUOTE';
  return '<article class="positionCard">'+
    '<div class="positionTop"><div class="positionIdentity"><div>'+laneBadge(row)+'</div><div><div class="positionSymbol">'+esc(row.ticker)+' <span class="'+(type.includes('PUT')?'put':'call')+'">'+esc(type)+'</span></div><div class="positionContract">'+esc(row.contract_symbol)+'</div></div></div><span class="badge '+statusCls+'">'+status+'</span></div>'+
    '<div class="positionFacts">'+
      '<div class="fact"><b>'+strike+'</b><span>Strike</span></div>'+
      '<div class="fact"><b>'+dateOnly(row.expiration_date)+'</b><span>Expiry · '+dteText(row.expiration_date)+'</span></div>'+
      '<div class="fact"><b>'+usd(row.notional_usd)+'</b><span>Debit at open</span></div>'+
      '<div class="fact"><b>'+thesis+'</b><span>Opportunity at entry</span></div>'+
    '</div>'+
    '<div class="priceBand">'+
      '<div class="priceBox"><b>$'+entry.toFixed(2)+'</b><span>Opened at</span></div>'+
      '<div class="priceBox"><b>'+(bid==null?'—':'$'+bid.toFixed(2))+'</b><span>Bid · close-now ref</span></div>'+
      '<div class="priceBox"><b>'+(mid==null?'—':'$'+mid.toFixed(2))+'</b><span>Mid · reference</span></div>'+
      '<div class="priceBox"><b>'+(ask==null?'—':'$'+ask.toFixed(2))+'</b><span>Ask</span></div>'+
    '</div>'+
    '<div class="pnlBand">'+
      '<div class="pnlBox"><b class="'+pnlCls+'">'+(conservative==null?'—':usd(conservative))+(conservativePct==null?'':' · '+conservativePct.toFixed(1)+'%')+'</b><span>Conservative P&amp;L if exited near bid now</span></div>'+
      '<div class="pnlBox"><b class="'+refCls+'">'+(ref==null?'—':usd(ref))+(refPct==null?'':' · '+refPct.toFixed(1)+'%')+'</b><span>Midpoint reference P&amp;L — not an assumed fill</span></div>'+
    '</div>'+
    '<div class="timeline"><div class="timelineHeader"><div><div class="label">Trade lifecycle</div><b>'+remaining+'</b></div><div class="detail">Planned horizon exit '+dt(plan)+'</div></div>'+
      '<div class="timelineTrack"><div class="timelineProgress '+(overdue?'overdue':'')+'" style="width:'+progress.toFixed(1)+'%"></div></div>'+
      '<div class="timelineSteps"><div class="timelineStep"><strong>1 · OPENED</strong>'+dt(opened)+'</div><div class="timelineStep"><strong>2 · MONITORING</strong>'+esc(feed)+' quote · '+quoteAge+'</div><div class="timelineStep"><strong>3 · PLANNED EXIT</strong>'+dt(plan)+'</div><div class="timelineStep"><strong>4 · OPTION EXPIRY</strong>'+dateOnly(row.expiration_date)+' · '+dteText(row.expiration_date)+'</div></div>'+
    '</div>'+
    '<div class="positionFooter"><span>'+esc(row.lane==='strategy'?'Strategy horizon controls planned close; maintenance records the first eligible outcome after it.':'Mechanical system-test close schedule.')+'</span><span>'+esc(row.mark_error||'Quote refreshed from configured Alpaca option feed.')+'</span></div>'+
  '</article>';
}

function renderPortfolio(portfolio){
  const strategyOpen=portfolio.strategy?.open||[], systemOpen=portfolio.system_test?.open||[], strategyClosed=portfolio.strategy?.closed||[], systemClosed=portfolio.system_test?.closed||[];
  const opens=[...strategyOpen,...systemOpen], closed=[...strategyClosed,...systemClosed];
  document.querySelector('#portfolioSummary').textContent=opens.length+' OPEN · '+closed.length+' CLOSED';
  const cards=document.querySelector('#openPositionCards');
  cards.innerHTML=opens.length?opens.map(renderOpenPositionCard).join(''):'<div class="empty">No open paper positions yet.</div>';
  const closedRows=document.querySelector('#closedTradeRows');
  if(!closed.length){ closedRows.innerHTML='<tr><td colspan="8">No completed paper trades yet.</td></tr>'; }
  else { closedRows.innerHTML=closed.map(row=>{ const entry=row.lane==='system_test'?row.entry_fill_price:row.fill_price; const pnl=Number(row.realized_pnl_usd||0); const cls=pnl>0?'pnlpos':pnl<0?'pnlneg':''; return '<tr><td>'+laneBadge(row)+'</td><td><b>'+esc(row.ticker)+'</b></td><td>'+esc(sideText(row))+'</td><td>'+esc(row.contract_symbol)+'</td><td>'+(entry==null?'—':'$'+Number(entry).toFixed(2))+'</td><td>'+(row.exit_price==null?'—':'$'+Number(row.exit_price).toFixed(2))+'</td><td class="'+cls+'">'+usd(pnl)+'</td><td>'+(row.closed_at?new Date(row.closed_at).toLocaleString():'—')+'</td></tr>'; }).join(''); }
}

function renderPolicyAndRisk(portfolio){
  const risk=portfolio.risk||{}, policy=portfolio.active_policy||null, over=Boolean(risk.open_risk_over_cap);
  document.querySelector('#riskSummary').textContent='Today deployed '+usd(risk.today_deployed_usd||0)+' · current open risk '+usd(risk.current_open_strategy_risk_usd||0)+(over&&policy?' · OVER '+usd(policy.max_open_risk_usd)+' CAP':'');
  const state=document.querySelector('#policyState');
  if(!policy){ state.textContent='Policy unavailable'; state.className='pill policywarn'; return; }
  const mode=String(policy.mode||'standard').toUpperCase(); state.textContent=mode+' · '+usd(policy.max_single_trade_usd)+' MAX'; state.className='pill '+(over?'policywarn':'policyok');
  state.title='Daily cap '+usd(policy.daily_hard_cap_usd)+' · open-risk cap '+usd(policy.max_open_risk_usd)+' · loss stop '+usd(policy.daily_loss_stop_usd)+' · minimum opportunity '+Number(policy.min_opportunity_score||0).toFixed(2);
}

async function loadSession(){
  try {
    const res=await fetch('/api/session/status',{cache:'no-store'}); if(!res.ok)throw new Error('HTTP '+res.status); const session=await res.json(); const latest=session.latest_cycle||null,today=session.today||{},state=document.querySelector('#engineState');
    state.innerHTML='<span class="dot"></span>'+(latest&&latest.status==='completed'?'Radar Live':latest?esc(latest.status):'Waiting');
    document.querySelector('#lastCycle').textContent=latest?'Last cycle '+ageText(latest.completed_at||latest.started_at)+' · '+(latest.candidates_seen||0)+' candidates':'No cycle yet today';
    document.querySelector('#nextWake').textContent='Next decision wake ~'+nextQuarterHour().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' · maintenance every ~5m';
    document.querySelector('#queueSummary').textContent=(today.calls||0)+' CALL · '+(today.puts||0)+' PUT · '+(today.passes||0)+' PASS · '+(today.paper_fills||0)+' fills today';
    const queue=document.querySelector('#tradeQueue'); const candidates=session.latest_cycle_diagnostics&&Array.isArray(session.latest_cycle_diagnostics.closest_to_underlying_gate)?session.latest_cycle_diagnostics.closest_to_underlying_gate:[];
    queue.innerHTML=candidates.length?candidates.slice(0,6).map(renderCandidate).join(''):'<div class="empty">No candidates in the latest cycle yet.</div>';
  } catch(err){ document.querySelector('#engineState').textContent='Status unavailable'; document.querySelector('#tradeQueue').innerHTML='<div class="empty">Live decision visualizer error: '+esc(err.message)+'</div>'; }
}

async function loadCore(){
  const [proofRes,oppRes,portfolioRes]=await Promise.all([fetch('/api/proof',{cache:'no-store'}),fetch('/api/opportunities?limit=30',{cache:'no-store'}),fetch('/api/paper/portfolio',{cache:'no-store'})]);
  if(!proofRes.ok||!oppRes.ok||!portfolioRes.ok)throw new Error('One or more Radar APIs are unavailable');
  const proof=await proofRes.json(),opp=await oppRes.json(),portfolio=await portfolioRes.json();
  document.querySelector('#predictions').textContent=proof.prediction_count??0; document.querySelector('#openPaper').textContent=proof.paper?.open_count??0; document.querySelector('#closedPaper').textContent=proof.paper?.closed_count??0; document.querySelector('#paperPnl').textContent=usd(proof.paper?.realized_pnl_usd??0);
  document.querySelector('#paperWin').textContent='Win rate '+pctRatio(proof.paper?.closed_win_rate)+' · avg '+pctValue(proof.paper?.avg_closed_return_pct); document.querySelector('#markOutcomes').textContent=proof.option_reference?.outcome_count??0; document.querySelector('#markWin').textContent='Reference win rate '+pctRatio(proof.option_reference?.win_rate)+' · avg '+pctValue(proof.option_reference?.avg_return_pct); document.querySelector('#execOutcomes').textContent=proof.executable?.outcome_count??0; document.querySelector('#execWin').textContent='Executable win rate '+pctRatio(proof.executable?.win_rate)+' · avg '+pctValue(proof.executable?.avg_return_pct);
  document.querySelector('#targets').textContent=proof.outcome_targets?.measured??0; document.querySelector('#targetDetail').textContent=(proof.outcome_targets?.pending??0)+' pending · '+(proof.outcome_targets?.retrying??0)+' retrying · '+(proof.outcome_targets?.failed??0)+' failed'; document.querySelector('#cycles').textContent=proof.paper_cycles?.completed??0; document.querySelector('#cycleDetail').textContent=(proof.paper_cycles?.failed??0)+' failed cycles';
  const warning=document.querySelector('#warning'),warnings=Array.isArray(proof.warnings)?proof.warnings:[]; warning.textContent=warnings.length?warnings.join(' '):'Minimum sample warnings cleared. This still does not guarantee future profitability.';
  renderPolicyAndRisk(portfolio); renderPortfolio(portfolio);
  const rows=document.querySelector('#rows'); if(!opp.length){rows.innerHTML='<tr><td colspan="8">No predictions yet.</td></tr>';return;}
  rows.innerHTML=opp.map(x=>{ const cls=x.recommendation_type==='CALL'?'call':x.recommendation_type==='PUT'?'put':'pass'; return '<tr><td><b>'+esc(x.ticker)+'</b></td><td class="'+cls+'">'+esc(x.recommendation_type)+'</td><td>'+pctRatio(x.confidence)+'</td><td>'+score(x.estimated_ev_score)+'</td><td>'+esc(x.contract_symbol||'—')+'</td><td>'+(x.ask==null?'—':'$'+Number(x.ask).toFixed(2))+'</td><td>'+esc(x.paper_status||'not run')+'</td><td>'+new Date(x.published_at).toLocaleString()+'</td></tr>'; }).join('');
}

loadCore().catch(err=>{document.querySelector('#warning').textContent='Dashboard error: '+err.message;}); loadSession(); setInterval(loadSession,10000); setInterval(()=>loadCore().catch(()=>{}),60000);
</script>
</body>
</html>`;
}
