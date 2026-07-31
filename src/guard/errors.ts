/**
 * Every Guard refusal names its rule (§8.5, §12.1) — "an accountable owner for
 * each invariant" means the code, not just a message. `run-guard` is the
 * `EnforcementOwner` for all of these (docs/phase2-decision-log.md PD-4).
 *
 * Numbering is not sequential by design — the contract adds codes, it never
 * renumbers (§19 preamble, N-17). This union is transcribed from §12.1's rule
 * list, not invented independently.
 */
export const GUARD_CODES = [
  'G-1',
  'G-2',
  'G-3a',
  'G-3b',
  'G-4',
  'G-5',
  'G-6a',
  'G-6b',
  'G-7',
  'G-8',
  'G-9a',
  'G-9b',
  'G-9c',
  'G-10',
  'G-11',
  'G-12',
  'G-13',
  'G-14',
  'G-15',
  'G-16',
  'G-17',
  'G-18',
  'G-19a',
  'G-19b',
  'G-20a',
  'G-20b',
  'G-20c',
  'G-21',
] as const;

export type GuardCode = (typeof GUARD_CODES)[number];

export class GuardRefusal extends Error {
  override readonly name = 'GuardRefusal';
  readonly code: GuardCode;
  readonly enforcedBy = 'run-guard';

  constructor(code: GuardCode, message: string) {
    super(message);
    this.code = code;
  }
}
