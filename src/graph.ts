export interface GraphEntityInput {
  id?: string;
  ticker?: string;
  name: string;
  entity_type?: string;
  exchange?: string;
  metadata?: unknown;
}

export interface UpsertRelationshipInput {
  subject: GraphEntityInput;
  predicate: string;
  object: GraphEntityInput;
  confidence: number;
  is_inferred?: boolean;
  inference_method?: string;
  source_event_id?: string;
  evidence_object_key?: string;
  evidence_hash?: string;
  valid_from?: string;
  valid_to?: string;
  metadata?: unknown;
}

export interface ExpandGraphInput {
  ticker: string;
  max_depth?: number;
  min_confidence?: number;
  predicates?: string[];
  max_edges_per_depth?: number;
}

interface EntityRow {
  id: string;
  canonical_name: string;
  entity_type: string;
  ticker: string | null;
  exchange: string | null;
}

interface RelationshipRow {
  id: string;
  subject_entity_id: string;
  predicate: string;
  object_entity_id: string;
  confidence: number;
  is_inferred: number;
  inference_method: string | null;
  valid_from: string | null;
  valid_to: string | null;
  subject_name: string;
  subject_type: string;
  subject_ticker: string | null;
  object_name: string;
  object_type: string;
  object_ticker: string | null;
}

interface GraphPathEdge {
  relationship_id: string;
  predicate: string;
  traversal: "forward" | "reverse";
  relationship_confidence: number;
  from_entity_id: string;
  to_entity_id: string;
}

interface GraphPathState {
  entity: EntityRow;
  depth: number;
  path_confidence: number;
  path: GraphPathEdge[];
  visited: string[];
}

const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function normalizePredicate(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!normalized) throw new Error("relationship predicate is required");
  return normalized;
}

export function graphEntityId(entity: GraphEntityInput): string {
  if (entity.id?.trim()) return entity.id.trim();
  if (entity.ticker?.trim()) return `security:US:${entity.ticker.trim().toUpperCase()}`;
  const type = slug(entity.entity_type || "entity");
  const name = slug(entity.name);
  if (!name) throw new Error("entity name is required");
  return `entity:${type}:${name}`;
}

async function upsertEntity(env: Env, entity: GraphEntityInput): Promise<EntityRow> {
  const id = graphEntityId(entity);
  const ticker = entity.ticker?.trim().toUpperCase() || null;
  const canonicalName = entity.name.trim();
  if (!canonicalName) throw new Error("entity name is required");
  const entityType = entity.entity_type?.trim() || (ticker ? "security" : "entity");

  await env.DB.prepare(`
    INSERT INTO entities(id, entity_type, canonical_name, ticker, exchange, metadata_json)
    VALUES(?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(id) DO UPDATE SET
      entity_type = excluded.entity_type,
      canonical_name = excluded.canonical_name,
      ticker = COALESCE(excluded.ticker, entities.ticker),
      exchange = COALESCE(excluded.exchange, entities.exchange),
      metadata_json = COALESCE(excluded.metadata_json, entities.metadata_json),
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id,
    entityType,
    canonicalName,
    ticker,
    entity.exchange?.trim() || null,
    entity.metadata === undefined ? null : JSON.stringify(entity.metadata),
  ).run();

  return {
    id,
    canonical_name: canonicalName,
    entity_type: entityType,
    ticker,
    exchange: entity.exchange?.trim() || null,
  };
}

async function assertSourceEvent(env: Env, sourceEventId: string): Promise<void> {
  const event = await env.DB.prepare(`SELECT id FROM raw_events WHERE id = ?1 LIMIT 1`)
    .bind(sourceEventId)
    .first<{ id: string }>();
  if (!event) throw new Error(`source_event_id ${sourceEventId} does not exist`);
}

export async function upsertRelationship(env: Env, input: UpsertRelationshipInput) {
  if (input.subject.ticker?.trim().toUpperCase() === input.object.ticker?.trim().toUpperCase() && input.subject.ticker) {
    throw new Error("relationship cannot connect a security to itself");
  }

  const predicate = normalizePredicate(input.predicate);
  const confidence = clamp(input.confidence);
  if (input.is_inferred && !input.inference_method?.trim()) {
    throw new Error("inference_method is required when is_inferred=true");
  }
  if (!input.source_event_id && !input.evidence_object_key) {
    throw new Error("relationship provenance is required: provide source_event_id or evidence_object_key");
  }
  if (input.source_event_id) await assertSourceEvent(env, input.source_event_id);

  const [subject, object] = await Promise.all([
    upsertEntity(env, input.subject),
    upsertEntity(env, input.object),
  ]);
  if (subject.id === object.id) throw new Error("relationship cannot connect an entity to itself");

  const existing = await env.DB.prepare(`
    SELECT id
    FROM relationships
    WHERE subject_entity_id = ?1
      AND predicate = ?2
      AND object_entity_id = ?3
      AND IFNULL(valid_from, '') = IFNULL(?4, '')
    LIMIT 1
  `).bind(subject.id, predicate, object.id, input.valid_from ?? null).first<{ id: string }>();

  const relationshipId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await env.DB.prepare(`
      UPDATE relationships SET
        confidence = ?2,
        is_inferred = ?3,
        inference_method = ?4,
        source_event_id = COALESCE(?5, source_event_id),
        evidence_object_key = COALESCE(?6, evidence_object_key),
        evidence_hash = COALESCE(?7, evidence_hash),
        valid_to = ?8,
        metadata_json = ?9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?1
    `).bind(
      relationshipId,
      confidence,
      input.is_inferred ? 1 : 0,
      input.inference_method?.trim() || null,
      input.source_event_id ?? null,
      input.evidence_object_key ?? null,
      input.evidence_hash ?? null,
      input.valid_to ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO relationships(
        id, subject_entity_id, predicate, object_entity_id, confidence,
        is_inferred, inference_method, source_event_id, evidence_object_key,
        evidence_hash, valid_from, valid_to, metadata_json
      ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    `).bind(
      relationshipId,
      subject.id,
      predicate,
      object.id,
      confidence,
      input.is_inferred ? 1 : 0,
      input.inference_method?.trim() || null,
      input.source_event_id ?? null,
      input.evidence_object_key ?? null,
      input.evidence_hash ?? null,
      input.valid_from ?? null,
      input.valid_to ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ).run();
  }

  if (input.source_event_id) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO relationship_evidence(relationship_id, event_id, role, weight)
      VALUES(?1, ?2, 'supporting', 1)
    `).bind(relationshipId, input.source_event_id).run();
  }

  return {
    relationship_id: relationshipId,
    created: !existing,
    subject,
    predicate,
    object,
    confidence,
    is_inferred: Boolean(input.is_inferred),
  };
}

async function fetchEntities(env: Env, ids: string[]): Promise<Map<string, EntityRow>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map((_, index) => `?${index + 1}`).join(",");
  const result = await env.DB.prepare(`
    SELECT id, canonical_name, entity_type, ticker, exchange
    FROM entities
    WHERE id IN (${placeholders})
  `).bind(...ids).all<EntityRow>();
  return new Map(result.results.map((entity) => [entity.id, entity]));
}

async function fetchNeighborRelationships(
  env: Env,
  frontierIds: string[],
  minConfidence: number,
  predicates: string[] | null,
  limit: number,
): Promise<RelationshipRow[]> {
  if (frontierIds.length === 0) return [];
  const subjectPlaceholders = frontierIds.map((_, index) => `?${index + 1}`).join(",");
  const objectOffset = frontierIds.length;
  const objectPlaceholders = frontierIds.map((_, index) => `?${objectOffset + index + 1}`).join(",");
  let bindValues: unknown[] = [...frontierIds, ...frontierIds, minConfidence];
  const confidenceParam = bindValues.length;
  let predicateClause = "";

  if (predicates && predicates.length > 0) {
    const predicatePlaceholders = predicates.map((_, index) => `?${bindValues.length + index + 1}`).join(",");
    predicateClause = ` AND r.predicate IN (${predicatePlaceholders})`;
    bindValues = [...bindValues, ...predicates];
  }
  bindValues.push(limit);
  const limitParam = bindValues.length;

  const result = await env.DB.prepare(`
    SELECT
      r.id,
      r.subject_entity_id,
      r.predicate,
      r.object_entity_id,
      r.confidence,
      r.is_inferred,
      r.inference_method,
      r.valid_from,
      r.valid_to,
      s.canonical_name AS subject_name,
      s.entity_type AS subject_type,
      s.ticker AS subject_ticker,
      o.canonical_name AS object_name,
      o.entity_type AS object_type,
      o.ticker AS object_ticker
    FROM relationships r
    JOIN entities s ON s.id = r.subject_entity_id
    JOIN entities o ON o.id = r.object_entity_id
    WHERE (r.subject_entity_id IN (${subjectPlaceholders}) OR r.object_entity_id IN (${objectPlaceholders}))
      AND r.confidence >= ?${confidenceParam}
      AND (r.valid_to IS NULL OR r.valid_to >= date('now'))
      ${predicateClause}
    ORDER BY r.confidence DESC
    LIMIT ?${limitParam}
  `).bind(...bindValues).all<RelationshipRow>();

  return result.results;
}

export async function expandImpactGraph(env: Env, input: ExpandGraphInput) {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) throw new Error("ticker is required");
  const maxDepth = Math.max(1, Math.min(input.max_depth ?? 2, 3));
  const minConfidence = clamp(input.min_confidence ?? 0.60);
  const maxEdgesPerDepth = Math.max(10, Math.min(input.max_edges_per_depth ?? 500, 2000));
  const predicates = input.predicates?.length
    ? input.predicates.map(normalizePredicate)
    : null;

  const start = await env.DB.prepare(`
    SELECT id, canonical_name, entity_type, ticker, exchange
    FROM entities WHERE ticker = ?1 LIMIT 1
  `).bind(ticker).first<EntityRow>();
  if (!start) throw new Error(`unknown ticker ${ticker}; ingest or seed the entity first`);

  let frontier: GraphPathState[] = [{
    entity: start,
    depth: 0,
    path_confidence: 1,
    path: [],
    visited: [start.id],
  }];
  const bestByEntity = new Map<string, GraphPathState>();
  bestByEntity.set(start.id, frontier[0]!);

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const frontierIds = [...new Set(frontier.map((state) => state.entity.id))];
    const relationships = await fetchNeighborRelationships(
      env,
      frontierIds,
      minConfidence,
      predicates,
      maxEdgesPerDepth,
    );
    const entityIds = [...new Set(relationships.flatMap((rel) => [rel.subject_entity_id, rel.object_entity_id]))];
    const entities = await fetchEntities(env, entityIds);
    const next: GraphPathState[] = [];

    for (const state of frontier) {
      for (const relationship of relationships) {
        const forward = relationship.subject_entity_id === state.entity.id;
        const reverse = relationship.object_entity_id === state.entity.id;
        if (!forward && !reverse) continue;

        const otherId = forward ? relationship.object_entity_id : relationship.subject_entity_id;
        if (state.visited.includes(otherId)) continue;
        const other = entities.get(otherId);
        if (!other) continue;

        const pathConfidence = state.path_confidence * clamp(relationship.confidence);
        const edge: GraphPathEdge = {
          relationship_id: relationship.id,
          predicate: relationship.predicate,
          traversal: forward ? "forward" : "reverse",
          relationship_confidence: relationship.confidence,
          from_entity_id: state.entity.id,
          to_entity_id: otherId,
        };
        const candidate: GraphPathState = {
          entity: other,
          depth,
          path_confidence: pathConfidence,
          path: [...state.path, edge],
          visited: [...state.visited, otherId],
        };

        const existing = bestByEntity.get(otherId);
        if (!existing || candidate.path_confidence > existing.path_confidence) {
          bestByEntity.set(otherId, candidate);
          next.push(candidate);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  const discovered = [...bestByEntity.values()]
    .filter((state) => state.entity.id !== start.id)
    .sort((a, b) => b.path_confidence - a.path_confidence || a.depth - b.depth);

  return {
    root: start,
    max_depth: maxDepth,
    min_confidence: minConfidence,
    discovered_count: discovered.length,
    tradable_candidates: discovered
      .filter((state) => state.entity.ticker)
      .map((state) => ({
        ticker: state.entity.ticker,
        name: state.entity.canonical_name,
        depth: state.depth,
        path_confidence: state.path_confidence,
        path: state.path,
      })),
    connected_entities: discovered.map((state) => ({
      entity: state.entity,
      depth: state.depth,
      path_confidence: state.path_confidence,
      path: state.path,
    })),
    warning: "Graph paths identify economically connected candidates only. They do not imply bullish or bearish direction without additional catalyst evidence.",
  };
}
