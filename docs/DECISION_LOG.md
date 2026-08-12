# Radar Decision Log

Append durable product/architecture decisions here. Do not rewrite old decisions to make history look cleaner; supersede them with a new dated entry.

## 2026-08-10 — Radar expands beyond Reddit

Decision: Radar is a cross-source U.S.-equities/options intelligence platform. Reddit is an independent signal source, not the core product or architecture.

Reason: the durable moat should come from cross-source evidence, economic/company relationships, timestamped predictions, measured outcomes and calibration.

## 2026-08-10 — All U.S. equities; system chooses horizon

Decision: keep the candidate universe broad across U.S. equities and let the system determine the appropriate prediction/trade horizon from evidence rather than imposing one fixed timeframe.

## 2026-08-10 — Aggressive upside does not mean unclassified risk

Decision: Radar may actively search for asymmetric/high-upside opportunities, but must keep opportunity quality, execution quality, expected value, risk and moonshot/upside characteristics distinguishable.

## 2026-08-11 — Pulse and Radar remain separate products

Decision: `pulse.rsymo.com` remains the Reddit-native live-comment/attention product. Radar consumes Pulse read-only as one source.

Invariant: **Radar reads Pulse; Radar does not control or write to Pulse.**

## 2026-08-11 — Immutable prediction ledger

Decision: predictions cannot be changed after publication. New information produces new evidence/predictions, not hindsight edits to old direction, confidence, horizon or thesis.

Reason: measured performance is meaningless if predictions can be rewritten after outcomes are known.

## 2026-08-11 — Do not lower gates to manufacture trades

Decision: PASS is a valid outcome. Opportunity, direction, liquidity, spread, volume/OI, DTE and risk gates are not to be weakened merely to create activity or samples.

## 2026-08-11 — Research ranking stays budget-independent

Decision: choose the best research contract without considering the user's budget; execution separately chooses the best quality-gated contract that fits the active execution budget.

Reason: budget should change what can be executed, not rewrite what research concluded was best.

## 2026-08-11 — Standard autonomous paper risk profile

Decision: after a temporary mechanical-validation profile, return new strategy entries to the standard paper policy:

- $50 normal daily target
- $100 daily hard cap
- $100 max single-trade debit
- $200 max open strategy debit risk
- $40 daily realized-loss stop
- 0.60 opportunity threshold
- 0.75 exceptional threshold
- 0.20 absolute direction gate
- 25% max spread
- 25 minimum OI
- 5 minimum volume
- 7 minimum DTE
- 0DTE disabled
- live execution disabled

Future tuning requires evidence and versioning.

## 2026-08-12 — Distinct signals, not repeated polling, create evidence depth

Decision: repeated observations of the same signal type may update freshness/current state but do not count as independent evidence families for confidence/depth scoring.

## 2026-08-12 — Alpaca PAPER is the execution-realism milestone

Decision: add an `alpaca_paper` broker mode while retaining `local_sim` for deterministic/system testing.

Constraints:

- broker endpoint is PAPER only;
- `EXECUTION_MODE=paper` is required;
- actual broker order/fill/rejection/close state is persisted;
- historical option references remain separate from broker execution outcomes;
- live-money execution remains unavailable.

Reason: forward strategy evidence should incorporate broker mechanics rather than synthetic fills before any live-money consideration.

## 2026-08-12 — Alpaca PAPER account access must be proven on deploy

Decision: each paper deployment fails closed unless the saved Alpaca credentials authenticate to an ACTIVE, unblocked, options-enabled PAPER account.

The preflight is read-only and does not submit a trade.

## 2026-08-12 — Repository continuity becomes a protected system

Decision: repository evidence, not chat memory, becomes the canonical handoff mechanism.

Added requirements:

- `AGENTS.md` mandatory startup/end-of-session contract;
- `CHATGPT_START_HERE.md` recovery entrypoint;
- `project-state.json` machine-readable phase/goals;
- durable product contract, checkpoint and roadmap;
- CI regression tests for critical current-phase invariants.

Reason: prevent future sessions from using stale `main`, redoing completed milestones, recombining Pulse/Radar, reintroducing live-money execution accidentally, or silently changing the scientific/risk contract.

## 2026-08-12 — Next priority is execution/market-state observability

Decision: after broker-paper execution, the next active build is operational observability rather than more aggressive strategy tuning.

Priority states include market session, stale data, broker readiness, pending/rejected orders, reconciliation freshness, broker/ledger mismatches and risk blocks.

Reason: we now need trustworthy autonomous operation and evidence accumulation more than additional trade generation.