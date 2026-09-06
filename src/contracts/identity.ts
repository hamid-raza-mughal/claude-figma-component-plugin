/**
 * The identity seam (P1-FINAL §12).
 *
 * This is the one module WP2 (resolver) and WP3 (contracts) both compile
 * against, which is what allows them to be built in parallel (decision D2).
 * Freeze it first; change it last.
 *
 * Five properties are required and each has a test:
 *   1. `candidate_id` is deterministic and **opaque to the model** — it carries
 *      no parseable meaning, so a model cannot construct or mutate one and have
 *      it resolve.
 *   2. `source_record_ref` resolves to exactly **one** complete normalized
 *      record.
 *   3. Identity **changes** if the authoritative source hash or the index format
 *      changes. A stale selection must not silently resolve.
 *   4. No candidate identity exposes a **SQLite row number** as a public
 *      contract — row ids are an implementation detail of a derived, rebuildable
 *      index and are not stable across rebuilds.
 *   5. Output ordering is **stable** for identical source, index version and
 *      query.
 */
import { createHash } from 'node:crypto';

/**
 * Reference classes present in the curated export.
 *
 * Measured coverage in the 2026-09-06 export: 570 paint, 105 text, 1 effect,
 * **0 grid** styles, plus 531 variables. `grid-style` therefore has no real
 * instance and `effect-style` has exactly one — both are covered by synthetic
 * fixtures only and must never be reported as verified class routing.
 */
export const REF_CLASSES = [
  'variable',
  'paint-style',
  'text-style',
  'effect-style',
  'grid-style',
] as const;

export type RefClass = (typeof REF_CLASSES)[number];

export function isRefClass(value: unknown): value is RefClass {
  return typeof value === 'string' && (REF_CLASSES as readonly string[]).includes(value);
}

/**
 * The frozen identity tuple. Every candidate, resolution and materialization
 * carries exactly these four fields.
 */
export type CandidateIdentity = {
  /** Opaque, deterministic. Derived — never authored, never parsed for meaning. */
  readonly candidate_id: string;
  /** Structured locator resolving to one complete normalized record. */
  readonly source_record_ref: string;
  /** SHA-256 of the authoritative curated source. */
  readonly source_sha256: string;
  /** Format version of the derived index. */
  readonly index_version: string;
};

/** Inputs to identity derivation. Deliberately excludes anything unstable
 *  across an index rebuild — notably any row id. */
export type IdentitySeed = {
  readonly refClass: RefClass;
  /** Post-normalization record id. Measured: 0 collisions across 1,207 entries. */
  readonly normalizedId: string;
  readonly sourceSha256: string;
  readonly indexVersion: string;
  /** Present only for a mode-scoped candidate. Per §5.7, `mode` lives only on
   *  mode-bearing records — it is never a global field. */
  readonly mode?: string | undefined;
};

export const CANDIDATE_ID_PREFIX = 'c_';
const CANDIDATE_ID_HEX_LENGTH = 24;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

export class IdentityError extends Error {
  override readonly name = 'IdentityError';
  readonly code: IdentityErrorCode;

  constructor(message: string, code: IdentityErrorCode) {
    super(message);
    this.code = code;
  }
}

export type IdentityErrorCode =
  | 'IDENTITY_MALFORMED_REF'
  | 'IDENTITY_MALFORMED_CANDIDATE_ID'
  | 'IDENTITY_STALE_SOURCE'
  | 'IDENTITY_STALE_INDEX'
  | 'IDENTITY_MISMATCH'
  | 'IDENTITY_INVALID_SEED';

/**
 * `source_record_ref` — a structured, deterministic locator.
 *
 * Shape: `<ref_class>:<normalized_id>` plus `@<mode>` when mode-scoped.
 * Readable on purpose: when a resolution is wrong, the ref should say what it
 * pointed at without a database round trip. Uniqueness rests on the measured
 * fact that post-normalization ids do not collide.
 */
export function makeSourceRecordRef(seed: Pick<IdentitySeed, 'refClass' | 'normalizedId' | 'mode'>): string {
  if (seed.normalizedId.trim() === '') {
    throw new IdentityError('normalizedId must not be empty', 'IDENTITY_INVALID_SEED');
  }
  if (seed.normalizedId.includes('@')) {
    throw new IdentityError(
      `normalizedId must not contain "@" (mode separator): ${seed.normalizedId}`,
      'IDENTITY_INVALID_SEED',
    );
  }
  const base = `${seed.refClass}:${seed.normalizedId}`;
  return seed.mode === undefined || seed.mode === '' ? base : `${base}@${seed.mode}`;
}

export type ParsedSourceRecordRef = {
  readonly refClass: RefClass;
  readonly normalizedId: string;
  readonly mode?: string;
};

/** Inverse of {@link makeSourceRecordRef}. Round-tripping is a Gate 1 test. */
export function parseSourceRecordRef(ref: string): ParsedSourceRecordRef {
  const separator = ref.indexOf(':');
  if (separator <= 0) {
    throw new IdentityError(`malformed source_record_ref: ${ref}`, 'IDENTITY_MALFORMED_REF');
  }
  const refClass = ref.slice(0, separator);
  if (!isRefClass(refClass)) {
    throw new IdentityError(`unknown ref_class in ref: ${ref}`, 'IDENTITY_MALFORMED_REF');
  }
  const remainder = ref.slice(separator + 1);
  if (remainder === '') {
    throw new IdentityError(`empty record id in ref: ${ref}`, 'IDENTITY_MALFORMED_REF');
  }
  const modeAt = remainder.lastIndexOf('@');
  if (modeAt === -1) {
    return { refClass, normalizedId: remainder };
  }
  const normalizedId = remainder.slice(0, modeAt);
  const mode = remainder.slice(modeAt + 1);
  if (normalizedId === '' || mode === '') {
    throw new IdentityError(`malformed mode suffix in ref: ${ref}`, 'IDENTITY_MALFORMED_REF');
  }
  return { refClass, normalizedId, mode };
}

/**
 * `candidate_id` — opaque and deterministic.
 *
 * Both `source_sha256` and `index_version` are hashed in, which is what makes
 * property 3 structural rather than a convention: re-export the source or change
 * the index format and every id changes, so a stale selection cannot resolve by
 * accident.
 *
 * Truncated to 24 hex characters (96 bits). Across ~1,207 records the collision
 * probability is negligible, and the index builder additionally asserts
 * uniqueness at build time rather than trusting the estimate.
 */
export function makeCandidateId(seed: IdentitySeed): string {
  assertSourceSha256(seed.sourceSha256);
  assertIndexVersion(seed.indexVersion);
  const ref = makeSourceRecordRef(seed);
  // NUL-delimited so no field value can imitate the delimiter and forge a
  // different tuple that hashes identically. A printable separator would not do:
  // token paths legitimately contain slashes and punctuation, whereas NUL cannot
  // occur in a hash, a semver string or a record ref. Written as an escape so the
  // source file stays text, not binary.
  const material = [seed.sourceSha256, seed.indexVersion, ref].join('\u0000');
  const digest = createHash('sha256').update(material, 'utf8').digest('hex');
  return `${CANDIDATE_ID_PREFIX}${digest.slice(0, CANDIDATE_ID_HEX_LENGTH)}`;
}

/** Build the whole identity from a seed. The only sanctioned constructor. */
export function makeCandidateIdentity(seed: IdentitySeed): CandidateIdentity {
  return {
    candidate_id: makeCandidateId(seed),
    source_record_ref: makeSourceRecordRef(seed),
    source_sha256: seed.sourceSha256,
    index_version: seed.indexVersion,
  };
}

export function isWellFormedCandidateId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(CANDIDATE_ID_PREFIX) &&
    new RegExp(`^${CANDIDATE_ID_PREFIX}[0-9a-f]{${CANDIDATE_ID_HEX_LENGTH}}$`).test(value)
  );
}

function assertSourceSha256(value: string): void {
  if (!SHA256_HEX.test(value)) {
    throw new IdentityError(
      `source_sha256 must be 64 lowercase hex characters, received: ${value}`,
      'IDENTITY_INVALID_SEED',
    );
  }
}

function assertIndexVersion(value: string): void {
  if (!SEMVER.test(value)) {
    throw new IdentityError(
      `index_version must be semver, received: ${value}`,
      'IDENTITY_INVALID_SEED',
    );
  }
}

export type SnapshotIdentity = {
  readonly source_sha256: string;
  readonly index_version: string;
};

/**
 * Staleness gate. Called before a selection is materialized.
 *
 * Distinguishes a changed *source* from a changed *index format* because the
 * remedies differ: a new export needs re-resolution against new candidates,
 * while a format change needs only an index rebuild. Collapsing them into one
 * error would hide which happened.
 */
export function assertIdentityFresh(identity: CandidateIdentity, current: SnapshotIdentity): void {
  if (identity.source_sha256 !== current.source_sha256) {
    throw new IdentityError(
      `stale source: candidate was resolved against ${identity.source_sha256.slice(0, 12)}… ` +
        `but the current source is ${current.source_sha256.slice(0, 12)}…. Re-resolve; do not remap.`,
      'IDENTITY_STALE_SOURCE',
    );
  }
  if (identity.index_version !== current.index_version) {
    throw new IdentityError(
      `stale index format: candidate carries index_version ${identity.index_version}, ` +
        `current is ${current.index_version}. Rebuild the index.`,
      'IDENTITY_STALE_INDEX',
    );
  }
}

/**
 * Recomputes the id from the ref and asserts it matches. This is what makes a
 * fabricated or hand-edited `candidate_id` non-resolvable: the model may select
 * an id, but only deterministic code can produce one that verifies.
 */
export function assertIdentityConsistent(identity: CandidateIdentity): void {
  if (!isWellFormedCandidateId(identity.candidate_id)) {
    throw new IdentityError(
      `malformed candidate_id: ${identity.candidate_id}`,
      'IDENTITY_MALFORMED_CANDIDATE_ID',
    );
  }
  const parsed = parseSourceRecordRef(identity.source_record_ref);
  const expected = makeCandidateId({
    refClass: parsed.refClass,
    normalizedId: parsed.normalizedId,
    sourceSha256: identity.source_sha256,
    indexVersion: identity.index_version,
    mode: parsed.mode,
  });
  if (expected !== identity.candidate_id) {
    throw new IdentityError(
      `candidate_id does not derive from its own source_record_ref — fabricated or altered identity ` +
        `(ref=${identity.source_record_ref})`,
      'IDENTITY_MISMATCH',
    );
  }
}

/**
 * Deterministic tiebreak (decision **D-C.5**): score, then normalized path,
 * then the immutable record ref.
 *
 * The Python prototype sorts by score with no `ORDER BY`, so equal scores fall
 * out in whatever order SQLite returned — not stable across rebuilds. §12
 * requires stable ordering, so this is a deliberate addition rather than a
 * transcription, and it is why the port cross-check compares rank windows
 * instead of exact ordering.
 */
export type Rankable = {
  readonly score: number;
  readonly path: string;
  readonly source_record_ref: string;
};

export function compareRanked(a: Rankable, b: Rankable): number {
  if (a.score !== b.score) return b.score - a.score;
  const byPath = a.path.localeCompare(b.path, 'en');
  if (byPath !== 0) return byPath;
  return a.source_record_ref.localeCompare(b.source_record_ref, 'en');
}

/** Sorts a copy — callers must not depend on input mutation. */
export function rankStably<T extends Rankable>(items: readonly T[]): T[] {
  return [...items].sort(compareRanked);
}
