# Reddit Radar / Reddit Pulse — Options Intelligence Architecture v0.1

## North star

Build a market-intelligence system that can answer one question with evidence:

> **Given only information available at this timestamp, which U.S. equity options setup has the highest estimated expected value after realistic trading friction, why, and how well has this class of prediction actually performed?**

The system is not allowed to optimize for persuasive explanations. It must optimize for measurable predictive edge.

## Non-negotiable architecture rules

1. **Evidence first.** No recommendation exists before the evidence snapshot.
2. **Event time and ingestion time are separate.** This is required to detect leakage and late data.
3. **Raw source data is preserved.** Normalized data never replaces source payloads.
4. **Vendor schemas stop at adapters.** Core tables are provider-neutral.
5. **Predictions are immutable snapshots.** Corrections create new records; old records stay intact.
6. **No hindsight edits.** Direction, magnitude, horizon, confidence, selected option, and invalidation rules are frozen when published.
7. **PASS is a first-class result.** A good company thesis can still be a bad option trade.
8. **Portfolio state cannot alter opportunity ranking.** Portfolio display/risk is a separate layer.
9. **Every recommendation must be benchmarkable.** We compare against simple baselines and time-matched controls.
10. **Aggressive does not mean indiscriminate.** Raw upside is secondary to estimated expected value.

## Cloud architecture

### Workers
Use Workers for API ingress, lightweight source adapters, orchestration, read APIs, and dashboard endpoints.

### Queues
Use separate queues for logical failure domains:

- `events-reddit`
- `events-sec`
- `events-news`
- `events-market`
- `events-options`
- `normalize-events`
- `resolve-entities`
- `score-catalysts`
- `build-predictions`
- `measure-outcomes`

Consumers must be idempotent because queue delivery should be treated as at-least-once.

### D1
Use D1 for the **relational control plane**:

- entities and aliases
- relationship graph edges
- source metadata
- normalized event metadata
- signals and catalysts
- evidence manifests
- theses / counter-theses
- recommendation metadata
- immutable prediction ledger metadata
- outcome summaries
- evaluation runs

Do **not** use D1 as the long-term store for every market/options tick.

### R2
Use R2 for the **large immutable evidence/data plane**:

- raw Reddit payloads
- raw SEC documents / parsed artifacts where permitted
- raw vendor market/options responses
- news source snapshots where licensing permits retention
- compressed time-series partitions
- derived feature snapshots
- model inputs/outputs that are too large for relational rows

Object keys should be deterministic where possible, e.g.:

`raw/{source}/{yyyy}/{mm}/{dd}/{event_id}.json.gz`

and later for analytical partitions:

`timeseries/options/{yyyy}/{mm}/{dd}/{symbol}/...`

## Data flow

```text
SOURCE
  ↓
source adapter
  ↓
RAW EVENT (R2 payload + D1 manifest)
  ↓
normalizer
  ↓
entity resolver
  ↓
relationship expansion
  ↓
signal extraction
  ↓
catalyst hypotheses
  ↓
BULL / BEAR / SKEPTIC challenge
  ↓
market + options snapshot
  ↓
recommendation candidate
  ↓
IMMUTABLE PREDICTION SNAPSHOT
  ↓
fixed-horizon outcome measurement
  ↓
evaluation + calibration
```

## Core data objects

### Entity
Anything market-relevant that can participate in a relationship:

- public company
- security / ticker
- private company
- executive
- product
- technology
- commodity
- country
- government agency
- regulator
- industry / sector
- drug / clinical asset
- customer / supplier
- macro variable

### Relationship
Directed typed edge with temporal validity and provenance.

Examples:

- `SUPPLIES_TO`
- `CUSTOMER_OF`
- `COMPETES_WITH`
- `DEPENDS_ON`
- `EXPOSED_TO`
- `MANUFACTURES`
- `OWNS`
- `REGULATED_BY`
- `OPERATES_IN`
- `USES_TECHNOLOGY`
- `BENEFITS_FROM`
- `HURT_BY`

Every edge should support:

- confidence
- valid-from / valid-to
- source evidence
- direct vs inferred
- inference rule/model version

### Raw event
A timestamped thing observed from a source. The payload itself lives in R2; D1 holds the manifest and hash.

### Signal
A normalized measurable fact extracted from events or market data.

Examples:

- Reddit mention velocity +420%
- comment sentiment delta +0.31
- 8-K filed
- analyst EPS revision +7%
- call volume / baseline = 3.8x
- relative stock volume = 2.4x
- IV percentile = 41

### Catalyst
A hypothesis that one or more signals/events can cause a market-relevant change.

Required fields include:

- affected entity
- direction distribution
- expected magnitude distribution
- expected time window
- novelty / surprise
- source reliability
- pricing-in estimate
- confidence

### Evidence snapshot
The complete manifest of evidence that was available to a decision at prediction time. It references immutable raw objects/hashes and normalized records.

### Thesis + counter-thesis
Structured argument, not free-form prose only.

Each stores:

- claims
- supporting evidence IDs
- contradicting evidence IDs
- assumptions
- failure modes
- model/agent version

### Option contract snapshot
Contract state at decision time:

- OCC-style contract identifier if available
- underlying
- strike
- expiration
- call/put
- bid / ask / mark
- volume / open interest
- IV
- delta / gamma / theta / vega / rho when available
- quote timestamp
- provider
- underlying price

### Recommendation
Candidate expression of a thesis:

- CALL
- PUT
- CALL_SPREAD
- PUT_SPREAD
- PASS

It is not yet the historical prediction record.

### Prediction
Immutable published forecast. Must include:

- prediction timestamp
- ticker / entity
- direction
- probability / confidence
- expected magnitude range
- expected horizon
- recommended expression
- specific contract(s) when applicable
- expected entry assumptions
- invalidation condition
- evidence snapshot ID
- model/system version
- content hash
- previous prediction hash (hash-chain auditability)

### Outcome
Observed result at a predefined horizon. Outcomes never mutate predictions.

Standard horizons should initially include:

- 30 minutes
- market close
- 1 trading day
- 3 trading days
- 5 trading days
- 10 trading days
- predicted horizon
- option expiration when relevant

Measure:

- underlying return
- option mid return
- executable bid/ask-aware return
- max favorable excursion
- max adverse excursion
- time to peak
- whether invalidation triggered

## Scoring model — initial decomposition

Do not begin with one opaque score. Persist components independently.

Suggested components, normalized to 0–1:

- `direction_confidence`
- `magnitude_score`
- `timing_confidence`
- `catalyst_strength`
- `information_novelty`
- `source_reliability`
- `relationship_graph_support`
- `market_confirmation`
- `options_liquidity`
- `volatility_value`
- `adversarial_survival`
- `data_quality`

Then derive separate scores:

- **underlying opportunity score**
- **option expression score**
- **estimated expected value score**
- **moonshot score**

The homepage default ranking should be estimated expected value, with aggressive/moonshot potential visible as a separate dimension.

## Anti-fake-edge evaluation protocol

A strategy does not graduate because a backtest looks good.

Required progression:

1. historical reconstruction
2. leakage audit
3. walk-forward validation
4. out-of-sample holdout
5. real-time paper predictions
6. small live-money validation
7. scaled live validation only after sufficient evidence

### Required baselines

At minimum compare to:

- SPY over the same interval
- underlying long/short in predicted direction
- ATM option of comparable maturity
- random eligible ticker/time control
- naive momentum / mean-reversion baselines where appropriate

### Required friction

Persist assumptions for:

- bid/ask spread
- slippage
- commissions/fees where applicable
- missed fills
- stale quotes
- liquidity filters

## First production milestone

The first production system does **not** need to recommend a real trade.

It needs to prove this chain works:

1. ingest one source event
2. preserve raw evidence
3. resolve affected company/entity
4. generate at least one structured signal
5. create a catalyst hypothesis
6. generate bull and bear challenge
7. attach a market/options snapshot
8. freeze a prediction
9. automatically measure its later outcome
10. query performance without changing history

Once that pipeline is reliable, intelligence can be improved without corrupting measurement.

## Immediate source priority

1. Existing Reddit Pulse ingestion
2. SEC EDGAR filings/XBRL
3. U.S. stock price/volume data
4. Options chain snapshots + history
5. News/event feed
6. Earnings calendar/transcripts
7. Insider/institutional data
8. Macro/regulatory/event data
9. Alternative datasets with measurable incremental value

## Product surfaces

### Ranked board
- Best CALLS
- Best PUTS
- Best asymmetric setups
- Best moonshots
- PASS / avoided traps

### Live feed
Continuously updating developing opportunities with score changes and the exact evidence that changed them.

### Opportunity detail
- thesis
- bear case
- catalyst map
- relationship graph path
- evidence timeline
- option chain decision
- historical comparable setups
- calibration / past performance
- invalidation

### Proof dashboard
This is mandatory, not marketing polish:

- cumulative realized recommendations
- win/loss distribution
- expected vs realized calibration
- performance by confidence decile
- performance by catalyst class
- performance by signal family
- performance by model version
- performance after friction
- drawdown
- sample sizes

## Commercialization rule

Keep three layers separate:

1. **research/intelligence engine**
2. **portfolio/execution integration**
3. **public product/compliance wrapper**

This lets the core system improve without forcing an early decision about brokerage execution, consumer recommendations, or external licensing.