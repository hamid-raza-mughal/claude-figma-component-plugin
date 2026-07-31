/**
 * Store preflight (§11.0) — engine code, shared by every §1.6 runtime
 * (§11.0.5). Runs before any run-bearing tool: the approved directory
 * resolves, the database opens, a write commits, the write is readable after
 * reopen. A configuration value naming a directory is not evidence that the
 * directory is writable (§11.0.1) — this proves it by doing, not by lookup.
 *
 * **Not the HD-2 verification run** (§11.0.6): this proves the store is
 * writable *now*. §1.6.6 requires a write, an interruption and a resume —
 * that is WP9's R-1 run, recorded as a run, never inferred from a passing
 * preflight.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { STORE_SCHEMA_SQL } from './schema.ts';
import { classifyStore, writeWitness, databasePath, type StoreClassification } from './witness.ts';

type Check = { readonly name: string; readonly ok: boolean; readonly detail: string };

export type StorePreflightResult =
  | {
      readonly ok: true;
      readonly classification: 'fresh' | 'established';
      readonly databasePath: string;
      readonly checks: readonly Check[];
    }
  | {
      readonly ok: false;
      /** G-20a: the store itself is unreachable. G-20c: the store opened but
       *  its witness classification refuses it (lost or foreign, PD-2). */
      readonly guardCode: 'G-20a' | 'G-20c';
      readonly classification: StoreClassification;
      readonly checks: readonly Check[];
      readonly remedy: readonly string[];
    };

const PROBE_TABLE = 'preflight_probe';

/** Opens the store, ensures the schema exists, and performs one write + a
 *  reopen-and-read — the concrete "write commits, write is readable after
 *  reopen" test §11.0.1 requires, not a lookup. */
function proveWritable(dbPath: string): { readonly ok: true } | { readonly ok: false; readonly detail: string } {
  try {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(STORE_SCHEMA_SQL);
      db.exec(`CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (at TEXT NOT NULL)`);
      db.exec('BEGIN');
      db.prepare(`INSERT INTO ${PROBE_TABLE} (at) VALUES (?)`).run(new Date(0).toISOString());
      db.exec('COMMIT');
    } finally {
      db.close();
    }
    const reopened = new DatabaseSync(dbPath);
    try {
      const row = reopened.prepare(`SELECT COUNT(*) AS n FROM ${PROBE_TABLE}`).get() as
        | { n?: number }
        | undefined;
      if ((row?.n ?? 0) < 1) {
        return { ok: false, detail: 'write did not persist across reopen' };
      }
    } finally {
      reopened.close();
    }
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export function storePreflight(approvedDataDirectory: string, now: string): StorePreflightResult {
  const checks: Check[] = [];

  let directoryOk = existsSync(approvedDataDirectory);
  if (!directoryOk) {
    try {
      mkdirSync(approvedDataDirectory, { recursive: true });
      directoryOk = true;
    } catch (error: unknown) {
      checks.push({
        name: 'approved-directory-resolves',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        guardCode: 'G-20a',
        classification: 'fresh',
        checks,
        remedy: [
          'The approved data directory does not exist and could not be created (HD-2).',
          'This is one of the §1.6 configurations — Claude Code (R-1) or Desktop/Cowork',
          'with an explicitly approved writable directory (R-2). Point approvedDataDirectory',
          'at a directory the process can create and write.',
        ],
      };
    }
  }
  checks.push({ name: 'approved-directory-resolves', ok: true, detail: approvedDataDirectory });

  const { classification, witness } = classifyStore(approvedDataDirectory);
  checks.push({
    name: 'store-witness-classification',
    ok: classification === 'fresh' || classification === 'established',
    detail: `${classification}${witness === undefined ? '' : ` (store_uuid ${witness.store_uuid.slice(0, 8)}…)`}`,
  });

  if (classification === 'lost' || classification === 'foreign') {
    return {
      ok: false,
      guardCode: 'G-20c',
      classification,
      checks,
      remedy: [
        classification === 'lost'
          ? 'A witness (store-identity.json) exists here but the database does not: ' +
            'a store existed at this location and is gone (HD-2).'
          : 'A database exists here but its witness (store-identity.json) does not: ' +
            'foreign or partially restored (HD-2).',
        'This directory is refused rather than silently re-initialized, per §11.0.7 —',
        'point approvedDataDirectory at the original store, or at a genuinely empty one.',
      ],
    };
  }

  const dbPath = databasePath(approvedDataDirectory);
  const writable = proveWritable(dbPath);
  checks.push({
    name: 'write-commits-and-is-readable-after-reopen',
    ok: writable.ok,
    detail: writable.ok ? 'confirmed' : writable.detail,
  });

  if (!writable.ok) {
    return {
      ok: false,
      guardCode: 'G-20a',
      classification,
      checks,
      remedy: [
        `The store did not pass the write/reopen/read test: ${writable.detail}`,
        'HD-2 requires a durable, writable store — a configuration value naming a',
        'directory is not evidence that the directory is writable (§11.0.1).',
      ],
    };
  }

  if (classification === 'fresh') writeWitness(approvedDataDirectory, now);

  return { ok: true, classification, databasePath: dbPath, checks };
}
