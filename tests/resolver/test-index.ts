/**
 * Shared harness: builds the index once for the resolver suites.
 *
 * Skips rather than passes when the artifact bundle is absent. A vacuously green
 * resolver suite would be exactly the false evidence this phase exists to remove.
 */
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePhase1Config } from '../../src/config/phase1-config.ts';
import { ingest, type IngestionResult } from '../../src/ingestion/curated-json-loader.ts';
import { IndexReader } from '../../src/resolver/index-reader.ts';

export const ARTIFACT_DIR = process.env['ADALFI_ARTIFACT_DIR'];

export const CURATED_SOURCE =
  ARTIFACT_DIR === undefined
    ? undefined
    : join(ARTIFACT_DIR, 'Agentic', 'adalfi-design-curated-tokens.json');

export const SOURCE_AVAILABLE = CURATED_SOURCE !== undefined && existsSync(CURATED_SOURCE);

let cached: { reader: IndexReader; ingestion: IngestionResult; derivedDir: string } | undefined;

/** Builds (or reuses) the index and returns a reader. Cached across suites. */
export function harness(): { reader: IndexReader; ingestion: IngestionResult; derivedDir: string } {
  if (cached !== undefined) return cached;
  if (CURATED_SOURCE === undefined) throw new Error('ADALFI_ARTIFACT_DIR is not set');
  const derivedDir = mkdtempSync(join(tmpdir(), 'adalfi-index-'));
  const config = resolvePhase1Config({ curatedSourcePath: CURATED_SOURCE, derivedDir });
  const ingestion = ingest(config, { now: '2026-07-29T00:00:00.000Z' });
  const reader = new IndexReader(ingestion.database_path);
  cached = { reader, ingestion, derivedDir };
  return cached;
}

export function freshDerivedDir(): string {
  return mkdtempSync(join(tmpdir(), 'adalfi-fresh-'));
}
