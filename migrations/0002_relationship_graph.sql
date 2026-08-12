PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entity_aliases (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  alias TEXT NOT NULL,
  alias_type TEXT,
  source_event_id TEXT REFERENCES raw_events(id),
  confidence REAL NOT NULL DEFAULT 1,
  valid_from TEXT,
  valid_to TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entity_alias_lookup ON entity_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_entity_alias_entity ON entity_aliases(entity_id);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL REFERENCES entities(id),
  predicate TEXT NOT NULL,
  object_entity_id TEXT NOT NULL REFERENCES entities(id),
  confidence REAL NOT NULL DEFAULT 0.5,
  is_inferred INTEGER NOT NULL DEFAULT 0 CHECK(is_inferred IN (0,1)),
  inference_method TEXT,
  source_event_id TEXT REFERENCES raw_events(id),
  evidence_object_key TEXT,
  evidence_hash TEXT,
  valid_from TEXT,
  valid_to TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(subject_entity_id <> object_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_relationship_subject_predicate
ON relationships(subject_entity_id, predicate, confidence);

CREATE INDEX IF NOT EXISTS idx_relationship_object_predicate
ON relationships(object_entity_id, predicate, confidence);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_unique_active
ON relationships(subject_entity_id, predicate, object_entity_id, IFNULL(valid_from, ''));

CREATE TABLE IF NOT EXISTS relationship_evidence (
  relationship_id TEXT NOT NULL REFERENCES relationships(id),
  event_id TEXT NOT NULL REFERENCES raw_events(id),
  role TEXT NOT NULL DEFAULT 'supporting',
  weight REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(relationship_id, event_id, role)
);

CREATE INDEX IF NOT EXISTS idx_relationship_evidence_event
ON relationship_evidence(event_id, relationship_id);
