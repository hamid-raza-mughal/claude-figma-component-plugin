/**
 * DDL for the derived index (§13.2).
 *
 * SQLite is **not authoritative** and must be reproducible from the curated JSON.
 * Nothing here may become a second source of truth, which is why `*.db` is
 * git-ignored and why every row carries the source hash it was built from.
 *
 * Ported from the prototype's schema, with three deliberate additions:
 *   - `path_folded` — a case-folded search column (finding **C4**). Variables are
 *     TitleCase and styles lowercase, so cross-class matching needs a folded
 *     column while the original stays intact.
 *   - `candidate_id` / `source_record_ref` — the frozen identity, materialized so
 *     a candidate's identity is a stored fact rather than a recomputation.
 *   - explicit **`unicode61` tokenizer** on the FTS table (decision **D-C.6**),
 *     rather than relying on the default, so an FTS behaviour change is
 *     detectable instead of appearing as unexplained ranking drift.
 *
 * `uid` is an internal row identifier and **never leaves this module** — row ids
 * are not stable across rebuilds, so exposing one as a public contract would
 * break identity property 4.
 */

export const INDEX_SCHEMA_SQL = `
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;

CREATE TABLE meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE entry (
  uid                    INTEGER PRIMARY KEY,
  candidate_id           TEXT NOT NULL UNIQUE,
  source_record_ref      TEXT NOT NULL UNIQUE,
  ref_class              TEXT NOT NULL,
  path                   TEXT NOT NULL,
  path_folded            TEXT NOT NULL,
  key                    TEXT,
  raw_id                 TEXT,
  normalized_id          TEXT,
  collection             TEXT,
  var_type               TEXT,
  property_category      TEXT NOT NULL,
  scopes_json            TEXT NOT NULL,
  description            TEXT NOT NULL,
  modes_json             TEXT NOT NULL,
  multi_mode             INTEGER NOT NULL DEFAULT 0,
  values_json            TEXT NOT NULL,
  value_num              REAL,
  bound_variable_ids     TEXT,
  bound_variables_shape  TEXT NOT NULL,
  literal_font_size      REAL,
  literal_line_height    REAL,
  literal_letter_spacing REAL,
  literal_font_family    TEXT,
  payload_json           TEXT NOT NULL,
  anomalies_json         TEXT NOT NULL
);

CREATE INDEX i_ref_class ON entry(ref_class);
CREATE INDEX i_category  ON entry(property_category);
CREATE INDEX i_value_num ON entry(value_num);
CREATE INDEX i_path      ON entry(path_folded);
CREATE INDEX i_key       ON entry(key);
CREATE INDEX i_collection ON entry(collection);

CREATE VIRTUAL TABLE entry_fts USING fts5(
  path,
  description,
  scopes,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);
`;

/** Column list for the `entry` insert, in DDL order. Kept beside the DDL so the
 *  two cannot drift — a mismatch here is a silent column-shift bug. */
export const ENTRY_COLUMNS = [
  'uid',
  'candidate_id',
  'source_record_ref',
  'ref_class',
  'path',
  'path_folded',
  'key',
  'raw_id',
  'normalized_id',
  'collection',
  'var_type',
  'property_category',
  'scopes_json',
  'description',
  'modes_json',
  'multi_mode',
  'values_json',
  'value_num',
  'bound_variable_ids',
  'bound_variables_shape',
  'literal_font_size',
  'literal_line_height',
  'literal_letter_spacing',
  'literal_font_family',
  'payload_json',
  'anomalies_json',
] as const;

export const ENTRY_INSERT_SQL = `INSERT INTO entry (${ENTRY_COLUMNS.join(', ')}) VALUES (${ENTRY_COLUMNS.map(
  () => '?',
).join(', ')})`;

export const FTS_INSERT_SQL =
  'INSERT INTO entry_fts (rowid, path, description, scopes) VALUES (?, ?, ?, ?)';

/** Metadata keys. `sqlite_version` is recorded per decision **D-C.6** so a
 *  tokenizer difference between runtimes is observable rather than mysterious. */
export const META_KEYS = {
  sourceSha256: 'source_sha256',
  sourceSchemaVersion: 'source_schema_version',
  indexVersion: 'index_version',
  sqliteVersion: 'sqlite_version',
  ftsTokenizer: 'fts_tokenizer',
  builtAt: 'built_at',
  entryCount: 'entry_count',
  sourceBytes: 'source_bytes',
  exportedAt: 'exported_at',
} as const;

export const FTS_TOKENIZER = 'unicode61 remove_diacritics 2';
