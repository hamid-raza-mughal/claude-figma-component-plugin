/**
 * Static leakage assertion (§15.6).
 *
 * Proves the property Phase 1 can actually prove: **raw curated JSON contributes
 * zero bytes to every assembled model input**. That is structural and checkable
 * without a model, unlike any claim about token cost.
 *
 * Five checks, each a different way the boundary could fail:
 *
 *   1. **raw source bytes** — a contiguous run of the source file appearing verbatim;
 *   2. **sentinel fragments** — distinctive strings drawn from the real source, so
 *      the check fails on paraphrase-resistant evidence rather than on a guess;
 *   3. **prohibited exact-record fields** — the fields that only a complete indexed
 *      record carries;
 *   4. **inactive route modules** — content from a route that was not selected;
 *   5. **operational fields** — run facts a model must never be handed.
 *
 * Sentinels are *derived from the source* rather than hard-coded, because a
 * hard-coded list stops covering the source the moment the export changes. A
 * detector that silently stops detecting is worse than none.
 */
import { OPERATIONAL_FIELD_NAMES } from '../contracts/run-envelope.ts';
import type { AssembledModelInput } from './assemble-model-input.ts';

export const LEAK_KINDS = [
  'raw-source-bytes',
  'source-sentinel',
  'exact-record-field',
  'inactive-route-module',
  'operational-field',
] as const;

export type LeakKind = (typeof LEAK_KINDS)[number];

export type LeakFinding = {
  readonly kind: LeakKind;
  readonly detail: string;
  /** Which assembled section carried it — localises the fix. */
  readonly section: string;
  /** A short window around the match, for a readable failure message. */
  readonly excerpt: string;
};

/**
 * Fields that exist only on a **complete indexed record**.
 *
 * A candidate legitimately carries `path`, `key`, `ref_class` and a compact
 * `value_preview`. It must never carry the payload, the raw values map, the full
 * description, or the index's internal row id.
 */
export const PROHIBITED_EXACT_RECORD_FIELDS: readonly string[] = [
  'payload_json',
  'values_json',
  'values_by_mode',
  'bound_variables',
  'scopes_json',
  'anomalies_json',
  'path_folded',
  'raw_id',
  'uid',
  'rowid',
  'entry_fts',
  'source_record_ref',
];

/** Minimum contiguous run treated as a raw-source leak. Long enough that ordinary
 *  prose cannot collide with it, short enough to catch a single inlined record. */
export const RAW_RUN_LENGTH = 120;

/**
 * Derives sentinels from the raw source: distinctive substrings that should never
 * appear in an assembled input.
 *
 * Picks structural JSON fragments rather than token paths — a path may legitimately
 * appear in a candidate row, whereas `"values_by_mode": {` never should.
 */
export function deriveSourceSentinels(rawSource: string): readonly string[] {
  const sentinels = new Set<string>();
  for (const pattern of [
    /"values_by_mode"\s*:\s*\{/,
    /"bound_variables"\s*:\s*[[{]/,
    /"code_syntax"\s*:\s*\{/,
    /"figma_file_key"\s*:/,
    /"plugin_version"\s*:/,
    /"paints"\s*:\s*\[/,
    /"leading_trim"\s*:/,
    /"hanging_punctuation"\s*:/,
  ]) {
    const match = pattern.exec(rawSource);
    if (match !== null) sentinels.add(match[0]);
  }
  // A long verbatim slice from the middle of the file: paraphrase-proof, and it
  // catches wholesale inlining that structural fragments might miss.
  if (rawSource.length > 4000) {
    sentinels.add(rawSource.slice(2000, 2000 + RAW_RUN_LENGTH));
  }
  return [...sentinels];
}

function windowAround(haystack: string, needle: string): string {
  const at = haystack.indexOf(needle);
  if (at < 0) return '';
  const start = Math.max(0, at - 30);
  return haystack.slice(start, at + needle.length + 30).replace(/\s+/g, ' ');
}

export type LeakageCheckInput = {
  readonly assembled: AssembledModelInput;
  /** The raw curated source. Supplied so the check runs against the real file
   *  rather than against an idea of it. */
  readonly rawSource?: string | undefined;
  /** Module ids for routes that were not selected. */
  readonly inactiveRouteModuleIds: readonly string[];
  /** Distinctive lines from inactive route modules, so a paraphrase does not pass. */
  readonly inactiveRouteFingerprints?: readonly string[] | undefined;
};

export type LeakageReport = {
  readonly clean: boolean;
  readonly findings: readonly LeakFinding[];
  readonly checks_run: readonly LeakKind[];
  /** True when `rawSource` was supplied. When false, checks 1 and 2 did not run and
   *  the report must not be read as proving them — a partial check reported as a
   *  pass is exactly the false evidence this phase exists to remove. */
  readonly raw_source_checked: boolean;
};

export function assertNoLeakage(input: LeakageCheckInput): LeakageReport {
  const findings: LeakFinding[] = [];
  const { assembled, rawSource } = input;

  for (const section of assembled.sections) {
    const content = section.content;

    if (rawSource !== undefined) {
      // 1. A contiguous run of the source appearing verbatim.
      for (let offset = 0; offset + RAW_RUN_LENGTH <= rawSource.length; offset += RAW_RUN_LENGTH) {
        const run = rawSource.slice(offset, offset + RAW_RUN_LENGTH);
        if (content.includes(run)) {
          findings.push({
            kind: 'raw-source-bytes',
            detail: `${RAW_RUN_LENGTH} contiguous source bytes at source offset ${offset}`,
            section: section.name,
            excerpt: windowAround(content, run),
          });
          break;
        }
      }

      // 2. Structural sentinels.
      for (const sentinel of deriveSourceSentinels(rawSource)) {
        if (content.includes(sentinel)) {
          findings.push({
            kind: 'source-sentinel',
            detail: sentinel.slice(0, 40),
            section: section.name,
            excerpt: windowAround(content, sentinel),
          });
        }
      }
    }

    // 3. Fields only a complete indexed record carries.
    for (const field of PROHIBITED_EXACT_RECORD_FIELDS) {
      if (content.includes(field)) {
        findings.push({
          kind: 'exact-record-field',
          detail: field,
          section: section.name,
          excerpt: windowAround(content, field),
        });
      }
    }

    // 4. Content from a route that was not selected.
    for (const moduleId of input.inactiveRouteModuleIds) {
      if (content.includes(moduleId)) {
        findings.push({
          kind: 'inactive-route-module',
          detail: moduleId,
          section: section.name,
          excerpt: windowAround(content, moduleId),
        });
      }
    }
    for (const fingerprint of input.inactiveRouteFingerprints ?? []) {
      if (fingerprint.length >= 24 && content.includes(fingerprint)) {
        findings.push({
          kind: 'inactive-route-module',
          detail: `fingerprint: ${fingerprint.slice(0, 40)}…`,
          section: section.name,
          excerpt: windowAround(content, fingerprint),
        });
      }
    }

    // 5. Operational fields. Skipped for the output contract, which names them in
    //    order to forbid them — a prohibition has to be able to quote its subject.
    if (section.name !== 'output-contract') {
      for (const field of OPERATIONAL_FIELD_NAMES) {
        if (new RegExp(`["'\`]?\\b${field}\\b["'\`]?\\s*[:=]`).test(content)) {
          findings.push({
            kind: 'operational-field',
            detail: field,
            section: section.name,
            excerpt: windowAround(content, field),
          });
        }
      }
    }
  }

  return {
    clean: findings.length === 0,
    findings,
    checks_run: rawSource === undefined ? LEAK_KINDS.slice(2) : [...LEAK_KINDS],
    raw_source_checked: rawSource !== undefined,
  };
}
