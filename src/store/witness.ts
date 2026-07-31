/**
 * The `store-identity.json` witness (§11.0.7, §19 D-2, closing §18.9).
 *
 * A **witness only** — never read for run state, never an authority. §11.1's
 * event log stays the sole account of what happened. This file exists purely
 * to distinguish a fresh store from a lost one: both present as "a writable
 * empty directory," which the preflight's write test cannot tell apart.
 *
 * Residual risk, accepted and recorded (§11.0.7): if the whole directory is
 * wiped, both the database and this witness vanish together, and the result
 * reads as fresh. No local mechanism can detect that — it is bounded because a
 * resume against a known `run_id`/`display_id` then fails loudly rather than
 * silently returning nothing. Revisit at the R-2 verification run.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { STORE_SCHEMA_VERSION, WITNESS_FILE_NAME, STORE_FILE_NAME } from './schema.ts';

export type StoreWitness = {
  readonly store_uuid: string;
  readonly created_at: string;
  readonly store_schema_version: string;
};

export const STORE_CLASSIFICATIONS = ['fresh', 'lost', 'foreign', 'established'] as const;
export type StoreClassification = (typeof STORE_CLASSIFICATIONS)[number];

export type ClassifyResult = {
  readonly classification: StoreClassification;
  readonly witness: StoreWitness | undefined;
};

function witnessPath(approvedDataDirectory: string): string {
  return join(approvedDataDirectory, WITNESS_FILE_NAME);
}

function databasePath(approvedDataDirectory: string): string {
  return join(approvedDataDirectory, STORE_FILE_NAME);
}

function readWitness(path: string): StoreWitness | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoreWitness>;
    if (
      typeof parsed.store_uuid === 'string' &&
      parsed.store_uuid.length > 0 &&
      typeof parsed.created_at === 'string' &&
      typeof parsed.store_schema_version === 'string'
    ) {
      return {
        store_uuid: parsed.store_uuid,
        created_at: parsed.created_at,
        store_schema_version: parsed.store_schema_version,
      };
    }
    // Present but malformed: still "a witness exists here" for classification
    // purposes — a corrupt witness is evidence of prior state, not absence of it.
    return { store_uuid: '', created_at: '', store_schema_version: '' };
  } catch {
    return { store_uuid: '', created_at: '', store_schema_version: '' };
  }
}

/**
 * §11.0.7's four-way table, exactly. Does not open the database — only checks
 * existence, matching the table's own "Database | Witness" columns (open/read
 * is `preflight.ts`'s job, layered on top of this classification).
 */
export function classifyStore(approvedDataDirectory: string): ClassifyResult {
  const dbExists = existsSync(databasePath(approvedDataDirectory));
  const witness = readWitness(witnessPath(approvedDataDirectory));

  if (!dbExists && witness === undefined) return { classification: 'fresh', witness: undefined };
  if (!dbExists && witness !== undefined) return { classification: 'lost', witness };
  if (dbExists && witness === undefined) return { classification: 'foreign', witness: undefined };
  return { classification: 'established', witness };
}

/** Writes the witness at initialization, for a `fresh` classification only —
 *  callers must not call this for any other classification. */
export function writeWitness(approvedDataDirectory: string, now: string): StoreWitness {
  const witness: StoreWitness = {
    store_uuid: randomUUID(),
    created_at: now,
    store_schema_version: STORE_SCHEMA_VERSION,
  };
  writeFileSync(witnessPath(approvedDataDirectory), JSON.stringify(witness, null, 2));
  return witness;
}

export { databasePath, witnessPath };
