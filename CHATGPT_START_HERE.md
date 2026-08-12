# ChatGPT Start Here — Radar

Use this file to recover the project before changing anything.

## What Radar is

Radar is an autonomous U.S.-equities/options intelligence system intended to find unusually attractive bullish or bearish opportunities from multiple independent evidence sources, challenge its own thesis, choose an options expression, publish an immutable timestamped prediction, measure the result, and learn from forward evidence.

Radar is being built as a personal system first, with architecture suitable for a later commercial product.

## What Radar is not

Radar is not a Reddit app and not a renamed Pulse.

`pulse.rsymo.com` is the fast Reddit/live-comment/attention product. Radar consumes Pulse as one source among several.

**Boundary:** Radar reads Pulse. Radar does not own, mutate, or control Pulse.

## Current canonical line

Active development/deployment branch:

`agent/v01-options-intelligence-foundation`

The repository default `main` is stale legacy state and must not be treated as current Radar.

The long-running foundation PR is PR #2. Feature PRs merge into the active branch first.

## Current verified phase

As of 2026-08-12:

- Radar system version: `0.3.0`
- execution mode: `paper`
- broker mode: `alpaca_paper`
- Alpaca PAPER account authentication/options access is verified during every deployment
- strategy entries that clear unchanged research/quality/risk gates route to Alpaca PAPER
- accepted/pending/filled/rejected broker states are reconciled on the maintenance heartbeat
- broker-backed positions close through Alpaca PAPER at the immutable strategy horizon
- local simulation remains available for deterministic/system tests
- live-money broker execution does not exist in the deployed build

Do not force a broker trade merely to create a sample. Let strategy-qualified forward trades occur naturally.

## Current normal risk policy

- normal daily target: $50
- daily hard cap: $100
- max autonomous single-trade debit: $100
- max total open strategy option-debit risk: $200
- daily realized-loss stop: $40
- minimum opportunity score: 0.60
- exceptional tier threshold: 0.75
- absolute direction gate: 0.20
- max bid/ask spread: 25%
- minimum open interest: 25
- minimum volume: 5
- minimum DTE: 7
- 0DTE disabled
- live execution disabled

These are current-phase controls, not universal constants. Changing them intentionally requires evidence, a decision-log entry, versioning, and updates to the regression guards.

## Two active tracks

### Track A — forward/live paper system

Purpose: accumulate trustworthy point-in-time predictions and real broker-paper execution evidence without contaminating the proof process.

Current major milestone completed: Alpaca PAPER brokerage integration.

Next operating work: execution/market-state observability and then forward sample accumulation.

### Track B — research warehouse/calibration

Purpose: build historical datasets, leakage-safe features/labels, walk-forward backtests, calibration, and control-universe comparisons.

Track B lives on its own branch/PR and must not silently alter Track A predictions or live paper policy.

Next Track B milestone: resumable Alpaca underlying-history backfill with R2 raw partitions, D1 coverage manifests, point-in-time features, and future-only labels.

## Required reading after this file

Read:

1. `docs/CURRENT_CHECKPOINT.md`
2. `docs/PRODUCT_CONTRACT.md`
3. `docs/ROADMAP.md`
4. `docs/DECISION_LOG.md`
5. relevant architecture/tuning docs

Then inspect GitHub for the current branch head, open PRs, CI, and latest deployment evidence before changing code.

## Core rule

Never optimize for the appearance of activity. Optimize for trustworthy evidence of whether Radar has edge.
