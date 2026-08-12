# Radar v0.2 tuning pass

Date: 2026-08-12

## Goal

Improve Radar's measurement quality, paper-execution realism, and operator observability without tuning the strategy to yesterday's outcomes or lowering gates merely to create trades.

## Shipped in this pass

### 1. Distinct-feature scoring

The v0.1 scorer consumed every signal row in the lookback window. Because Pulse and Alpaca are sampled repeatedly, the same feature type could appear many times and increase evidence depth simply because Radar polled it more often.

v0.2 keeps all raw evidence immutable, but the point-in-time scorer uses only the newest observation for each `signal_type`.

Why:
- polling frequency is not independent evidence
- repeated market snapshots should not manufacture confidence
- repeated Pulse aggregates should not manufacture data quality
- forward results from v0.2 are easier to interpret

The scorer now records:
- raw signal count
- effective distinct-feature count
- effective feature types

### 2. Faster monitoring without over-sampling decisions

Cloudflare scheduler heartbeat moves from 15 minutes to 5 minutes.

Every heartbeat still performs maintenance work such as:
- due outcome collection
- system-test position maintenance
- Alpaca market-clock check

The full Pulse -> market -> options -> prediction cycle remains throttled to roughly the existing 15-minute cadence. This improves position/outcome responsiveness without tripling near-identical predictions.

### 3. Forward version boundary

`SYSTEM_VERSION` moves from `0.1.0` to `0.2.0` so new immutable predictions can be separated from the prior scoring behavior during analysis.

## Deliberately NOT changed

- opportunity gate remains 0.60
- directional gate remains |0.20|
- standard paper policy remains $50 target / $100 hard daily cap / $100 max single debit / $200 max open risk
- daily realized-loss stop remains $40
- spread/OI/volume/DTE quality gates remain unchanged
- no 0DTE
- live-money trading remains disabled
- existing GOOGL paper position is not rewritten or closed

## Highest-value next improvements

### A. Budget-aware dual contract selection

Radar should preserve two separate answers:

1. **Best research contract** — the option that best expresses the thesis independent of wallet size.
2. **Best executable contract** — the best quality contract that fits the active paper budget/risk envelope.

This preserves research ranking while preventing an otherwise valid thesis from failing only because the top-ranked contract costs several hundred dollars.

Do not silently substitute contracts. Store both roles explicitly and show both in the dashboard.

### B. Alpaca paper brokerage adapter

Current Radar paper fills are a local simulated ledger. The next execution-realism milestone should use Alpaca's paper Trading API for option orders and positions while keeping live-money execution impossible.

Required separation:
- `local_sim` remains available for deterministic tests
- `alpaca_paper` is a distinct broker mode
- no live endpoint or live credential path
- record broker order ID, status, fill, rejection, position, buying power, and close fill
- strategy proof must identify which execution mode produced an outcome

### C. Exit realism

The current strategy close at predicted horizon uses a historical one-minute option trade-bar reference and explicitly labels it non-execution-grade.

For broker-backed paper positions, close through Alpaca paper and use the returned simulated fill. For local research outcomes, continue storing historical option references separately.

Never blend research reference returns with broker-paper returns.

### D. Market-state observability

Dashboard should distinguish:
- SYSTEM ONLINE
- PREMARKET
- MARKET OPEN
- FINAL 30M / NEW ENTRIES BLOCKED
- MARKET CLOSED
- DATA STALE / DEGRADED

A green `RADAR LIVE` badge should mean the service is alive, not imply that options are currently tradable.

### E. Signal-family correlation and freshness

Exact feature-type duplication is fixed in v0.2. Do not guess further weights yet.

Track B should test:
- recency decay by feature family
- correlated market-feature caps
- Reddit sentiment level vs shift
- attention as context vs directional information
- market/reddit disagreement
- source breadth

Any family weights should be chosen from walk-forward/holdout evidence rather than hand-tuned from a few live trades.

### F. Candidate controls

Current autonomous candidates begin with Pulse trends. Research should compare this against a stable liquid-control universe so we can measure whether Reddit attention adds value rather than assuming it does.

Control universe candidate:
`SPY, QQQ, NVDA, AMD, AAPL, MSFT, META, TSLA, AMZN, GOOGL`

Do not mix control-universe outcomes into a Reddit-driven strategy claim without labeling candidate origin.

## Recommended order

1. Let the existing GOOGL v0.1 position complete naturally.
2. Deploy this v0.2 correctness/monitoring pass.
3. Build dual research/executable option selection.
4. Add Alpaca paper broker execution behind a paper-only mode flag.
5. Accumulate forward closed trades with strict version labels.
6. Advance Track B historical backfills and walk-forward calibration.
7. Tune thresholds/feature weights only after the evidence is large enough.

## Performance boundary

Radar has not established profitability. Small paper samples, indicative option quotes, historical reference bars, and system-test trades must not be represented as proof of a tradable edge.
