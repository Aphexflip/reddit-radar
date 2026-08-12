# Radar Agent Operating Contract

This repository is the source of truth for Radar. Chat memory is helpful context, never the authority.

## Mandatory startup sequence

Before making a substantive Radar change, read these files in order:

1. `CHATGPT_START_HERE.md`
2. `docs/CURRENT_CHECKPOINT.md`
3. `docs/PRODUCT_CONTRACT.md`
4. `docs/ROADMAP.md`
5. `docs/DECISION_LOG.md`
6. the architecture/tuning docs relevant to the proposed change

Then verify the active GitHub branch/PR and recent CI/deploy status. Do not assume the repository default branch is current.

## Canonical development line

Until explicitly changed in `docs/DECISION_LOG.md`, the active Radar development/deployment branch is:

`agent/v01-options-intelligence-foundation`

The repository default `main` is legacy/stale and must not be used to infer current product state.

## Do not regress these boundaries

- Radar and Pulse are separate products. **Radar reads Pulse; Radar does not control or write to Pulse.**
- Reddit/Pulse is one independent signal source, not Radar's core architecture.
- Radar's loop is: `Evidence -> thesis -> adversarial challenge -> option -> timestamped prediction -> observed outcome -> learning`.
- Published predictions are immutable. Never rewrite thesis, direction, confidence, horizon, evidence snapshot, or prediction payload after publication.
- Research contract ranking is budget-independent. Execution may choose the best quality-gated contract that fits the active risk budget.
- Do not loosen thresholds merely to manufacture trades.
- Historical/reference outcomes and broker execution outcomes must remain distinguishable.
- Current execution phase is autonomous **Alpaca PAPER** only. Live-money execution is not enabled.
- No 0DTE in the current strategy policy.
- All meaningful evidence must preserve point-in-time provenance and event time vs ingestion time.
- System-test trades are mechanical tests and must not be counted as strategy proof.
- Product architecture should remain provider-neutral and commercially reusable.

Machine-enforced versions of critical current-phase boundaries live in `test/architecture-invariants.test.ts`.

## Change discipline

If a change intentionally modifies a protected invariant, the same PR must:

1. explain why in `docs/DECISION_LOG.md`;
2. update `docs/PRODUCT_CONTRACT.md` if the product contract changed;
3. update `docs/CURRENT_CHECKPOINT.md` and `docs/ROADMAP.md`;
4. deliberately update the invariant test rather than bypassing/deleting it;
5. preserve enough versioning that old predictions/outcomes remain interpretable.

Never delete a guard because it blocks a desired change without documenting the decision that supersedes it.

## End-of-session handoff

Before ending any substantial Radar implementation session, update `docs/CURRENT_CHECKPOINT.md` with:

- what actually shipped;
- current branch/PR/deploy state;
- what was verified vs merely planned;
- the single best next action;
- blockers/unknowns;
- any policy or architecture decision made.

If priorities changed, update `docs/ROADMAP.md`. If an architectural/product decision changed, append `docs/DECISION_LOG.md`.

The goal is that a fresh agent can recover Radar accurately from repository evidence without relying on a previous chat.