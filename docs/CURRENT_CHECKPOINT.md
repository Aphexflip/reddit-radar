# Radar Current Checkpoint

Last updated: 2026-08-12

## Canonical state

Active development/deployment branch: `agent/v01-options-intelligence-foundation`

The repository default `main` is legacy/stale and is not the current Radar system.

Current deployed phase:

- system version `0.3.0`
- `EXECUTION_MODE=paper`
- `BROKER_MODE=alpaca_paper`
- Alpaca PAPER account preflight is required on deploy
- 5-minute maintenance heartbeat
- full prediction cycle remains throttled to roughly 15 minutes
- live-money execution is disabled

## What is verified shipped

### Intelligence/evidence

- immutable raw evidence in R2 plus relational manifests in D1
- normalized timestamped signals with event-time vs ingestion-time separation
- Pulse read-only integration
- SEC EDGAR submissions adapter
- stock and options market evidence
- evidence scoring and CALL/PUT/PASS decisions
- economic relationship graph
- adversarial bull/bear/skeptic/judge records
- immutable hash-linked prediction ledger
- scheduled outcome collection and proof surfaces

### Execution

- normal paper budget/risk policy restored after temporary validation profile
- budget-independent research contract ranking
- separate best executable contract inside the active budget
- Alpaca PAPER account/status/options-buying-power preflight
- long option entry via Alpaca PAPER DAY limit order
- deterministic client order IDs for idempotent retry/recovery
- broker accepted/pending/filled/rejected/canceled/expired reconciliation
- actual broker fill price/status persisted
- broker-backed strategy-horizon exit through Alpaca PAPER
- local simulation retained for deterministic/system tests
- system-test positions excluded from strategy proof

### Interface/operations

- session status API
- scoring diagnostics
- trade-queue funnel
- paper portfolio
- open-trade lifecycle cockpit
- custom domain `radar.rsymo.com`
- deployment verifies D1/R2/Pulse binding/runtime secrets
- deployment now verifies the credentials authenticate to an ACTIVE, options-enabled Alpaca PAPER account before Cloudflare is touched

## What we have deliberately NOT claimed

- Radar has not yet proven durable profitability.
- A system test is not a strategy win.
- A tiny forward sample is not enough to tune the system around.
- Historical option references are not equivalent to broker fills.
- Live-money autonomous trading is not enabled.

## Current dominant constraint

The bottleneck is no longer creating trades or connecting a broker. It is building enough trustworthy forward and historical evidence to determine whether Radar has a repeatable edge while maintaining operational safety.

## Single best next build

**Execution + market-state observability.**

Before we scale research or eventually consider live money, the dashboard/API should make it impossible to confuse:

- SYSTEM ONLINE
- PREMARKET
- MARKET OPEN
- FINAL 30M ENTRY BLOCKED
- MARKET CLOSED
- DATA STALE
- BROKER READY / DEGRADED
- PENDING BROKER ORDER
- BROKER/LEDGER POSITION MISMATCH
- RISK BLOCKED

This should surface broker account readiness, latest reconciliation time, pending/rejected orders, buying-power availability, stale data state and current risk blocks without changing strategy thresholds.

## Parallel passive task

Let qualified Alpaca PAPER trades occur naturally and accumulate forward evidence. Do not manufacture trades for sample size.

## After observability

Resume Track B with the B1 underlying-history backfill, then leakage-safe features/labels, control-universe comparisons, walk-forward testing and calibration.

See `docs/ROADMAP.md` for the ranked sequence.

## Known boundaries / blockers

- Current market/options data can be indicative/research-grade depending on feed; preserve labels.
- The current forward sample is too small for confident threshold tuning.
- Track B must remain isolated from Track A until research outputs are validated and intentionally promoted.
- Any future live-money phase requires an explicit decision, new safeguards, shadow-live evidence and updated invariant tests.

## Handoff requirement

At the end of the next substantial session, replace this checkpoint with the newly verified state rather than appending vague chat history.