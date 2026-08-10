# Reddit Radar / Reddit Pulse — Options Intelligence

Internal-first market intelligence system for discovering and measuring bullish/bearish U.S. equity options opportunities.

## Status

**v0.1 is paper-only. Live trading is intentionally disabled.**

The first executable vertical slice is:

```text
source event
  -> raw evidence in R2
  -> normalized signal(s) in D1
  -> ticker/entity resolution
  -> deterministic evidence score
  -> CALL / PUT / PASS
  -> option quality gate
  -> immutable hash-linked prediction
  -> paper execution policy
  -> measured outcome
  -> proof dashboard
```

The goal is not to produce persuasive stock commentary. The goal is to create falsifiable predictions and accumulate enough forward outcomes to determine whether a measurable edge exists after realistic trading friction.

## Initial risk policy

Paper execution starts with:

- target deployment: **$50/day**
- hard autonomous cap: **$100/day**
- maximum autonomous single-trade debit: **$100**
- daily realized-loss stop: **$40**
- 0DTE: disabled
- live execution: disabled
- illiquid / wide-spread contracts: rejected
- budget never changes research ranking; expensive high-quality opportunities can be surfaced and marked for escalation instead of being replaced by worse cheap contracts

## Cloudflare resources

The Worker expects:

- D1 binding: `DB`
- R2 binding: `EVIDENCE`

`wrangler.jsonc` contains placeholder development resource identifiers. Create the real resources before remote deployment and replace the D1 database ID.

Recommended commands:

```bash
npm install
npx wrangler d1 create reddit-radar-options-intelligence
npx wrangler r2 bucket create reddit-radar-evidence
```

Copy the returned D1 database ID into `wrangler.jsonc`.

Apply migrations locally:

```bash
npm run db:local
```

For remote deployment later:

```bash
npx wrangler d1 migrations apply reddit-radar-options-intelligence --remote
```

## Write authentication

All POST endpoints fail closed unless `WRITE_TOKEN` is configured.

Local development:

```bash
cp .dev.vars.example .dev.vars
```

Replace the example value with a long random token.

Remote Worker secret:

```bash
npx wrangler secret put WRITE_TOKEN
```

Send it as:

```text
Authorization: Bearer <WRITE_TOKEN>
```

Do not put the real token in source control or `wrangler.jsonc`.

## Run locally

```bash
npm install
npm run db:local
npm run dev
```

Then open the local Worker URL to view the proof dashboard.

## API

### Health

```http
GET /api/health
```

### Ingest evidence

```http
POST /api/events
Authorization: Bearer <WRITE_TOKEN>
Content-Type: application/json
```

Example:

```json
{
  "source": {
    "source_type": "reddit",
    "name": "reddit-pulse",
    "provider": "reddit",
    "reliability_prior": 0.55
  },
  "source_event_id": "reddit-comment-123",
  "event_type": "reddit_signal_bundle",
  "event_time": "2026-08-10T20:00:00.000Z",
  "ticker": "XYZ",
  "entity_name": "Example Corp",
  "signals": [
    {
      "signal_type": "reddit_mention_velocity",
      "numeric_value": 4.2,
      "normalized_value": 0.85,
      "baseline_value": 1,
      "unit": "x_baseline",
      "direction_hint": "bullish",
      "confidence": 0.78
    },
    {
      "signal_type": "reddit_sentiment_delta",
      "numeric_value": 0.31,
      "normalized_value": 0.72,
      "direction_hint": "bullish",
      "confidence": 0.70
    }
  ]
}
```

### Freeze a prediction

```http
POST /api/predictions
Authorization: Bearer <WRITE_TOKEN>
Content-Type: application/json
```

The request includes a fresh underlying snapshot plus candidate options. The engine:

1. loads only signals known before prediction time,
2. scores the underlying evidence,
3. selects the required call or put direction,
4. rejects poor spread/liquidity/DTE contracts,
5. can return `PASS` even when the stock thesis is strong,
6. stores an immutable prediction hash linked to the prior prediction hash.

### Simulate execution

```http
POST /api/paper/execute/<prediction-id>
Authorization: Bearer <WRITE_TOKEN>
```

Paper execution uses the option ask as the conservative simulated entry and enforces the active risk policy. A contract can be marked `requires_escalation` if it exceeds the automatic capital envelope.

### Record outcome

```http
POST /api/outcomes
Authorization: Bearer <WRITE_TOKEN>
```

Outcome rows never rewrite the prediction that preceded them.

### Ranked board

```http
GET /api/opportunities
```

### Proof metrics

```http
GET /api/proof
```

The proof endpoint deliberately warns when the sample is too small for performance claims.

## Validation

GitHub Actions runs:

```bash
npm test
npm run typecheck
npm run deploy:dry
```

Do not merge the architecture branch solely because the UI looks correct. The schema, scoring tests, generated Cloudflare types, and Worker dry-run should all be green first.

## Next build targets

1. Connect the existing Reddit Pulse collector to `/api/events`.
2. Add SEC EDGAR ingestion.
3. Add a real market/options data adapter with provider-neutral normalization.
4. Automatically schedule outcome measurement at fixed horizons.
5. Add relationship graph expansion for supplier/customer/product/competitor second-order effects.
6. Replace heuristic ranking components only after forward data provides enough outcomes to calibrate them.
7. Add Robinhood Agentic MCP as the first live broker adapter only after paper/shadow execution proves operational reliability.

## Rule that cannot be broken

**Evidence -> thesis -> adversarial challenge -> option -> immutable prediction -> outcome -> learning.**

Never start with a trade and search backward for reasons to justify it.
