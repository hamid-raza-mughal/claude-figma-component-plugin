/**
 * Ingestion entry point (§13.1).
 *
 * This is the **only** module permitted to read raw curated JSON (§18, "only
 * ingestion reads raw curated JSON"). Everything downstream sees the index, the
 * manifest, or a generated schema card — never the source bytes.
 *
 * Order is deliberate: hash first, then decide reuse, and only parse when a build
 * is actually needed. Parsing an 876 KB file to discover the index is already
 * valid would be wasted work on every run.
 */
import { readFileSync, statSync } from 'node:fs';
import { hashSourceBytes } from './source-hash.ts';
import { validateExport } from './curated-json-validator.ts';
import { normalizeExport } from './curated-json-normalizer.ts';
import { buildIndex } from './index-builder.ts';
import { assessReuse, discardIndex, ensureDerivedDir, type ReuseDecision } from './content-addressed-store.ts';
import type { Phase1Config } from '../config/phase1-config.ts';
import type { RefClass } from '../contracts/identity.ts';
import type { CollectionSummary, SourceDiagnostic, SourceManifest } from '../contracts/source.ts';
import { REF_CLASSES } from '../contracts/identity.ts';
import type { RawCuratedExport } from './curated-json-types.ts';

export class IngestionError extends Error {
  override readonly name = 'IngestionError';
  readonly code: string;
  readonly diagnostics: readonly SourceDiagnostic[];

  constructor(message: string, code: string, diagnostics: readonly SourceDiagnostic[] = []) {
    super(message);
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export type IngestionResult = {
  readonly manifest: SourceManifest;
  readonly database_path: string;
  readonly reuse_decision: ReuseDecision;
  readonly entry_count: number;
  readonly sqlite_version?: string | undefined;
};

export type IngestOptions = {
  /** Injected for reproducible builds in tests. */
  readonly now?: string | undefined;
  /** Forces a rebuild even when a valid index exists. */
  readonly forceRebuild?: boolean | undefined;
};

function emptyCounts(): Record<RefClass, number> {
  return Object.fromEntries(REF_CLASSES.map((refClass) => [refClass, 0])) as Record<RefClass, number>;
}

export function ingest(config: Phase1Config, options: IngestOptions = {}): IngestionResult {
  const bytes = readFileSync(config.curatedSourcePath);
  const sourceBytes = statSync(config.curatedSourcePath).size;
  const sourceSha256 = hashSourceBytes(bytes);

  ensureDerivedDir(config.derivedDir);
  const assessment = assessReuse(config.derivedDir, sourceSha256, config.indexVersion);

  // Reuse still requires a manifest, and the manifest's counts must come from the
  // index rather than from a cached number, so the source is parsed either way —
  // but only after reuse is decided, so the decision is never made from a parse.
  const parsed = parseSource(bytes);
  const validation = validateExport(parsed);
  if (!validation.usable) {
    throw new IngestionError(
      'curated source failed validation; refusing to build an index from it',
      'SOURCE_UNUSABLE',
      validation.diagnostics,
    );
  }

  const normalization = normalizeExport(parsed);
  if (normalization.normalized_id_collisions.length > 0) {
    throw new IngestionError(
      `post-normalization id collisions: ${normalization.normalized_id_collisions.length}`,
      'SOURCE_ID_COLLISION',
      [
        ...validation.diagnostics,
        {
          code: 'SOURCE_ID_COLLISION',
          severity: 'error',
          message: `collisions: ${normalization.normalized_id_collisions.slice(0, 5).join(', ')}`,
          origin: 'ingestion',
        },
      ],
    );
  }

  const shouldBuild = options.forceRebuild === true || !assessment.reusable;
  let entryCount = 0;
  let sqliteVersion: string | undefined;

  if (shouldBuild) {
    discardIndex(assessment.database_path);
    const built = buildIndex({
      databasePath: assessment.database_path,
      records: normalization.records,
      sourceSha256,
      sourceSchemaVersion: validation.source_schema_version,
      indexVersion: config.indexVersion,
      sourceBytes,
      exportedAt: parsed.meta?.exported_at,
      normalizedIdCollisions: normalization.normalized_id_collisions,
      builtAt: options.now ?? new Date().toISOString(),
    });
    entryCount = built.entry_count;
    sqliteVersion = built.sqlite_version;
  } else {
    entryCount = normalization.records.length;
  }

  const counts = emptyCounts();
  for (const record of normalization.records) counts[record.ref_class] += 1;

  const collectionSummaries: CollectionSummary[] = normalization.collections.map((collection) => {
    const members = normalization.records.filter(
      (record) => record.ref_class === 'variable' && record.collection === collection.name,
    );
    const modes = (collection.modes ?? []).map((mode) => mode.name ?? mode.modeId ?? 'unknown');
    return {
      name: collection.name ?? 'unknown',
      entry_count: members.length,
      modes,
      multi_mode: modes.length > 1,
      described_count: members.filter((record) => record.description.trim() !== '').length,
    };
  });

  const diagnostics: SourceDiagnostic[] = [
    ...validation.diagnostics,
    ...normalization.anomalies.slice(0, 50).map(
      (anomaly): SourceDiagnostic => ({
        code: 'NORMALIZATION_ANOMALY',
        severity: 'info',
        message: anomaly,
        origin: 'ingestion',
      }),
    ),
    {
      code: 'INDEX_REUSE_DECISION',
      severity: 'info',
      message: `${assessment.decision}: ${assessment.reason}`,
      origin: 'ingestion',
    },
  ];

  const manifest: SourceManifest = {
    snapshot: {
      source_sha256: sourceSha256,
      index_version: config.indexVersion,
      source_schema_version: validation.source_schema_version,
      ...(parsed.meta?.exported_at === undefined ? {} : { exported_at: parsed.meta.exported_at }),
      source_bytes: sourceBytes,
    },
    counts: { total: normalization.records.length, by_ref_class: counts },
    collections: collectionSummaries,
    diagnostics,
    normalization_applied: normalization.normalization_applied,
    normalized_id_collisions: normalization.normalized_id_collisions.length,
  };

  return {
    manifest,
    database_path: assessment.database_path,
    reuse_decision: options.forceRebuild === true ? 'rebuild-absent' : assessment.decision,
    entry_count: entryCount,
    ...(sqliteVersion === undefined ? {} : { sqlite_version: sqliteVersion }),
  };
}

function parseSource(bytes: Uint8Array): RawCuratedExport {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as RawCuratedExport;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IngestionError(`curated source is not valid JSON: ${message}`, 'SOURCE_MALFORMED_JSON', [
      { code: 'SOURCE_MALFORMED_JSON', severity: 'error', message, origin: 'ingestion' },
    ]);
  }
}
