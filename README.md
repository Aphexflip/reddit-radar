# Radar — U.S. Equities & Options Intelligence

Radar is an internal-first autonomous market-intelligence system for discovering, challenging, paper-executing and measuring bullish/bearish U.S. equity options opportunities.

> **Agent/session recovery:** read [`CHATGPT_START_HERE.md`](CHATGPT_START_HERE.md) before making substantive changes. The repository, not chat memory, is the project source of truth.

## Current status

As of 2026-08-12:

- system version: **0.3.0**
- execution mode: **paper**
- broker mode: **Alpaca PAPER**
- live-money execution: **disabled**
- canonical development/deployment branch: `agent/v01-options-intelligence-foundation`
- repository default `main`: legacy/stale; do not infer current Radar state from it
- deployed at `radar.rsymo.com`

The current loop is:

```text
cross-source evidence
  -> provenance + normalized signals
  -> entity / economic relationship graph
  -> evidence scoring
  -> fresh market/options evidence
  -> CALL / PUT / PASS
  -> adversarial bull/bear/skeptic/judge record
  -> quality-gated research contract
  -> budget-aware executable contract
  -> immutable hash-linked prediction
  -> Alpaca PAPER order / broker reconciliation
  -> strategy-horizon broker-paper close
  -> outcome measurement + learning
```

## Product boundary

Radar is **not** Pulse.

- `pulse.rsymo.com`: Reddit-native live comments, attention, sentiment and trend intelligence.
- `radar.rsymo.com`: cross-source market intelligence and options decision/execution research.

**Radar reads Pulse; Radar does not write to or control Pulse.**

Reddit is one independent sensor, not Radar's core architecture.

## Scientific rule

**Evidence -> thesis -> adversarial challenge -> option -> timestamped prediction -> observed outcome -> learning.**

Never start with a trade and search backward for reasons to justify it. Published predictions are immutable.

## Current paper execution

Eligible strategy trades route through Alpaca PAPER rather than a synthetic fill ledger.

Radar currently supports:

- Alpaca PAPER account/options-access preflight on deployment
- DAY limit buys for qualified long-option entries
- deterministic client order IDs
- accepted/pending/filled/rejected/canceled/expired reconciliation
- actual paper broker fill persistence
- strategy-horizon closes through Alpaca PAPER
- `local_sim` retained for deterministic/system tests

Historical option references remain separate from broker-paper execution results.

## Current normal risk policy

- daily target: **$50**
- daily hard cap: **$100**
- max single-trade debit: **$100**
- max open strategy debit risk: **$200**
- daily realized-loss stop: **$40**
- minimum opportunity score: **0.60**
- exceptional tier: **0.75**
- absolute direction gate: **0.20**
- max spread: **25%**
- minimum open interest: **25**
- minimum volume: **5**
- minimum DTE: **7**
- 0DTE: **disabled**
- live execution: **disabled**

Do not loosen gates merely to create trades. Intentional policy changes require evidence, versioning, decision-log updates and corresponding invariant-test changes.

## Canonical project documents

Read in this order for substantial work:

1. [`CHATGPT_START_HERE.md`](CHATGPT_START_HERE.md)
2. [`docs/CURRENT_CHECKPOINT.md`](docs/CURRENT_CHECKPOINT.md)
3. [`docs/PRODUCT_CONTRACT.md`](docs/PRODUCT_CONTRACT.md)
4. [`docs/ROADMAP.md`](docs/ROADMAP.md)
5. [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md)
6. relevant architecture/tuning docs

Machine-readable current phase/goals live in [`project-state.json`](project-state.json).

Agent operating rules live in [`AGENTS.md`](AGENTS.md).

## Current next build

**Execution + market-state observability.**

The next milestone should make market session, stale-data state, broker readiness, pending/rejected orders, reconciliation freshness, broker/ledger mismatches and active risk blocks immediately visible without changing strategy thresholds.

At the same time, let strategy-qualified Alpaca PAPER trades accumulate naturally. Do not manufacture trades for sample size.

After that, resume Track B historical backfill and leakage-safe walk-forward/calibration work. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Development

```bash
npm install
npm run db:local
npm test
npm run typecheck
npm run deploy:dry
```

Every meaningful change should keep CI green. Critical current-phase boundaries are enforced by `test/architecture-invariants.test.ts`.

## Runtime resources

The Cloudflare Worker uses:

- Radar D1: `DB`
- read-only Pulse D1: `PULSE_DB`
- evidence R2: `EVIDENCE`
- scheduled maintenance: every 5 minutes during configured market hours

Real credentials belong in secret management only; never commit them.

## Proof standard

The goal is not compelling stock commentary or lots of trades. The goal is trustworthy evidence of whether Radar has durable edge after realistic friction.

A system test, tiny sample or lucky trade is not proof of profitability.
