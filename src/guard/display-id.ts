/**
 * `display_id` minting (§2.2.1, §19 D-6): `{run_type}-{Crockford base32 of the
 * first 40 bits of run_id}` — e.g. `new-7F3K2Q1B`. Derived from a value already
 * minted (`run_id`), so no counter and no second authority to race under CAS
 * (§11.6.2).
 *
 * Pure derivation only. "Re-mint on collision" (D-6) means generating a *new*
 * `run_id` and deriving again — that retry loop needs to check the store for an
 * existing `display_id`, so it lives in the `beginRun` tool (WP5), not here.
 */
import type { RunType } from '../contracts/invocation.ts';

/** Crockford's alphabet: excludes I, L, O, U to avoid visual confusion —
 *  the whole reason this form exists is that a designer reads it back aloud. */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export class DisplayIdError extends Error {
  override readonly name = 'DisplayIdError';
}

const HEX_PAIR = /^[0-9a-fA-F]{2}$/;

function firstFortyBitsAsBytes(runId: string): Uint8Array {
  const hex = runId.replace(/-/g, '');
  if (hex.length < 10) {
    throw new DisplayIdError(`run_id "${runId}" is too short to derive 40 bits from.`);
  }
  const bytes = new Uint8Array(5);
  for (let i = 0; i < 5; i += 1) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    if (!HEX_PAIR.test(pair)) {
      throw new DisplayIdError(`run_id "${runId}" is not valid hex at byte ${i}.`);
    }
    bytes[i] = Number.parseInt(pair, 16);
  }
  return bytes;
}

/** 5 bytes (40 bits) -> 8 Crockford base32 characters, 5 bits each. */
function encodeCrockfordBase32(bytes: Uint8Array): string {
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let out = '';
  for (let charIndex = 7; charIndex >= 0; charIndex -= 1) {
    const shift = BigInt(charIndex * 5);
    const symbolIndex = Number((bits >> shift) & 0b11111n);
    out += CROCKFORD_ALPHABET[symbolIndex];
  }
  return out;
}

export function mintDisplayId(runType: RunType, runId: string): string {
  return `${runType}-${encodeCrockfordBase32(firstFortyBitsAsBytes(runId))}`;
}
