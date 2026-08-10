import { decideOpportunity, type DirectionHint, type OptionCandidate, type SignalForScoring } from "./scoring";

export interface IngestEventInput {
  source: {
    id?: string;
    source_type: string;
    name: string;
    provider?: string;
    reliability_prior?: number;
  };
  source_event_id?: string;
  event_type: string;
  event_time: string;
  canonical_url?: string;
  title?: string;
  summary?: string;
  ticker: string;
  entity_name?: string;
  exchange?: string;
  signals: Array<{
    signal_type: string;
    numeric_value?: number;
    normalized_value?: number;
    baseline_value?: number;
    unit?: string;
    direction_hint: DirectionHint;
    confidence: number;
    metadata?: unknown;
  }>;
  metadata?: unknown;
}

export interface GeneratePredictionInput {
  ticker: string;
  horizon_minutes?: number;
  lookback_hours?: number;
  market: {
    observed_at: string;
    provider: string;
    underlying_price: number;
    bid?: number;
    ask?: number;
    last?: number;
    volume?: number;
  };
  options: OptionCandidate[];
}

export interface RecordOutcomeInput {
  prediction_id: string;
  horizon_label: string;
  target_time: string;
  observed_at: string;
  underlying_exit_price?: number;
  option_exit_mid?: number;
  executable_exit_price?: number;
  max_favorable_excursion_pct?: number;
  max_adverse_excursion_pct?: number;
  metadata?: unknown;
}

interface EntityRow {
  id: string;
  ticker: string;
  canonical_name: string;
}

interface PredictionContextRow {
  prediction_id: string;
  prediction_direction: "bullish" | "bearish" | "neutral";
  recommendation_type: "CALL" | "PUT" | "PASS";
  estimated_ev_score: number;
  market_entry: number | null;
  option_snapshot_id: string | null;
  contract_symbol: string | null;
  option_bid: number | null;
  option_ask: number | null;
  option_mark: number | null;
}

interface PolicyRow {
  id: string;
  daily_target_usd: number;
  daily_hard_cap_usd: number;
  max_single_trade_usd: number;
  daily_loss_stop_usd: number;
  min_opportunity_score: number;
  max_bid_ask_spread_pct: number;
  min_open_interest: number;
  min_volume: number;
  min_days_to_expiration: number;
  allow_0dte: number;
  live_enabled: number;
}

interface DailyRiskRow {
  trading_date: string;
  deployed_usd: number;
  realized_pnl_usd: number;
  open_risk_usd: number;
  new_positions_blocked: number;
  block_reason: string | null;
}

const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonicalize(object[key])]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tradingDate(iso: string): string {
  return iso.slice(0, 10);
}

function objectKey(sourceId: string, eventTime: string, eventId: string): string {
  const date = new Date(eventTime);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `raw/${slug(sourceId)}/${yyyy}/${mm}/${dd}/${eventId}.json`;
}

function percentReturn(entry: number | null | undefined, exit: number | null | undefined): number | null {
  if (entry === null || entry === undefined || exit === null || exit === undefined || entry <= 0) return null;
  return ((exit - entry) / entry) * 100;
}

export async function ingestEvent(env: Env, input: IngestEventInput) {
  const now = new Date().toISOString();
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) throw new Error("ticker is required");
  if (input.signals.length === 0) throw new Error("at least one normalized signal is required");

  const sourceId = input.source.id ?? `source:${slug(input.source.name)}`;
  const entityId = `security:US:${ticker}`;
  const eventId = crypto.randomUUID();
  const payload = canonicalJson(input);
  const payloadHash = await sha256Hex(payload);
  const key = objectKey(sourceId, input.event_time, eventId);

  await env.EVIDENCE.put(key, payload, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { payloadHash, eventId, ticker },
  });

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO sources(id, source_type, name, provider, reliability_prior)
      VALUES(?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(id) DO UPDATE SET
        source_type = excluded.source_type,
        name = excluded.name,
        provider = excluded.provider,
        reliability_prior = excluded.reliability_prior
    `).bind(
      sourceId,
      input.source.source_type,
      input.source.name,
      input.source.provider ?? null,
      input.source.reliability_prior ?? null,
    ),
    env.DB.prepare(`
      INSERT INTO entities(id, entity_type, canonical_name, ticker, exchange, metadata_json)
      VALUES(?1, 'security', ?2, ?3, ?4, ?5)
      ON CONFLICT(id) DO UPDATE SET
        canonical_name = excluded.canonical_name,
        ticker = excluded.ticker,
        exchange = COALESCE(excluded.exchange, entities.exchange),
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      entityId,
      input.entity_name ?? ticker,
      ticker,
      input.exchange ?? null,
      JSON.stringify({ country: "US" }),
    ),
    env.DB.prepare(`
      INSERT INTO raw_events(
        id, source_id, source_event_id, event_type, event_time, object_key,
        payload_hash, canonical_url, title, summary, metadata_json
      ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    `).bind(
      eventId,
      sourceId,
      input.source_event_id ?? null,
      input.event_type,
      input.event_time,
      key,
      payloadHash,
      input.canonical_url ?? null,
      input.title ?? null,
      input.summary ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ),
    env.DB.prepare(`
      INSERT INTO event_entity_links(event_id, entity_id, link_type, confidence)
      VALUES(?1, ?2, 'primary', 1)
    `).bind(eventId, entityId),
  ];

  const signalIds: string[] = [];
  for (const signal of input.signals) {
    const signalId = crypto.randomUUID();
    signalIds.push(signalId);
    statements.push(
      env.DB.prepare(`
        INSERT INTO signals(
          id, signal_type, entity_id, event_id, observed_at, numeric_value,
          normalized_value, baseline_value, unit, direction_hint, confidence,
          feature_version, metadata_json
        ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'v0.1', ?12)
      `).bind(
        signalId,
        signal.signal_type,
        entityId,
        eventId,
        input.event_time,
        signal.numeric_value ?? null,
        signal.normalized_value ?? null,
        signal.baseline_value ?? null,
        signal.unit ?? null,
        signal.direction_hint,
        clamp(signal.confidence),
        signal.metadata === undefined ? null : JSON.stringify(signal.metadata),
      ),
    );
  }

  await env.DB.batch(statements);

  return {
    event_id: eventId,
    source_id: sourceId,
    entity_id: entityId,
    ticker,
    signal_ids: signalIds,
    evidence_object_key: key,
    payload_hash: payloadHash,
    ingested_at: now,
  };
}

export async function generatePrediction(env: Env, input: GeneratePredictionInput) {
  const now = new Date().toISOString();
  const ticker = input.ticker.trim().toUpperCase();
  const entity = await env.DB.prepare(
    `SELECT id, ticker, canonical_name FROM entities WHERE ticker = ?1 LIMIT 1`,
  ).bind(ticker).first<EntityRow>();
  if (!entity) throw new Error(`unknown ticker ${ticker}; ingest evidence first`);

  const lookbackHours = Math.max(1, Math.min(input.lookback_hours ?? 24, 168));
  const cutoffStart = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
  const signalResult = await env.DB.prepare(`
    SELECT id, signal_type, observed_at, normalized_value, direction_hint, confidence
    FROM signals
    WHERE entity_id = ?1 AND observed_at >= ?2 AND observed_at <= ?3
    ORDER BY observed_at DESC
    LIMIT 200
  `).bind(entity.id, cutoffStart, now).all<SignalForScoring>();
  const signals = signalResult.results;

  const marketSnapshotId = crypto.randomUUID();
  const optionSnapshotBySymbol = new Map<string, string>();
  const optionStatements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO market_snapshots(
        id, entity_id, observed_at, provider, underlying_price, bid, ask, last, volume, metadata_json
      ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    `).bind(
      marketSnapshotId,
      entity.id,
      input.market.observed_at,
      input.market.provider,
      input.market.underlying_price,
      input.market.bid ?? null,
      input.market.ask ?? null,
      input.market.last ?? null,
      input.market.volume ?? null,
      JSON.stringify({ ingestion: "prediction_request" }),
    ),
  ];

  for (const option of input.options) {
    const id = crypto.randomUUID();
    optionSnapshotBySymbol.set(option.contract_symbol, id);
    optionStatements.push(
      env.DB.prepare(`
        INSERT INTO option_contract_snapshots(
          id, entity_id, contract_symbol, option_type, strike, expiration_date,
          observed_at, provider, underlying_price, bid, ask, mark, volume,
          open_interest, implied_volatility, delta, gamma, theta, vega, metadata_json
        ) VALUES(
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
          ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
        )
      `).bind(
        id,
        entity.id,
        option.contract_symbol,
        option.option_type,
        option.strike,
        option.expiration_date,
        option.observed_at,
        option.provider,
        option.underlying_price,
        option.bid,
        option.ask,
        option.mark ?? null,
        option.volume ?? null,
        option.open_interest ?? null,
        option.implied_volatility ?? null,
        option.delta ?? null,
        option.gamma ?? null,
        option.theta ?? null,
        option.vega ?? null,
        JSON.stringify({ ingestion: "prediction_request" }),
      ),
    );
  }
  await env.DB.batch(optionStatements);

  const decision = decideOpportunity(signals, input.options, now);
  const catalystId = crypto.randomUUID();
  const evidenceSnapshotId = crypto.randomUUID();
  const recommendationId = crypto.randomUUID();
  const predictionId = crypto.randomUUID();
  const horizonMinutes = Math.max(30, Math.min(input.horizon_minutes ?? 1_440, 43_200));

  const manifest = {
    cutoff_time: now,
    ticker,
    signal_ids: signals.map((signal) => signal.id),
    market_snapshot_id: marketSnapshotId,
    selected_option_contract: decision.selectedOption?.option.contract_symbol ?? null,
    system_version: env.SYSTEM_VERSION,
  };
  const manifestJson = canonicalJson(manifest);
  const manifestHash = await sha256Hex(manifestJson);

  const bullClaims = signals
    .filter((signal) => signal.direction_hint === "bullish")
    .map((signal) => ({ signal_id: signal.id, type: signal.signal_type, confidence: signal.confidence }));
  const bearClaims = signals
    .filter((signal) => signal.direction_hint === "bearish")
    .map((signal) => ({ signal_id: signal.id, type: signal.signal_type, confidence: signal.confidence }));

  const thesisBase = {
    evidence_snapshot_id: evidenceSnapshotId,
    ticker,
    generated_by: "deterministic-v0.1",
  };
  const thesisRows = [
    {
      side: "bull",
      claims: bullClaims,
      failures: ["Bullish evidence could be stale, already priced in, or non-causal."],
      conclusion: { supported: bullClaims.length > 0 },
    },
    {
      side: "bear",
      claims: bearClaims,
      failures: ["Bearish evidence could be stale, already priced in, or non-causal."],
      conclusion: { supported: bearClaims.length > 0 },
    },
    {
      side: "skeptic",
      claims: [],
      failures: [
        "Signal correlation may be mistaken for causation.",
        "Options may reprice through volatility even when direction is correct.",
        "The current sample is not yet calibrated to real-money expected value.",
      ],
      conclusion: {
        survives: decision.recommendation !== "PASS" && decision.signalScore.dataQuality >= 0.5,
      },
    },
    {
      side: "judge",
      claims: [],
      failures: [],
      conclusion: {
        recommendation: decision.recommendation,
        reasons: decision.reasons,
      },
    },
  ] as const;

  const latestPrediction = await env.DB.prepare(
    `SELECT content_hash FROM predictions ORDER BY published_at DESC LIMIT 1`,
  ).first<{ content_hash: string }>();
  const previousHash = latestPrediction?.content_hash ?? null;

  const probabilityProfitable = decision.recommendation === "PASS"
    ? null
    : clamp(0.50 + ((decision.signalScore.confidence - 0.50) * 0.35), 0.50, 0.80);

  const ledgerPayload = {
    prediction_id: predictionId,
    recommendation_id: recommendationId,
    entity_id: entity.id,
    ticker,
    published_at: now,
    direction: decision.direction,
    confidence: decision.signalScore.confidence,
    probability_profitable: probabilityProfitable,
    horizon_minutes: horizonMinutes,
    recommendation_type: decision.recommendation,
    selected_option: decision.selectedOption?.option ?? null,
    evidence_snapshot_id: evidenceSnapshotId,
    evidence_manifest_hash: manifestHash,
    model_bundle_version: "deterministic-v0.1",
    system_version: env.SYSTEM_VERSION,
  };
  const ledgerJson = canonicalJson(ledgerPayload);
  const contentHash = await sha256Hex(canonicalJson({ previous_hash: previousHash, payload: ledgerPayload }));

  const selectedOptionId = decision.selectedOption
    ? optionSnapshotBySymbol.get(decision.selectedOption.option.contract_symbol) ?? null
    : null;

  const dbStatements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO catalysts(
        id, entity_id, catalyst_type, latest_evidence_time, headline, structured_summary_json,
        bullish_probability, bearish_probability, neutral_probability, confidence, model_version, status
      ) VALUES(?1, ?2, 'multi_signal', ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'deterministic-v0.1', 'evaluated')
    `).bind(
      catalystId,
      entity.id,
      now,
      `${ticker} multi-signal catalyst`,
      JSON.stringify({ signal_count: signals.length, reasons: decision.reasons }),
      decision.direction === "bullish" ? decision.signalScore.confidence : 1 - decision.signalScore.confidence,
      decision.direction === "bearish" ? decision.signalScore.confidence : 1 - decision.signalScore.confidence,
      1 - Math.abs(decision.signalScore.directionalScore),
      decision.signalScore.confidence,
    ),
    env.DB.prepare(`
      INSERT INTO evidence_snapshots(
        id, entity_id, catalyst_id, cutoff_time, manifest_json, manifest_hash, system_version
      ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).bind(evidenceSnapshotId, entity.id, catalystId, now, manifestJson, manifestHash, env.SYSTEM_VERSION),
    env.DB.prepare(`
      INSERT INTO recommendations(
        id, entity_id, evidence_snapshot_id, market_snapshot_id, recommendation_type,
        underlying_opportunity_score, option_expression_score, estimated_ev_score,
        moonshot_score, data_quality, rationale_json, strategy_json, model_version, content_hash
      ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'deterministic-v0.1', ?13)
    `).bind(
      recommendationId,
      entity.id,
      evidenceSnapshotId,
      marketSnapshotId,
      decision.recommendation,
      decision.signalScore.opportunityScore,
      decision.optionExpressionScore,
      decision.estimatedEvScore,
      decision.moonshotScore,
      decision.signalScore.dataQuality,
      JSON.stringify({ reasons: decision.reasons, signal_score: decision.signalScore }),
      JSON.stringify({ selected_option: decision.selectedOption }),
      await sha256Hex(canonicalJson(decision)),
    ),
  ];

  for (const thesis of thesisRows) {
    const claimsJson = canonicalJson(thesis.claims);
    const failureJson = canonicalJson(thesis.failures);
    const conclusionJson = canonicalJson(thesis.conclusion);
    const thesisHash = await sha256Hex(canonicalJson({ ...thesisBase, ...thesis }));
    dbStatements.push(
      env.DB.prepare(`
        INSERT INTO theses(
          id, evidence_snapshot_id, entity_id, thesis_side, claims_json,
          failure_modes_json, conclusion_json, model_version, content_hash
        ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, 'deterministic-v0.1', ?8)
      `).bind(
        crypto.randomUUID(),
        evidenceSnapshotId,
        entity.id,
        thesis.side,
        claimsJson,
        failureJson,
        conclusionJson,
        thesisHash,
      ),
    );
  }

  if (selectedOptionId) {
    dbStatements.push(
      env.DB.prepare(`
        INSERT INTO recommendation_contracts(recommendation_id, option_snapshot_id, leg_role, quantity_ratio)
        VALUES(?1, ?2, 'long', 1)
      `).bind(recommendationId, selectedOptionId),
    );
  }

  dbStatements.push(
    env.DB.prepare(`
      INSERT INTO predictions(
        id, recommendation_id, entity_id, evidence_snapshot_id, published_at, direction,
        confidence, probability_profitable, horizon_minutes, invalidation_json,
        entry_assumptions_json, system_version, model_bundle_version, ledger_payload_json,
        content_hash, previous_prediction_hash
      ) VALUES(
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
        ?11, ?12, 'deterministic-v0.1', ?13, ?14, ?15
      )
    `).bind(
      predictionId,
      recommendationId,
      entity.id,
      evidenceSnapshotId,
      now,
      decision.direction,
      decision.signalScore.confidence,
      probabilityProfitable,
      horizonMinutes,
      JSON.stringify({ rule: "future versions must define explicit market invalidation levels" }),
      JSON.stringify({ underlying_price: input.market.underlying_price, option_entry: "paper executor uses ask" }),
      env.SYSTEM_VERSION,
      ledgerJson,
      contentHash,
      previousHash,
    ),
  );

  await env.DB.batch(dbStatements);

  return {
    prediction_id: predictionId,
    ticker,
    published_at: now,
    recommendation: decision.recommendation,
    direction: decision.direction,
    confidence: decision.signalScore.confidence,
    opportunity_score: decision.signalScore.opportunityScore,
    estimated_ev_score: decision.estimatedEvScore,
    moonshot_score: decision.moonshotScore,
    selected_option: decision.selectedOption,
    reasons: decision.reasons,
    immutable_content_hash: contentHash,
    previous_prediction_hash: previousHash,
  };
}

export async function executePaperPrediction(env: Env, predictionId: string) {
  if (env.EXECUTION_MODE !== "paper") {
    throw new Error("paper executor is disabled because EXECUTION_MODE is not paper");
  }

  const context = await env.DB.prepare(`
    SELECT
      p.id AS prediction_id,
      p.direction AS prediction_direction,
      r.recommendation_type,
      r.estimated_ev_score,
      ms.underlying_price AS market_entry,
      ocs.id AS option_snapshot_id,
      ocs.contract_symbol,
      ocs.bid AS option_bid,
      ocs.ask AS option_ask,
      ocs.mark AS option_mark
    FROM predictions p
    JOIN recommendations r ON r.id = p.recommendation_id
    LEFT JOIN market_snapshots ms ON ms.id = r.market_snapshot_id
    LEFT JOIN recommendation_contracts rc ON rc.recommendation_id = r.id
    LEFT JOIN option_contract_snapshots ocs ON ocs.id = rc.option_snapshot_id
    WHERE p.id = ?1
    LIMIT 1
  `).bind(predictionId).first<PredictionContextRow>();
  if (!context) throw new Error("prediction not found");

  const existing = await env.DB.prepare(
    `SELECT id, status, block_reason FROM paper_orders WHERE prediction_id = ?1 LIMIT 1`,
  ).bind(predictionId).first<{ id: string; status: string; block_reason: string | null }>();
  if (existing) return { already_processed: true, ...existing };

  if (context.recommendation_type === "PASS" || !context.option_snapshot_id || !context.contract_symbol || context.option_ask === null) {
    return { executed: false, status: "not_tradeable", reason: "prediction is PASS or has no selected option" };
  }

  const policy = await env.DB.prepare(
    `SELECT * FROM execution_policies WHERE active = 1 ORDER BY created_at DESC LIMIT 1`,
  ).first<PolicyRow>();
  if (!policy) throw new Error("no active execution policy");

  const now = new Date().toISOString();
  const date = tradingDate(now);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO daily_risk_state(trading_date) VALUES(?1)
  `).bind(date).run();
  const risk = await env.DB.prepare(
    `SELECT * FROM daily_risk_state WHERE trading_date = ?1`,
  ).bind(date).first<DailyRiskRow>();
  if (!risk) throw new Error("daily risk state unavailable");

  const debit = context.option_ask * 100;
  let blockReason: string | null = null;
  let status = "filled";

  if (risk.new_positions_blocked) blockReason = risk.block_reason ?? "new positions are blocked";
  else if (risk.realized_pnl_usd <= -Math.abs(policy.daily_loss_stop_usd)) blockReason = "daily loss stop reached";
  else if (context.estimated_ev_score < policy.min_opportunity_score) blockReason = "opportunity score below execution threshold";
  else if (debit > policy.max_single_trade_usd) blockReason = "single trade exceeds autonomous max; escalation required";
  else if ((risk.deployed_usd + debit) > policy.daily_hard_cap_usd) blockReason = "daily hard cap would be exceeded; escalation required";

  if (blockReason) status = blockReason.includes("escalation") ? "requires_escalation" : "blocked";

  const orderId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO paper_orders(
      id, prediction_id, option_snapshot_id, contract_symbol, quantity,
      limit_price, notional_usd, status, block_reason, filled_at, fill_price
    ) VALUES(?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9, ?10)
  `).bind(
    orderId,
    predictionId,
    context.option_snapshot_id,
    context.contract_symbol,
    context.option_ask,
    debit,
    status,
    blockReason,
    status === "filled" ? now : null,
    status === "filled" ? context.option_ask : null,
  ).run();

  if (status === "filled") {
    await env.DB.prepare(`
      UPDATE daily_risk_state
      SET deployed_usd = deployed_usd + ?2,
          open_risk_usd = open_risk_usd + ?2,
          updated_at = CURRENT_TIMESTAMP
      WHERE trading_date = ?1
    `).bind(date, debit).run();
  }

  return {
    executed: status === "filled",
    mode: "paper",
    order_id: orderId,
    prediction_id: predictionId,
    contract_symbol: context.contract_symbol,
    simulated_fill_price: status === "filled" ? context.option_ask : null,
    debit_usd: debit,
    status,
    reason: blockReason,
    daily_target_usd: policy.daily_target_usd,
    daily_hard_cap_usd: policy.daily_hard_cap_usd,
    remaining_before_trade_usd: Math.max(0, policy.daily_hard_cap_usd - risk.deployed_usd),
  };
}

export async function recordOutcome(env: Env, input: RecordOutcomeInput) {
  const context = await env.DB.prepare(`
    SELECT
      p.id AS prediction_id,
      p.direction AS prediction_direction,
      r.recommendation_type,
      r.estimated_ev_score,
      ms.underlying_price AS market_entry,
      ocs.id AS option_snapshot_id,
      ocs.contract_symbol,
      ocs.bid AS option_bid,
      ocs.ask AS option_ask,
      ocs.mark AS option_mark
    FROM predictions p
    JOIN recommendations r ON r.id = p.recommendation_id
    LEFT JOIN market_snapshots ms ON ms.id = r.market_snapshot_id
    LEFT JOIN recommendation_contracts rc ON rc.recommendation_id = r.id
    LEFT JOIN option_contract_snapshots ocs ON ocs.id = rc.option_snapshot_id
    WHERE p.id = ?1
    LIMIT 1
  `).bind(input.prediction_id).first<PredictionContextRow>();
  if (!context) throw new Error("prediction not found");

  const paperOrder = await env.DB.prepare(`
    SELECT fill_price, notional_usd, status, filled_at
    FROM paper_orders WHERE prediction_id = ?1 LIMIT 1
  `).bind(input.prediction_id).first<{
    fill_price: number | null;
    notional_usd: number;
    status: string;
    filled_at: string | null;
  }>();

  const optionEntryMid = context.option_mark ?? (
    context.option_bid !== null && context.option_ask !== null
      ? (context.option_bid + context.option_ask) / 2
      : null
  );
  const executableEntry = paperOrder?.status === "filled" ? paperOrder.fill_price : context.option_ask;
  const underlyingReturn = percentReturn(context.market_entry, input.underlying_exit_price);
  const optionMidReturn = percentReturn(optionEntryMid, input.option_exit_mid);
  const executableReturn = percentReturn(executableEntry, input.executable_exit_price);

  const outcomeId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO outcomes(
      id, prediction_id, horizon_label, target_time, observed_at,
      underlying_entry_price, underlying_exit_price, underlying_return_pct,
      option_entry_mid, option_exit_mid, option_mid_return_pct,
      executable_entry_price, executable_exit_price, executable_return_pct,
      max_favorable_excursion_pct, max_adverse_excursion_pct, metadata_json
    ) VALUES(
      ?1, ?2, ?3, ?4, ?5,
      ?6, ?7, ?8,
      ?9, ?10, ?11,
      ?12, ?13, ?14,
      ?15, ?16, ?17
    )
    ON CONFLICT(prediction_id, horizon_label) DO NOTHING
  `).bind(
    outcomeId,
    input.prediction_id,
    input.horizon_label,
    input.target_time,
    input.observed_at,
    context.market_entry,
    input.underlying_exit_price ?? null,
    underlyingReturn,
    optionEntryMid,
    input.option_exit_mid ?? null,
    optionMidReturn,
    executableEntry,
    input.executable_exit_price ?? null,
    executableReturn,
    input.max_favorable_excursion_pct ?? null,
    input.max_adverse_excursion_pct ?? null,
    input.metadata === undefined ? null : JSON.stringify(input.metadata),
  ).run();

  return {
    outcome_id: outcomeId,
    prediction_id: input.prediction_id,
    horizon_label: input.horizon_label,
    underlying_return_pct: underlyingReturn,
    option_mid_return_pct: optionMidReturn,
    executable_return_pct: executableReturn,
  };
}

export async function listOpportunities(env: Env, limit = 25) {
  const result = await env.DB.prepare(`
    SELECT
      p.id AS prediction_id,
      e.ticker,
      p.published_at,
      p.direction,
      p.confidence,
      p.probability_profitable,
      r.recommendation_type,
      r.underlying_opportunity_score,
      r.option_expression_score,
      r.estimated_ev_score,
      r.moonshot_score,
      r.data_quality,
      ocs.contract_symbol,
      ocs.strike,
      ocs.expiration_date,
      ocs.bid,
      ocs.ask,
      ocs.delta,
      po.status AS paper_status,
      po.notional_usd AS paper_notional_usd
    FROM predictions p
    JOIN recommendations r ON r.id = p.recommendation_id
    JOIN entities e ON e.id = p.entity_id
    LEFT JOIN recommendation_contracts rc ON rc.recommendation_id = r.id
    LEFT JOIN option_contract_snapshots ocs ON ocs.id = rc.option_snapshot_id
    LEFT JOIN paper_orders po ON po.prediction_id = p.id
    ORDER BY p.published_at DESC, r.estimated_ev_score DESC
    LIMIT ?1
  `).bind(Math.max(1, Math.min(limit, 100))).all();
  return result.results;
}

export async function proofSummary(env: Env) {
  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*) AS outcome_count,
      SUM(CASE WHEN executable_return_pct > 0 THEN 1 ELSE 0 END) AS wins,
      AVG(executable_return_pct) AS avg_executable_return_pct,
      AVG(underlying_return_pct) AS avg_underlying_return_pct,
      MIN(executable_return_pct) AS worst_executable_return_pct,
      MAX(executable_return_pct) AS best_executable_return_pct
    FROM outcomes
    WHERE executable_return_pct IS NOT NULL
  `).first<{
    outcome_count: number;
    wins: number | null;
    avg_executable_return_pct: number | null;
    avg_underlying_return_pct: number | null;
    worst_executable_return_pct: number | null;
    best_executable_return_pct: number | null;
  }>();

  const predictionCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM predictions`).first<{ count: number }>();
  const paperCount = await env.DB.prepare(`
    SELECT COUNT(*) AS count,
           SUM(CASE WHEN status = 'filled' THEN 1 ELSE 0 END) AS filled
    FROM paper_orders
  `).first<{ count: number; filled: number | null }>();

  const outcomes = summary?.outcome_count ?? 0;
  const wins = summary?.wins ?? 0;

  return {
    prediction_count: predictionCount?.count ?? 0,
    paper_order_count: paperCount?.count ?? 0,
    paper_filled_count: paperCount?.filled ?? 0,
    measured_outcomes: outcomes,
    win_rate: outcomes > 0 ? wins / outcomes : null,
    avg_executable_return_pct: summary?.avg_executable_return_pct ?? null,
    avg_underlying_return_pct: summary?.avg_underlying_return_pct ?? null,
    best_executable_return_pct: summary?.best_executable_return_pct ?? null,
    worst_executable_return_pct: summary?.worst_executable_return_pct ?? null,
    warning: outcomes < 30
      ? "Sample too small for performance claims. Do not treat this as proven edge."
      : null,
  };
}
