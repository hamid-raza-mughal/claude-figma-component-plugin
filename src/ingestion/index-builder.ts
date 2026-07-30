/**
 * Builds the derived SQLite index (§13.2), and refuses to build a broken one.
 *
 * Three properties are enforced at build time rather than hoped for:
 *   - `candidate_id` and `source_record_ref` are **UNIQUE** columns, so an
 *     identity collision fails the build instead of surfacing later as a
 *     mysteriously wrong resolution.
 *   - post-normalization id collisions **block** (§13.1.7).
 *   - the SQLite library version and FTS tokenizer are recorded in `meta`
 *     (decision **D-C.6**).
 *
 * `node:sqlite` is used rather than a native binding: Node 22 bundles SQLite
 * 3.51.3 with FTS5, which removes a compile step and a dependency.
 */
import { DatabaseSync } from 'node:sqlite';
import { makeCandidateIdentity } from '../contracts/identity.ts';
import {
  ENTRY_INSERT_SQL,
  FTS_INSERT_SQL,
  FTS_TOKENIZER,
  INDEX_SCHEMA_SQL,
  META_KEYS,
} from './index-schema.ts';
import type { NormalizedRecord } from './curated-json-normalizer.ts';

export class IndexBuildError extends Error {
  override readonly name = 'IndexBuildError';
  readonly code: string;
  readonly details: readonly string[];

  constructor(message: string, code: string, details: readonly string[] = []) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export type BuildIndexInput = {
  readonly databasePath: string;
  readonly records: readonly NormalizedRecord[];
  readonly sourceSha256: string;
  readonly sourceSchemaVersion: string;
  readonly indexVersion: string;
  readonly sourceBytes: number;
  readonly exportedAt?: string | undefined;
  readonly normalizedIdCollisions: readonly string[];
  /** Injected so build output is reproducible in tests. */
  readonly builtAt: string;
};

export type BuildIndexResult = {
  readonly entry_count: number;
  readonly sqlite_version: string;
  readonly fts_tokenizer: string;
  readonly database_path: string;
};

/**
 * Sorted so a rebuild from identical input produces identical row order.
 *
 * `uid` is assigned from this order, and FTS rowids follow it. Without a stable
 * sort the same file could produce different row ids on each build — harmless for
 * correctness given identity never uses `uid`, but it would make two indexes
 * gratuitously non-comparable.
 */
function stableRecordOrder(records: readonly NormalizedRecord[]): NormalizedRecord[] {
  return [...records].sort((a, b) => {
    const byClass = a.ref_class.localeCompare(b.ref_class, 'en');
    if (byClass !== 0) return byClass;
    const byId = a.normalized_id.localeCompare(b.normalized_id, 'en');
    if (byId !== 0) return byId;
    return a.path.localeCompare(b.path, 'en');
  });
}

export function buildIndex(input: BuildIndexInput): BuildIndexResult {
  if (input.normalizedIdCollisions.length > 0) {
    throw new IndexBuildError(
      `post-normalization id collisions would break source_record_ref uniqueness: ` +
        `${input.normalizedIdCollisions.length} affected`,
      'INDEX_ID_COLLISION',
      input.normalizedIdCollisions,
    );
  }
  if (input.records.length === 0) {
    throw new IndexBuildError('refusing to build an empty index', 'INDEX_EMPTY');
  }

  const db = new DatabaseSync(input.databasePath);
  try {
    db.exec(INDEX_SCHEMA_SQL);

    const insertEntry = db.prepare(ENTRY_INSERT_SQL);
    const insertFts = db.prepare(FTS_INSERT_SQL);
    const ordered = stableRecordOrder(input.records);

    db.exec('BEGIN');
    let uid = 0;
    for (const record of ordered) {
      uid += 1;
      const identity = makeCandidateIdentity({
        refClass: record.ref_class,
        normalizedId: record.normalized_id === '' ? record.path : record.normalized_id,
        sourceSha256: input.sourceSha256,
        indexVersion: input.indexVersion,
      });
      insertEntry.run(
        uid,
        identity.candidate_id,
        identity.source_record_ref,
        record.ref_class,
        record.path,
        record.path_folded,
        record.key,
        record.raw_id,
        record.normalized_id,
        record.collection ?? null,
        record.var_type ?? null,
        record.property_category,
        JSON.stringify(record.scopes),
        record.description,
        JSON.stringify(record.modes),
        record.multi_mode ? 1 : 0,
        JSON.stringify(record.values),
        record.value_num ?? null,
        record.bound_variable_ids.length === 0 ? null : record.bound_variable_ids.join(','),
        record.bound_variables_shape,
        record.literal_font_size ?? null,
        record.literal_line_height ?? null,
        record.literal_letter_spacing ?? null,
        record.literal_font_family ?? null,
        record.payload_json,
        JSON.stringify(record.anomalies),
      );
      insertFts.run(uid, record.path, record.description, record.scopes.join(' '));
    }

    const sqliteVersion = String(
      (db.prepare('SELECT sqlite_version() AS v').get() as { v?: string } | undefined)?.v ?? 'unknown',
    );

    const setMeta = db.prepare('INSERT INTO meta (k, v) VALUES (?, ?)');
    setMeta.run(META_KEYS.sourceSha256, input.sourceSha256);
    setMeta.run(META_KEYS.sourceSchemaVersion, input.sourceSchemaVersion);
    setMeta.run(META_KEYS.indexVersion, input.indexVersion);
    setMeta.run(META_KEYS.sqliteVersion, sqliteVersion);
    setMeta.run(META_KEYS.ftsTokenizer, FTS_TOKENIZER);
    setMeta.run(META_KEYS.builtAt, input.builtAt);
    setMeta.run(META_KEYS.entryCount, String(uid));
    setMeta.run(META_KEYS.sourceBytes, String(input.sourceBytes));
    if (input.exportedAt !== undefined) setMeta.run(META_KEYS.exportedAt, input.exportedAt);
    db.exec('COMMIT');

    return {
      entry_count: uid,
      sqlite_version: sqliteVersion,
      fts_tokenizer: FTS_TOKENIZER,
      database_path: input.databasePath,
    };
  } catch (error: unknown) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Rollback outside a transaction throws; the original error is what matters.
    }
    if (error instanceof IndexBuildError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    // A UNIQUE violation here means two records derived the same identity, which
    // would otherwise show up as a wrong resolution much later.
    const code = /UNIQUE/i.test(message) ? 'INDEX_IDENTITY_COLLISION' : 'INDEX_BUILD_FAILED';
    throw new IndexBuildError(`index build failed: ${message}`, code);
  } finally {
    db.close();
  }
}
