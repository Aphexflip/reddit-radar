# Reddit Radar / Pulse Markets — Options Intelligence

Internal-first market-intelligence system for discovering, challenging, paper-trading, and measuring bullish/bearish U.S. equity options opportunities.

## Status

**v0.1 is autonomous paper research only. Live trading is intentionally disabled.**

The working loop is now:

```text
Pulse Markets trend feed / SEC / direct events
  -> raw evidence + provenance
  -> normalized timestamped signals
  -> entity / relationship graph
  -> deterministic evidence score
  -> fresh Alpaca stock + option snapshots
  -> CALL / PUT / PASS
  -> option liquidity / spread / DTE gate
  -> immutable hash-linked prediction
  -> tiered paper execution
  -> scheduled outcome checkpoints
  -> autonomous historical outcome collection
  -> evidence-quality-aware proof dashboard
```

The goal is not to produce convincing stock commentary. The goal is to create falsifiable predictions and accumulate enough **forward** outcomes to determine whether any measurable edge survives realistic friction.

## Non-negotiable rule

**Evidence -> thesis -> adversarial challenge -> option -> immutable prediction -> outcome -> learning.**

Never start with a trade and search backward for reasons to justify it.

## Initial paper risk policy

- normal deployment target: **$50/day**
- hard autonomous cap: **$100/day**
- maximum autonomous single-trade debit: **$100**
- daily realized-loss stop: **$40**
- normal opportunity threshold: **0.60**
- exceptional `$50-$100` tier threshold: **0.75**
- above `$100/day` or above the single-trade cap: **requires escalation**
- 0DTE: disabled
- live execution: disabled
- wide-spread / low-volume / low-OI contracts: rejected
- budget does not alter research ranking; a high-quality contract can be surfaced for escalation instead of being replaced by a worse cheap contract

The paper executor uses the option **ask** as its conservative simulated entry. Current automatic exits use historical one-minute option trade-bar closes and are explicitly marked as **paper references, not broker-fill evidence**.

## Data/evidence classes

The proof layer keeps these separate:

1. **Option-reference outcomes** — historical one-minute option trade-bar references. Useful for research, not proof of executable returns.
2. **Forward paper P&L** — autonomous paper entries/exits under the configured risk policy. Better evidence, but still not live fills.
3. **Execution-grade outcomes** — reserved for bid/ask-aware or actual broker-fill evidence when that layer is added.

A single blended `win rate` is deliberately avoided.

## Current adapters

### Pulse Markets / Reddit Pulse

The options engine consumes the proven Pulse Markets backend read-only:

```text
https://redditpulse-v0.aphexflip.workers.dev/api/trends
```

`POST /api/pulse/sync` converts aggregate stock trends into versioned signals. Sentiment level/shift may vote directionally; mention velocity, growth, subreddit spread, and engagement are non-directional context. These are heuristic features until the outcome ledger proves incremental predictive value.

### SEC EDGAR

`POST /api/sec/poll` fetches recent company submissions. Filing/form/item detection is recorded as **neutral evidence**. A filing existing does not automatically mean bullish or bearish.

A declared `SEC_USER_AGENT` is required before polling.

### Alpaca development market/options adapter

`POST /api/alpaca/predict` refreshes the underlying, requests only the needed call or put side when evidence clears threshold, normalizes option contracts/snapshots, freezes the prediction, and schedules outcome checkpoints automatically.

Defaults:

- equities feed: `iex`
- options feed: `indicative`

The free/indicative options feed is **paper-research only**. The system reports whether the configured data combination is considered execution-grade; current defaults are not.

### Relationship graph

`POST /api/graph/relationship` creates provenance-backed typed relationships such as supplier/customer/product/competitor/regulatory exposure.

`POST /api/graph/expand` traverses up to three hops and surfaces connected tradable tickers. A graph connection nominates a candidate for investigation; it **never implies direction by itself**.

## Autonomous paper cycle

```http
POST /api/run/paper-cycle
Authorization: Bearer <WRITE_TOKEN>
Content-Type: application/json
```

Typical body:

```json
{
  "pulse_hours": 1,
  "trend_limit": 25,
  "candidate_limit": 10,
  "prediction_horizon_minutes": 1440,
  "signal_lookback_hours": 6
}
```

The cycle:

1. syncs top stock trends from Pulse Markets,
2. ranks candidate attention by Pulse score,
3. refreshes market/options data sequentially to stay provider-friendly,
4. freezes CALL / PUT / PASS predictions,
5. paper-executes only eligible CALL/PUT setups,
6. enforces normal vs exceptional budget tiers,
7. persists every candidate, prediction, fill/block/escalation, and error.

## Automated truth loop

Every Alpaca-backed prediction schedules:

- `30m_elapsed`
- `24h_elapsed`
- `72h_elapsed`
- `120h_elapsed`
- `predicted_elapsed`

Collect due checkpoints with:

```http
POST /api/outcomes/collect
Authorization: Bearer <WRITE_TOKEN>
Content-Type: application/json

{"limit":20}
```

The collector requests time-aligned historical stock/option bars and chooses the first available market bar at or after the target timestamp. This naturally rolls weekend/market-closure targets to the next available trading bar while preserving the original target timestamp and measured lag.

At `predicted_elapsed`, an open paper position is closed using the same historical option trade-bar reference, and the resulting paper P&L is fed into the daily realized-loss state so the loss kill switch has real feedback.

## Cloudflare resources

The Worker expects:

- D1 binding: `DB`
- R2 binding: `EVIDENCE`

`wrangler.jsonc` still contains a placeholder D1 database ID. The project is **not remotely deployed yet**.

Create resources:

```bash
npm install
npx wrangler d1 create reddit-radar-options-intelligence
npx wrangler r2 bucket create reddit-radar-evidence
```

Copy the real D1 database ID into `wrangler.jsonc`.

Apply migrations locally:

```bash
npm run db:local
```

Apply remotely after the real resource exists:

```bash
npx wrangler d1 migrations apply reddit-radar-options-intelligence --remote
```

## Secrets and runtime configuration

All write endpoints fail closed unless `WRITE_TOKEN` is configured.

Local setup:

```bash
cp .dev.vars.example .dev.vars
```

Required/optional runtime values:

```text
WRITE_TOKEN=<long random secret>
SEC_USER_AGENT=<app/org plus monitored contact>
ALPACA_API_KEY_ID=<paper/data key>
ALPACA_API_SECRET_KEY=<paper/data secret>
ALPACA_STOCK_FEED=iex
ALPACA_OPTION_FEED=indicative
PULSE_API_ORIGIN=https://redditpulse-v0.aphexflip.workers.dev   # optional override
PULSE_API_TOKEN=<optional if Pulse backend becomes protected>
```

Never commit real credentials.

Remote Worker secrets should be set through Wrangler/Cloudflare secret management, for example:

```bash
npx wrangler secret put WRITE_TOKEN
npx wrangler secret put ALPACA_API_KEY_ID
npx wrangler secret put ALPACA_API_SECRET_KEY
npx wrangler secret put SEC_USER_AGENT
```

## Run locally

```bash
npm install
npm run db:local
npm run dev
```

Open the local Worker URL for the proof dashboard.

## API map

Read:

```text
GET  /api/health
GET  /api/opportunities
GET  /api/proof
```

Protected writes:

```text
POST /api/events
POST /api/pulse/sync
POST /api/sec/poll
POST /api/graph/relationship
POST /api/graph/expand
POST /api/alpaca/predict
POST /api/run/paper-cycle
POST /api/predictions
POST /api/paper/execute/:predictionId
POST /api/outcomes/collect
POST /api/outcomes
```

All protected writes require:

```text
Authorization: Bearer <WRITE_TOKEN>
```

## Prediction behavior

The engine:

1. loads only evidence available before prediction time,
2. keeps neutral/context evidence out of the directional voting denominator,
3. scores the underlying opportunity separately from the option expression,
4. requests CALL or PUT candidates only after evidence clears threshold,
5. rejects poor spread/liquidity/DTE contracts,
6. returns `PASS` rather than forcing a bad option,
7. stores an immutable content hash linked to the prior prediction hash,
8. schedules its own future truth checkpoints.

`estimated_ev_score` is currently a **ranking score**, not a calibrated dollar expected-value claim. It must earn calibration from the forward outcome dataset.

## Validation

GitHub Actions validates every branch/PR push by running:

```bash
npm install
npm run db:local
npm test
npm run typecheck
npm run deploy:dry
```

Do not merge solely because the dashboard looks correct. All migrations, unit tests, generated Cloudflare types, TypeScript, and Wrangler dry-run must pass.

## Next major build targets

1. deploy this Worker with real D1/R2 resources and secrets,
2. run autonomous paper cycles continuously enough to create a forward sample,
3. add trading-session-aware outcome labels in addition to elapsed-time labels,
4. parse economically directional facts from SEC filings instead of treating filing presence as direction,
5. populate/learn the supplier/customer/product/competitor relationship graph,
6. add additional independent news/catalyst sources,
7. calibrate scoring components only after sufficient forward outcomes exist,
8. add Robinhood Agentic as the first live broker adapter only after paper/shadow reliability and execution-grade data thresholds are met.

## Live-trading boundary

There is currently **no live broker adapter enabled** and `EXECUTION_MODE=paper`.

That boundary stays in place until the prediction engine, execution engine, and outcome accounting each demonstrate reliable behavior independently. Profitability is not assumed or promised.
