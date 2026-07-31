/**
 * DDL for the durable run/event store (§11.2, §11.5).
 *
 * A **separate SQLite file from the derived index** (§11.2) — the derived
 * index lives under `Phase1Config.derivedDir` and disables durability
 * pragmas because it is disposable and rebuildable (`src/ingestion/index-schema.ts`
 * uses `journal_mode = OFF`/`synchronous = OFF`). This store is the opposite:
 * it is the sole authority (§11.1), so it keeps SQLite's durability guarantees
 * on rather than trading them for build speed. WAL journal mode because
 * §11.6.2 requires two host integrations to safely resume one `run_id` from
 * the same file concurrently.
 *
 * `run_event`'s `PRIMARY KEY (run_id, seq)` **is** the CAS mechanism (§11.6.2,
 * G-13): a writer computes the next `seq` from what it read, and a concurrent
 * winner's row makes the loser's `INSERT` fail the primary-key constraint —
 * SQLite's own uniqueness check does the compare-and-swap, nothing hand-rolled.
 *
 * Tables transcribed field-for-field from §11.2/§11.5.
 */
export const STORE_SCHEMA_VERSION = '1.0.0';

export const STORE_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;

CREATE TABLE IF NOT EXISTS run (
  run_id               TEXT PRIMARY KEY,
  display_id           TEXT NOT NULL UNIQUE,
  operation_id         TEXT NOT NULL,
  run_type             TEXT NOT NULL,
  route_provenance     TEXT NOT NULL,
  route_verified       INTEGER NOT NULL,
  user_intent          TEXT NOT NULL,
  target_ref           TEXT,
  requested_at         TEXT NOT NULL,
  source_sha256        TEXT NOT NULL,
  index_version        TEXT NOT NULL,
  spec_schema_version  TEXT NOT NULL,
  invoked_as           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_event (
  run_id       TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  at           TEXT NOT NULL,
  kind         TEXT NOT NULL,
  from_phase   TEXT,
  to_phase     TEXT,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (run_id, seq),
  FOREIGN KEY (run_id) REFERENCES run(run_id)
);

CREATE TABLE IF NOT EXISTS artifact (
  run_id          TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  composed_at     TEXT NOT NULL,
  superseded_at   TEXT,
  canonical_json  TEXT NOT NULL,
  PRIMARY KEY (run_id, artifact_sha256),
  FOREIGN KEY (run_id) REFERENCES run(run_id)
);

CREATE TABLE IF NOT EXISTS approval (
  op_seq                   INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id                   TEXT NOT NULL,
  gate                     TEXT NOT NULL,
  gate_mode                TEXT NOT NULL,
  approved_artifact_sha256 TEXT NOT NULL,
  decision                 TEXT NOT NULL,
  approved_at              TEXT NOT NULL,
  approved_by              TEXT NOT NULL,
  response_source          TEXT NOT NULL,
  verified                 INTEGER NOT NULL,
  authorizing              INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES run(run_id)
);

CREATE TABLE IF NOT EXISTS clarification (
  op_seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL,
  round        INTEGER NOT NULL,
  gap_id       TEXT NOT NULL,
  state        TEXT NOT NULL,
  question     TEXT NOT NULL,
  answer       TEXT,
  answered_at  TEXT,
  FOREIGN KEY (run_id) REFERENCES run(run_id)
);

CREATE TABLE IF NOT EXISTS failure (
  op_seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL,
  at            TEXT NOT NULL,
  failure_class TEXT NOT NULL,
  terminal      INTEGER NOT NULL,
  repairable    INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  enforced_by   TEXT NOT NULL,
  attempt       INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES run(run_id)
);

CREATE TABLE IF NOT EXISTS stage_latency (
  op_seq   INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id   TEXT NOT NULL,
  stage    TEXT NOT NULL,
  ms       REAL NOT NULL,
  measured INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES run(run_id)
);

CREATE TABLE IF NOT EXISTS tool_invocation (
  op_seq      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT,
  tool        TEXT NOT NULL,
  invoked_at  TEXT NOT NULL,
  duration_ms REAL NOT NULL,
  ok          INTEGER NOT NULL,
  error_code  TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_operation (
  op_seq                    INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id              TEXT NOT NULL,
  invoked_as                TEXT NOT NULL,
  started_at                TEXT NOT NULL,
  finished_at               TEXT,
  ok                        INTEGER,
  outcome_json              TEXT,
  source_sha256_before      TEXT,
  source_sha256_after       TEXT,
  invalidated_run_ids_json  TEXT
);
`;

export const STORE_FILE_NAME = 'coordinator-run-store.db';
export const WITNESS_FILE_NAME = 'store-identity.json';
