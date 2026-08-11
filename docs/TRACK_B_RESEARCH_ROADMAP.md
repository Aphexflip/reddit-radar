# Track B — Historical Research & Calibration Roadmap

## Mission

Build the historical intelligence layer that answers:

> Given only information that was knowable at a past timestamp, what happened next to the stock and to comparable options, and how similar is today's setup?

Track B must improve the live CALL / PUT / PASS engine without contaminating the forward paper experiment.

## Non-negotiables

1. **No leakage.** A feature row may contain only values available at or before its `as_of_time`.
2. **Source-time and ingestion-time stay separate.** Late-arriving data is tagged, never silently backdated.
3. **Raw data is immutable.** R2 stores raw historical payloads and large partitions; D1 stores manifests, status, features, labels, and evaluation metadata.
4. **Historical research never rewrites forward predictions.** Track A remains an untouched forward truth ledger.
5. **PASS is evaluated.** Avoiding bad trades is part of the model's performance.
6. **Research-grade and execution-grade option data stay separate.** No blended flattering return series.
7. **Every backtest is versioned.** Dataset version, feature version, strategy version, friction model, and code commit are persisted.
8. **Walk-forward first.** Random train/test splits are not acceptable for time-series strategy claims.

---

## Product architecture

```text
Historical sources
  ↓
Raw immutable partitions (R2)
  ↓
Backfill manifests / coverage ledger (D1)
  ↓
Point-in-time feature snapshots
  ↓
Forward outcome labels
  ↓
Historical setup fingerprints
  ↓
Walk-forward backtests + controls
  ↓
Calibration tables
  ↓
Similarity / comparable-setup service
  ↓
Live CALL / PUT / PASS engine
```

---

## Phase 0 — Foundation and observability

**Goal:** make research work measurable before downloading large datasets.

Deliverables:

- research dataset registry
- backfill-run ledger
- partition coverage table
- feature-set registry
- setup snapshot table
- historical outcome-label table
- backtest-run table
- calibration-bin table
- dashboard research status endpoint
- explicit lineage from every feature row back to dataset partitions

Exit criteria:

- every ingestion job can resume idempotently
- coverage can be queried by ticker/date/source
- failed partitions have retry state and error reason
- live Track A tables remain untouched

---

## Phase 1 — Underlying market history

**Initial universe:** liquid U.S. equities and ETFs most likely to appear in Reddit Pulse, beginning with SPY, QQQ, NVDA, AMD, AAPL, MSFT, META, TSLA, AMZN, GOOGL and expanding systematically.

Collect / derive:

- 1-minute and daily OHLCV
- prior-close gap
- 5m / 15m / 30m / 60m / 1d returns
- realized volatility
- relative volume
- intraday range position
- distance from VWAP where reconstructable
- market/sector relative strength
- SPY / QQQ regime context
- time-of-day / day-of-week features

Outcome labels:

- +30m
- +2h
- market close
- +1 trading day
- +3 trading days
- +5 trading days
- maximum favorable excursion
- maximum adverse excursion

Exit criteria:

- point-in-time market fingerprints can be built for arbitrary covered ticker/timestamps
- all labels are generated strictly after `as_of_time`

---

## Phase 2 — Historical options warehouse

Collect options history where licensed/available and keep provider quality explicit.

Features:

- contract symbol
- call/put
- strike / moneyness
- expiration / DTE
- trade bars / quote quality when available
- bid / ask / spread
- IV
- delta / gamma / theta / vega where available
- volume / open interest
- underlying price at snapshot
- option-price change before signal
- IV change before signal

Derived contract families for comparable research:

- 0.25–0.35 delta
- 0.35–0.45 delta
- ATM
- 7–13 DTE
- 14–30 DTE
- 31–60 DTE

Labels:

- option return at each standard horizon
- +25% hit
- +50% hit
- +100% hit
- stop / drawdown thresholds
- MFE / MAE
- time to target
- expired worthless / intrinsic value at expiry where applicable

Exit criteria:

- historical CALL/PUT expressions can be compared without pretending a trade-bar close was a guaranteed executable fill

---

## Phase 3 — Catalyst and event history

Sources, in priority order:

1. SEC EDGAR historical filings
2. earnings calendar / reported results
3. corporate actions and major scheduled events
4. reputable news/event source
5. relationship-graph events
6. macro / regulatory events

Event features:

- catalyst class
- source reliability
- event age
- novelty
- scheduled vs unscheduled
- earnings distance
- event direction if derived from structured facts
- whether price had already moved before observation

SEC rule:

- filing presence alone remains neutral
- directional features require facts parsed from the filing that were available at the time

---

## Phase 4 — Reddit historical intelligence

Use whatever historical Pulse data exists without fabricating missing history.

Features:

- mentions current window
- prior-window mentions
- acceleration / growth
- sentiment level
- sentiment shift
- subreddit breadth
- engagement
- author concentration / source concentration where available
- novelty versus recent ticker baseline
- whether attention followed price versus preceded price

Critical research question:

> Does Reddit add predictive information after controlling for contemporaneous price/volume/catalyst state?

If the answer is no, its weight must fall rather than being protected because it is the project's origin.

---

## Phase 5 — Setup fingerprint

One immutable row per historical decision point.

Example feature families:

- `reddit.*`
- `market.*`
- `regime.*`
- `catalyst.*`
- `options.*`
- `relationship.*`
- `quality.*`

Each snapshot stores:

- `as_of_time`
- ticker/entity
- feature-set version
- feature JSON + stable hash
- source partition lineage
- missingness flags
- data-quality score

No future outcome fields live in the feature payload.

---

## Phase 6 — Backtesting protocol

Required evaluation sequence:

1. historical reconstruction
2. leakage audit
3. expanding-window / rolling walk-forward
4. untouched time holdout
5. forward paper comparison

Required controls:

- SPY same horizon
- underlying direction-only trade
- comparable ATM option
- random eligible ticker/time
- simple price momentum baseline
- simple mean-reversion baseline
- Reddit-only model
- market-only model
- catalyst-only model
- combined model

Metrics:

- sample count
- win rate with confidence interval
- median / mean return
- MFE / MAE
- hit rates for +25 / +50 / +100%
- downside tail
- calibration error
- precision by score bucket
- recall of large winners
- PASS opportunity cost
- estimated friction-adjusted performance
- performance by market regime / ticker / catalyst / DTE / time of day

No strategy graduates because of one attractive aggregate return number.

---

## Phase 7 — Calibration and similarity engine

For today's setup, the live engine should be able to retrieve historical neighbors using only point-in-time features.

Initial method:

- standardized numeric feature vector
- explicit categorical filters for catalyst/DTE/regime
- missingness-aware distance
- nearest-neighbor comparable set

Return to live engine:

- comparable sample count
- similarity distribution
- historical directional hit rate
- median stock return
- option target hit rates
- downside distribution
- calibration confidence
- which features most differentiated the neighbors

Minimum sample rules prevent tiny neighborhoods from generating false confidence.

---

## Phase 8 — Learned scoring

Only after sufficient clean historical + forward data:

- learn component weights
- compare simple interpretable models first
- keep deterministic baseline alive as a control
- version all model bundles
- never auto-promote a model without holdout + forward evidence

Potential models, in order:

1. logistic / linear models
2. gradient boosted trees
3. survival/time-to-target models
4. richer sequence/event models only if they add measurable out-of-sample value

---

## Dashboard information architecture

### 1. LIVE

- market state
- latest autonomous cycle
- candidates
- CALL / PUT / PASS
- paper positions
- errors / health

### 2. RESEARCH WAREHOUSE

- datasets
- date coverage
- symbols covered
- partitions complete / missing / failed
- rows/features generated
- option-history coverage
- event-history coverage
- Reddit-history coverage

### 3. BACKTESTS

- active strategy version
- latest walk-forward run
- train / validation / holdout periods
- sample sizes
- control comparisons
- performance by feature family
- leakage status

### 4. CALIBRATION

- score bucket vs realized hit rate
- sample sizes
- confidence intervals
- historical-neighbor quality
- live-vs-historical drift

### 5. PROOF

- immutable forward predictions
- paper P&L
- option-reference outcomes
- execution-grade outcomes
- sample warnings

---

## Immediate build order

### Milestone B0 — Research control plane

Build now:

- D1 migration for research registry / backfill / feature / label / backtest metadata
- `/api/research/status`
- dashboard Research tab
- roadmap and status fields

### Milestone B1 — Alpaca underlying backfill

- bounded symbol universe
- resumable day partitions
- raw response objects in R2
- coverage manifests in D1
- derived market features

### Milestone B2 — Option history backfill

- historical contracts and bars
- normalized research option observations
- target-return labels

### Milestone B3 — SEC + earnings event history

### Milestone B4 — Historical Reddit reconstruction

### Milestone B5 — Walk-forward backtest runner

### Milestone B6 — Historical-neighbor API and live integration

---

## Success definition

Track B succeeds when the live engine can say something defensible like:

> This setup has 246 valid historical comparables under feature set v3. In the untouched walk-forward sample, similar 14–30 DTE calls hit +25% within three trading days 58% of the time versus 41% for the matched baseline. Median max drawdown was -18%. Current data quality is high and no drift warning is active.

Until the system has enough samples to make that statement honestly, it should display **INSUFFICIENT EVIDENCE** rather than inventing probability.
