# Radar Product Contract

This document defines the durable product/architecture intent. It changes rarely and only through an explicit decision recorded in `docs/DECISION_LOG.md`.

## Mission

Build an autonomous U.S.-equities/options intelligence platform that finds unusually attractive bullish and bearish opportunities by combining independent evidence sources, market behavior, alternative data, Reddit Pulse, and a proprietary company/economic relationship graph.

The system should choose the appropriate timeframe from evidence rather than forcing every opportunity into one horizon.

Universe: all U.S. equities, subject to data/liquidity/execution-quality gates.

## Scientific loop

`Evidence -> thesis -> adversarial challenge -> option -> timestamped prediction -> observed outcome -> learning`

A prediction is a claim made at a point in time. The system may learn later, but it may not rewrite history.

## Evidence rules

- preserve raw evidence immutably where practical;
- distinguish event time from ingestion time;
- preserve source/provenance and feature/model versions;
- use point-in-time data only for historical research/backtests;
- never use future information in features;
- relationship-graph connectivity creates investigation candidates, not direction by itself;
- repeated polling of the same signal family must not manufacture independent evidence depth.

## Pulse boundary

Pulse and Radar are separate products.

- Pulse: fast Reddit comments, attention, sentiment, velocity, subreddit spread and related Reddit-native intelligence.
- Radar: cross-source market intelligence and options decision system.

Radar may read Pulse through a stable read-only API or read-only database binding.

**Radar must not write to, administer, or make Pulse's product decisions.**

Reddit sentiment may vote directionally when supported. Attention/mention velocity/growth/spread/engagement are context unless separately validated as directional predictors.

## Recommendation rules

Radar outputs `CALL`, `PUT`, or `PASS`.

`PASS` is a successful decision when evidence or execution quality is inadequate.

Do not lower thresholds just to make the system trade more often.

The underlying opportunity score, options-expression quality, estimated EV/ranking, data quality and moonshot/upside dimensions should remain distinguishable rather than collapsed into an opaque score.

## Adversarial requirement

Each actionable thesis should preserve enough structured evidence to reconstruct:

- bull case;
- bear case;
- skeptic/failure modes;
- judge/conclusion;
- exact evidence snapshot used.

## Prediction ledger

Published predictions are immutable and timestamped.

Do not change after publication:

- direction;
- confidence;
- horizon;
- evidence snapshot;
- thesis/recommendation relationship;
- selected published strategy/contract assumptions;
- ledger payload/content hash.

Corrections or new beliefs require a new prediction/version, never a rewrite of an old one.

## Research vs execution

Research ranking is budget-independent.

Execution separately selects the best quality-gated expression that fits current budget/risk constraints. A cheaper executable contract must not retroactively become the research winner.

Historical/reference option outcomes and actual broker execution outcomes are separate evidence classes and must never be blended without labels.

## Current execution phase

Current phase: autonomous **paper** execution through Alpaca PAPER.

`local_sim` remains for deterministic/system testing.

No live-money broker adapter is enabled in this phase.

Current strategy scope is long calls and long puts. Future defined-risk debit spreads may be added deliberately. No uncovered shorts, no unlimited-loss profiles, and no 0DTE in the current policy.

## Current paper risk controls

- daily target: $50
- daily hard cap: $100
- max single-trade debit: $100
- max total open strategy debit risk: $200
- daily realized-loss stop: $40
- minimum opportunity score: 0.60
- exceptional tier score: 0.75
- absolute directional gate: 0.20
- max bid/ask spread: 25%
- minimum open interest: 25
- minimum volume: 5
- minimum DTE: 7
- 0DTE: disabled
- live execution: disabled

These controls may eventually change, but only from measured evidence. Any intentional change must be versioned and documented so old and new performance are not mixed.

## Autonomy progression

Autonomy is earned by evidence:

1. autonomous paper;
2. shadow-live comparison;
3. small-budget live defined-risk execution;
4. scale only when forward evidence, calibration and operational reliability justify it.

Broker implementation should remain provider-neutral so Robinhood, IBKR or another broker can be integrated later without coupling core research logic to one venue.

## North-star proof

Primary goal: realized expected value per recommendation after realistic friction.

Supporting proof includes:

- return distribution;
- win rate;
- profit factor;
- drawdown;
- calibration/Brier-style quality;
- performance by confidence, catalyst, source mix, horizon and strategy;
- comparison against simple baselines and a liquid-control universe;
- broker-paper vs historical-reference execution differences.

A tiny sample, a system test, or a lucky trade is not evidence of durable edge.

## Product direction

Build personal/internal first, but keep the core architecture generic, provider-neutral, auditable and commercially reusable. The moat should come from cross-source evidence, economic/company relationships, immutable predictions, measured outcomes and calibration—not from Reddit access alone.