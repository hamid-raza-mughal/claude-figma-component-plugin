/**
 * Read-only access to the derived index.
 *
 * **No SQL and no database path is ever exposed to a model or a future agent**
 * (§13.2). Every statement lives in this module, is parameterised, and returns
 * typed rows. There is deliberately no `query(sql)` escape hatch — adding one
 * would recreate the arbitrary-SQL surface the architecture exists to avoid.
 *
 * `uid` is read here and stops here. It is an index-local row number, unstable
 * across rebuilds, and identity property 4 forbids it in any public contract.
 */
import { DatabaseSync } from 'node:sqlite';
import { META_KEYS } from '../ingestion/index-schema.ts';
import type { RefClass } from '../contracts/identity.ts';
import type { NormalizedModeValue } from '../ingestion/curated-json-normalizer.ts';

export type IndexRow = {
  readonly uid: number;
  readonly candidate_id: string;
  readonly source_record_ref: string;
  readonly ref_class: RefClass;
  readonly path: string;
  readonly path_folded: string;
  readonly key: string;
  readonly raw_id: string;
  readonly normalized_id: string;
  readonly collection: string | undefined;
  readonly var_type: string | undefined;
  readonly property_category: string;
  readonly scopes: readonly string[];
  readonly description: string;
  readonly modes: readonly string[];
  readonly multi_mode: boolean;
  readonly values: readonly NormalizedModeValue[];
  readonly value_num: number | undefined;
  readonly bound_variable_ids: readonly string[];
  readonly bound_variables_shape: string;
  readonly literal_font_size: number | undefined;
  readonly literal_line_height: number | undefined;
  readonly literal_letter_spacing: number | undefined;
  readonly literal_font_family: string | undefined;
  readonly payload_json: string;
  readonly anomalies: readonly string[];
};

export type IndexMeta = {
  readonly source_sha256: string;
  readonly source_schema_version: string;
  readonly index_version: string;
  readonly sqlite_version: string;
  readonly fts_tokenizer: string;
  readonly entry_count: number;
  readonly built_at: string;
  readonly source_bytes: number;
  readonly exported_at?: string | undefined;
};

type RawRow = Record<string, unknown>;

function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function toRow(raw: RawRow): IndexRow {
  const optionalNumber = (value: unknown): number | undefined =>
    typeof value === 'number' ? value : undefined;
  const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined;

  return {
    uid: Number(raw['uid']),
    candidate_id: String(raw['candidate_id']),
    source_record_ref: String(raw['source_record_ref']),
    ref_class: String(raw['ref_class']) as RefClass,
    path: String(raw['path']),
    path_folded: String(raw['path_folded']),
    key: String(raw['key'] ?? ''),
    raw_id: String(raw['raw_id'] ?? ''),
    normalized_id: String(raw['normalized_id'] ?? ''),
    collection: optionalString(raw['collection']),
    var_type: optionalString(raw['var_type']),
    property_category: String(raw['property_category']),
    scopes: parseJsonArray<string>(raw['scopes_json'], []),
    description: String(raw['description'] ?? ''),
    modes: parseJsonArray<string>(raw['modes_json'], []),
    multi_mode: Number(raw['multi_mode']) === 1,
    values: parseJsonArray<NormalizedModeValue>(raw['values_json'], []),
    value_num: optionalNumber(raw['value_num']),
    bound_variable_ids:
      typeof raw['bound_variable_ids'] === 'string' && raw['bound_variable_ids'] !== ''
        ? raw['bound_variable_ids'].split(',')
        : [],
    bound_variables_shape: String(raw['bound_variables_shape'] ?? 'absent'),
    literal_font_size: optionalNumber(raw['literal_font_size']),
    literal_line_height: optionalNumber(raw['literal_line_height']),
    literal_letter_spacing: optionalNumber(raw['literal_letter_spacing']),
    literal_font_family: optionalString(raw['literal_font_family']),
    payload_json: String(raw['payload_json'] ?? '{}'),
    anomalies: parseJsonArray<string>(raw['anomalies_json'], []),
  };
}

const SELECT_COLUMNS = `uid, candidate_id, source_record_ref, ref_class, path, path_folded, key, raw_id,
  normalized_id, collection, var_type, property_category, scopes_json, description, modes_json,
  multi_mode, values_json, value_num, bound_variable_ids, bound_variables_shape, literal_font_size,
  literal_line_height, literal_letter_spacing, literal_font_family, payload_json, anomalies_json`;

export class IndexReader {
  private readonly db: DatabaseSync;
  readonly meta: IndexMeta;

  constructor(databasePath: string) {
    this.db = new DatabaseSync(databasePath, { readOnly: true });
    const rows = this.db.prepare('SELECT k, v FROM meta').all() as { k: string; v: string }[];
    const map = Object.fromEntries(rows.map((row) => [row.k, row.v]));
    this.meta = {
      source_sha256: map[META_KEYS.sourceSha256] ?? '',
      source_schema_version: map[META_KEYS.sourceSchemaVersion] ?? '',
      index_version: map[META_KEYS.indexVersion] ?? '',
      sqlite_version: map[META_KEYS.sqliteVersion] ?? '',
      fts_tokenizer: map[META_KEYS.ftsTokenizer] ?? '',
      entry_count: Number(map[META_KEYS.entryCount] ?? '0'),
      built_at: map[META_KEYS.builtAt] ?? '',
      source_bytes: Number(map[META_KEYS.sourceBytes] ?? '0'),
      ...(map[META_KEYS.exportedAt] === undefined ? {} : { exported_at: map[META_KEYS.exportedAt] }),
    };
  }

  close(): void {
    this.db.close();
  }

  /**
   * Candidate pool for a query, narrowed by class and category only.
   *
   * Ranking happens in TypeScript rather than in SQL deliberately: the scoring
   * rules are the valuable, tested part, and expressing them as SQL would make
   * them far harder to unit-test weight by weight.
   *
   * `ORDER BY source_record_ref` gives the pool a defined order before scoring, so
   * a scoring tie cannot inherit SQLite's arbitrary row order — the latent
   * non-determinism in the prototype (decision D-C.5).
   */
  selectPool(options: {
    readonly refClasses: readonly RefClass[];
    readonly propertyCategory?: string | undefined;
    readonly collection?: string | undefined;
  }): readonly IndexRow[] {
    const clauses: string[] = [];
    const args: (string | number)[] = [];
    if (options.refClasses.length > 0) {
      clauses.push(`ref_class IN (${options.refClasses.map(() => '?').join(', ')})`);
      args.push(...options.refClasses);
    }
    if (options.propertyCategory !== undefined) {
      clauses.push('property_category = ?');
      args.push(options.propertyCategory);
    }
    if (options.collection !== undefined) {
      clauses.push('collection = ?');
      args.push(options.collection);
    }
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const sql = `SELECT ${SELECT_COLUMNS} FROM entry ${where} ORDER BY source_record_ref`;
    return (this.db.prepare(sql).all(...args) as RawRow[]).map(toRow);
  }

  /** FTS5 hits as a set of row ids. Failure is tolerated and reported as "no
   *  hits": a malformed MATCH expression must not abort a resolution that can
   *  still succeed on path and value signals. */
  ftsHits(terms: readonly string[]): ReadonlySet<number> {
    if (terms.length === 0) return new Set();
    const expression = terms.map((term) => `"${term.replace(/"/g, '')}"`).join(' OR ');
    try {
      const rows = this.db
        .prepare('SELECT rowid AS uid FROM entry_fts WHERE entry_fts MATCH ?')
        .all(expression) as { uid: number }[];
      return new Set(rows.map((row) => row.uid));
    } catch {
      return new Set();
    }
  }

  /** Exact lookup by opaque candidate id — the materialization path. */
  findByCandidateId(candidateId: string): IndexRow | undefined {
    const raw = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM entry WHERE candidate_id = ?`)
      .get(candidateId) as RawRow | undefined;
    return raw === undefined ? undefined : toRow(raw);
  }

  findByRecordRef(recordRef: string): IndexRow | undefined {
    const raw = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM entry WHERE source_record_ref = ?`)
      .get(recordRef) as RawRow | undefined;
    return raw === undefined ? undefined : toRow(raw);
  }

  /** Variable lookup by the export's raw id — how a style's bindings are followed. */
  findVariableByRawId(rawId: string): IndexRow | undefined {
    const raw = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM entry WHERE ref_class = 'variable' AND raw_id = ?`)
      .get(rawId) as RawRow | undefined;
    return raw === undefined ? undefined : toRow(raw);
  }

  findByPath(refClass: RefClass, path: string): IndexRow | undefined {
    const raw = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM entry WHERE ref_class = ? AND path_folded = ?`)
      .get(refClass, path.toLowerCase()) as RawRow | undefined;
    return raw === undefined ? undefined : toRow(raw);
  }

  countByRefClass(): Readonly<Record<string, number>> {
    const rows = this.db
      .prepare('SELECT ref_class, COUNT(*) AS n FROM entry GROUP BY ref_class')
      .all() as { ref_class: string; n: number }[];
    return Object.fromEntries(rows.map((row) => [row.ref_class, row.n]));
  }

  countByCategory(): Readonly<Record<string, number>> {
    const rows = this.db
      .prepare('SELECT property_category, COUNT(*) AS n FROM entry GROUP BY property_category ORDER BY property_category')
      .all() as { property_category: string; n: number }[];
    return Object.fromEntries(rows.map((row) => [row.property_category, row.n]));
  }

  collectionSummary(): readonly {
    readonly collection: string;
    readonly entries: number;
    readonly multi_mode: boolean;
    readonly described: number;
  }[] {
    return (
      this.db
        .prepare(
          `SELECT collection, COUNT(*) AS entries, MAX(multi_mode) AS multi_mode,
                  SUM(CASE WHEN TRIM(description) <> '' THEN 1 ELSE 0 END) AS described
           FROM entry WHERE collection IS NOT NULL
           GROUP BY collection ORDER BY collection`,
        )
        .all() as { collection: string; entries: number; multi_mode: number; described: number }[]
    ).map((row) => ({
      collection: row.collection,
      entries: row.entries,
      multi_mode: row.multi_mode === 1,
      described: row.described,
    }));
  }

  /** Rows in a category, capped. Backs the controller-owned broadening escape
   *  hatch — never a Coordinator tool (§13.4.4). */
  listByCategoryRows(propertyCategory: string, cap: number): readonly IndexRow[] {
    return (
      this.db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM entry WHERE property_category = ? ORDER BY source_record_ref LIMIT ?`,
        )
        .all(propertyCategory, cap) as RawRow[]
    ).map(toRow);
  }

  /** Multi-mode collections and the modes actually published, for R14. */
  multiModeCollections(): readonly { readonly collection: string; readonly modes: readonly string[] }[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT collection, modes_json FROM entry
         WHERE multi_mode = 1 AND collection IS NOT NULL ORDER BY collection`,
      )
      .all() as { collection: string; modes_json: string }[];
    return rows.map((row) => ({
      collection: row.collection,
      modes: parseJsonArray<string>(row.modes_json, []),
    }));
  }
}
