/**
 * Source hashing (§13.1.6, §13.1.8).
 *
 * Two different hashes, for two different jobs, and conflating them would be a
 * subtle bug:
 *
 *   - `hashSourceBytes` — SHA-256 of the **file exactly as it exists**. This is
 *     the authoritative `source_sha256`: it is what identity is derived from and
 *     what index reuse is keyed on. Byte-exact, so reformatting the export
 *     invalidates the index, which is the correct and conservative behaviour.
 *
 *   - `canonicalJsonHash` — SHA-256 of a **key-sorted serialization**. Used only
 *     for collision and equivalence checks, where two files that differ solely in
 *     key order should compare equal.
 */
import { createHash } from 'node:crypto';

export function hashSourceBytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Deterministic serialization: object keys sorted, arrays left in order.
 *
 * Array order is preserved deliberately — it is meaningful in this export (paint
 * stacks, bound-variable lists), so sorting arrays would destroy information and
 * make two genuinely different files hash alike.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, 'en'));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(',')}}`;
  }
  if (typeof value === 'number') {
    // Normalize -0 to 0 so two numerically identical values cannot hash apart.
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  return JSON.stringify(value) ?? 'null';
}

export function canonicalJsonHash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

/** Short form for messages. Never used as an identity — a truncated hash is for
 *  humans reading logs, not for equality. */
export function shortHash(sha256: string): string {
  return `${sha256.slice(0, 12)}…`;
}
