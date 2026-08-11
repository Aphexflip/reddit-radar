# Paper exploration lane

Purpose: produce a small number of real, signal-driven **simulated paper** option trades while the primary Radar strategy remains conservatively gated and uncalibrated.

## Boundary

- Paper only. No live-money broker adapter is enabled.
- Exploration trades are learning/system-validation samples, not evidence of an established edge.
- The normal strategy gate remains `opportunity >= 0.60` and `|direction| >= 0.20`.
- The exploration lane may inspect an option chain at `opportunity >= 0.45` and `|direction| >= 0.12`.
- Exploration execution requires a selected option with debit <= $100 and uses a lower paper-only ranking threshold of `0.30`.
- At most 2 exploration fills may be opened per trading date.
- Existing daily hard cap, open-risk cap, loss stop, market-hours gate, final-30-minute block, no-0DTE rule, liquidity gates, and DTE gates still apply.
- Exploration predictions use model bundle `deterministic-v0.2-exploration` so headline proof can exclude them from strategy-performance claims.

## Market evidence

The Alpaca adapter adds point-in-time market context before the evidence gate:

- intraday return versus the current daily open
- return versus previous close
- current-day volume participation versus previous daily volume (neutral context)

These signals supplement Pulse; they do not replace it.

## Goal

Validate the end-to-end research and simulated paper-execution path and collect labeled outcomes without lowering the primary strategy threshold merely to manufacture a favorable-looking result.
