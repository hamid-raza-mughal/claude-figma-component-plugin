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
import { CURATED_SOURCE_RELATIVE, HISTORICAL_SOURCE_RELATIVE } from '../../tools/artifact-bundle.ts';

export const ARTIFACT_DIR = process.env['ADALFI_ARTIFACT_DIR'];

/**
 * Imported, never re-typed. This file used to spell the relative path out again,
 * so re-pointing the baseline at a new export would have left the preflight
 * pinning one file while every resolver measurement below was taken against the
 * other — and both would have been green.
 */
export const CURATED_SOURCE =
  ARTIFACT_DIR === undefined ? undefined : join(ARTIFACT_DIR, CURATED_SOURCE_RELATIVE);

/** The superseded 2026-07-28 export, for the rename-regression suite only. */
export const HISTORICAL_SOURCE =
  ARTIFACT_DIR === undefined ? undefined : join(ARTIFACT_DIR, HISTORICAL_SOURCE_RELATIVE);

export const SOURCE_AVAILABLE = CURATED_SOURCE !== undefined && existsSync(CURATED_SOURCE);

let cached: { reader: IndexReader; ingestion: IngestionResult; derivedDir: string } | undefined;

/** Builds (or reuses) the index and returns a reader. Cached across suites. */
export function harness(): { reader: IndexReader; ingestion: IngestionResult; derivedDir: string } {
  if (cached !== undefined) return cached;
  if (CURATED_SOURCE === undefined) throw new Error('ADALFI_ARTIFACT_DIR is not set');
  const derivedDir = mkdtempSync(join(tmpdir(), 'adalfi-index-'));
  const approvedDataDirectory = mkdtempSync(join(tmpdir(), 'adalfi-approved-'));
  const config = resolvePhase1Config({ curatedSourcePath: CURATED_SOURCE, derivedDir, approvedDataDirectory });
  const ingestion = ingest(config, { now: '2026-07-29T00:00:00.000Z' });
  const reader = new IndexReader(ingestion.database_path);
  cached = { reader, ingestion, derivedDir };
  return cached;
}

export function freshDerivedDir(): string {
  return mkdtempSync(join(tmpdir(), 'adalfi-fresh-'));
}

export function freshApprovedDataDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'adalfi-approved-'));
}
