/**
 * Content-addressed index reuse (§13.1.9–13.1.10).
 *
 * The rule that matters: reuse happens **only** when `source_sha256` *and*
 * `index_version` both match. On either mismatch the index is rebuilt, and a
 * stale index is **never** silently used.
 *
 * "Never silently" is doing real work there. A stale index is the most dangerous
 * possible failure for this system: every candidate would carry a plausible
 * identity derived from a source that no longer exists, and every resolution
 * would look verified.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { META_KEYS } from './index-schema.ts';

export const REUSE_DECISIONS = [
  'reuse',
  'rebuild-absent',
  'rebuild-source-changed',
  'rebuild-index-format-changed',
  'rebuild-unreadable',
  'rebuild-incomplete',
] as const;

export type ReuseDecision = (typeof REUSE_DECISIONS)[number];

export type ReuseAssessment = {
  readonly decision: ReuseDecision;
  readonly reusable: boolean;
  readonly database_path: string;
  readonly reason: string;
  readonly found_source_sha256?: string | undefined;
  readonly found_index_version?: string | undefined;
};

/**
 * Content-addressed filename: the index for a given (source, format) pair has
 * exactly one location.
 *
 * Both components are in the name so two indexes can coexist during a format
 * migration, and so a stale file cannot occupy the name a fresh one needs.
 */
export function indexPathFor(derivedDir: string, sourceSha256: string, indexVersion: string): string {
  return join(derivedDir, `adalfi-index.${indexVersion}.${sourceSha256.slice(0, 16)}.db`);
}

function readMeta(databasePath: string): Record<string, string> | undefined {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(databasePath, { readOnly: true });
    const rows = db.prepare('SELECT k, v FROM meta').all() as { k: string; v: string }[];
    return Object.fromEntries(rows.map((row) => [row.k, row.v]));
  } catch {
    // Unreadable, corrupt, or not our schema. Treated as absent, never trusted.
    return undefined;
  } finally {
    db?.close();
  }
}

export function assessReuse(
  derivedDir: string,
  sourceSha256: string,
  indexVersion: string,
): ReuseAssessment {
  const databasePath = indexPathFor(derivedDir, sourceSha256, indexVersion);

  if (!existsSync(databasePath)) {
    return {
      decision: 'rebuild-absent',
      reusable: false,
      database_path: databasePath,
      reason: 'no index exists for this source hash and index version',
    };
  }

  const meta = readMeta(databasePath);
  if (meta === undefined) {
    return {
      decision: 'rebuild-unreadable',
      reusable: false,
      database_path: databasePath,
      reason: 'index exists but its metadata could not be read; treating as absent',
    };
  }

  const foundSource = meta[META_KEYS.sourceSha256];
  const foundVersion = meta[META_KEYS.indexVersion];

  // The filename already encodes both, so a mismatch here means the file was
  // renamed, copied, or hand-edited. Checked anyway: trusting a filename over
  // content is precisely the shortcut that makes staleness invisible.
  if (foundSource !== sourceSha256) {
    return {
      decision: 'rebuild-source-changed',
      reusable: false,
      database_path: databasePath,
      reason: `index was built from source ${String(foundSource).slice(0, 12)}… but the current source is ${sourceSha256.slice(0, 12)}…`,
      found_source_sha256: foundSource,
      found_index_version: foundVersion,
    };
  }
  if (foundVersion !== indexVersion) {
    return {
      decision: 'rebuild-index-format-changed',
      reusable: false,
      database_path: databasePath,
      reason: `index format ${String(foundVersion)} does not match required ${indexVersion}`,
      found_source_sha256: foundSource,
      found_index_version: foundVersion,
    };
  }

  const entryCount = Number(meta[META_KEYS.entryCount] ?? '0');
  if (!Number.isFinite(entryCount) || entryCount <= 0) {
    return {
      decision: 'rebuild-incomplete',
      reusable: false,
      database_path: databasePath,
      reason: 'index reports no entries; a partial build is not reusable',
      found_source_sha256: foundSource,
      found_index_version: foundVersion,
    };
  }

  return {
    decision: 'reuse',
    reusable: true,
    database_path: databasePath,
    reason: `index matches source ${sourceSha256.slice(0, 12)}… and format ${indexVersion}`,
    found_source_sha256: foundSource,
    found_index_version: foundVersion,
  };
}

export function ensureDerivedDir(derivedDir: string): void {
  if (!existsSync(derivedDir)) mkdirSync(derivedDir, { recursive: true });
}

/** Removes an index that will be replaced. Separate from the build so a failed
 *  build cannot leave a half-written file wearing a valid name. */
export function discardIndex(databasePath: string): void {
  if (existsSync(databasePath)) rmSync(databasePath, { force: true });
}
