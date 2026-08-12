# Radar Ranked Roadmap

This is the execution order unless new evidence creates a stronger priority. Update it when priorities materially change.

## P0 — Continuity and regression protection

**Status:** shipping now

Goal: make repository evidence sufficient for a fresh agent to recover current state without redoing completed work or silently reversing product decisions.

Deliverables:

- root `AGENTS.md`
- root `CHATGPT_START_HERE.md`
- machine-readable `project-state.json`
- `docs/PRODUCT_CONTRACT.md`
- `docs/CURRENT_CHECKPOINT.md`
- `docs/DECISION_LOG.md`
- architecture invariant tests in CI

Exit criterion: CI fails on obvious current-phase regressions and future sessions have one mandatory recovery path.

---

## P1 — Execution + market-state observability

**Status:** NEXT

Goal: make the autonomous paper system operationally legible before increasing complexity.

Build:

- explicit market-state classifier: PREMARKET / MARKET OPEN / FINAL 30M ENTRY BLOCKED / MARKET CLOSED
- data freshness state and stale-data blocker
- broker readiness state: authenticated / trading allowed / options enabled / buying power available
- latest broker reconciliation timestamp
- pending, partially filled, rejected/canceled/expired order visibility
- broker-vs-ledger position mismatch detection
- current daily deployed amount, realized P&L, open risk and active risk blocks
- prominent `paper` / `alpaca_paper` labels everywhere execution appears
- API/dashboard proof that no live-money broker mode exists in current phase

Do **not** change opportunity thresholds, liquidity gates, sizing or strategy logic in this milestone.

Exit criterion: a human can open Radar and immediately understand whether the system is healthy, allowed to enter, waiting on Alpaca, blocked by risk, or stale.

---

## P2 — Accumulate uncontaminated forward Alpaca PAPER evidence

**Status:** ongoing/passive

Goal: collect real broker-paper samples under stable versioned rules.

Rules:

- do not force trades;
- do not loosen thresholds for sample size;
- preserve system/model/policy version per prediction/trade;
- separate system tests from strategy trades;
- retain rejected/blocked opportunities as evidence too;
- measure broker fill vs research reference/quote assumptions.

Exit criterion: enough forward trades exist to begin meaningful descriptive analysis without pretending the sample is conclusive.

---

## P3 — Track B B1: resumable underlying-history backfill

**Status:** queued; Track B branch/PR already exists

Goal: create a reliable point-in-time research data plane.

Build:

- Alpaca underlying-history backfill
- resumable jobs/checkpoints
- immutable R2 raw partitions
- D1 dataset/partition/coverage manifests
- source timestamps and ingestion timestamps
- point-in-time feature materialization
- future-only labels
- gap/duplicate/data-quality checks

Exit criterion: historical underlying data can be reproduced, resumed and audited without leakage.

---

## P4 — Historical options/SEC/Pulse coverage + control universe

Goal: expand historical evidence while preventing Reddit/Pulse from becoming the only candidate generator.

Build/compare:

- option-history coverage appropriate for research references
- SEC event history
- historical Pulse features where available
- candidate origin labels
- Pulse-driven universe vs liquid-control universe

Initial control universe:

`SPY, QQQ, NVDA, AMD, AAPL, MSFT, META, TSLA, AMZN, GOOGL`

Exit criterion: Radar can test whether Pulse adds signal versus a simple liquid baseline rather than assuming it does.

---

## P5 — Leakage-safe feature/label registry and walk-forward engine

Goal: evaluate decisions as they would have appeared in real time.

Build:

- versioned feature registry
- versioned label registry
- embargo/point-in-time cutoffs where needed
- rolling/walk-forward train/test windows
- untouched final time holdout
- baseline strategies
- per-source/per-signal-family ablations

Exit criterion: backtests can be rerun deterministically and cannot access future information.

---

## P6 — Calibration and evidence-based tuning

Goal: tune only after adequate evidence exists.

Evaluate:

- opportunity threshold
- direction gate
- confidence mapping
- source/signal-family weights
- freshness decay
- correlated-signal handling
- horizon selection
- liquidity gates
- option expression rules

Metrics:

- realized EV after friction
- return distribution
- profit factor
- drawdown
- calibration/Brier-style quality
- performance by confidence/catalyst/source mix/horizon/strategy
- broker-paper execution slippage vs reference assumptions

Exit criterion: any policy change is supported by forward/walk-forward evidence, versioned and recorded in `docs/DECISION_LOG.md`.

---

## P7 — Shadow-live readiness gate

Goal: determine whether Radar deserves any live-money consideration without placing live orders.

Requirements before advancing:

- stable broker-paper operation
- no unresolved reconciliation/duplicate-order defects
- sufficient forward sample
- acceptable drawdown/risk behavior
- calibration better than useful baselines
- documented kill-switch behavior
- stale-data and account inconsistency fail-closed behavior
- deterministic audit trail from evidence to order/outcome

Shadow-live should compare what Radar *would* do against real-time executable conditions while still placing no live-money orders.

---

## P8 — Small-budget live adapter, only if earned

**Not authorized/currently disabled.**

If P7 evidence justifies progression:

- add a provider-neutral live broker adapter deliberately;
- start with defined-risk long calls/puts and possibly debit spreads;
- keep daily budget small;
- require explicit versioned execution policy and kill switch;
- no uncovered shorts, unlimited-loss structures or 0DTE;
- keep live and paper results separately attributable.

Robinhood may be preferred for human usability, but broker choice should follow API reliability and operational safety rather than UI preference alone.

---

## P9 — Commercial/product layer

Only after the engine has evidence worth exposing:

- multi-user/account boundaries
- source licensing/data-cost model
- alert/subscription product
- explainable recommendation pages
- audit/proof views
- mobile delivery
- commercialization/compliance review

Do not prematurely SaaS-ify the research engine before it demonstrates value.

## Current best three moves

1. Build P1 execution/market-state observability.
2. Let P2 forward Alpaca PAPER evidence accumulate without intervention.
3. Then execute P3 Track B B1 historical backfill.
