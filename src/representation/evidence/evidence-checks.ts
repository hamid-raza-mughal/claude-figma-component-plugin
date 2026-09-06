/**
 * B5 — the three checks that turn D-4, D-6, D-9 and D-11 into failures.
 *
 * Each of these exists because the research package had a green suite over the
 * defect it names, and in every case the reason was the same: the check that
 * should have caught it was looking at the wrong granularity.
 *
 * **D-4 is the mechanism, and it is worth stating exactly.** The research
 * package's retired-vocabulary check reads
 * `elif isinstance(node, str) and node in RETIRED_ENUM_VALUES:` — whole-string
 * equality against a leaf value. A retired token *inside a sentence* is never
 * equal to the sentence, so it never matches. That single line is why D-1, D-2
 * and D-3 all survived: the tool that was pointed at them could not see them
 * from where it stood. `findRetiredVocabulary` matches substrings, and reports
 * where.
 *
 * **D-6** is a probe byte-identical to the artifact it was supposed to differ
 * from. "Probe C passes" was therefore a restatement of "the contract passes",
 * not an independent result — and nothing compared the two, so nobody noticed.
 * One hash comparison would have.
 *
 * **D-9 and D-11** are documents disagreeing with themselves or with the
 * artifact they describe: a blocker table listing one fewer blocker than the
 * contract carries, and a change plan declaring both "IMPLEMENTED and LOCKED"
 * and "PROPOSED. Not implemented." eight lines apart. No count was ever
 * recomputed and no document was ever read as a whole.
 */
import type { EnforcementOwner } from '../../contracts/failures.ts';

export type EvidenceViolation = {
  readonly rule_id: string;
  readonly code: string;
  /** Where — a path, or a line reference within a document. */
  readonly location: string;
  readonly message: string;
  /** Typed as the owner vocabulary, not as this one literal: a violation whose
   *  `enforced_by` disagrees with its rule's declared owner is BP-6 broken, and a
   *  test reconciles the two per rule. */
  readonly enforced_by: EnforcementOwner;
};

export type EvidenceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly EvidenceViolation[] };

function result(violations: readonly EvidenceViolation[]): EvidenceResult {
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/* ------------------------------------------------------------------ REP-18 */

/**
 * Enum values retired by the v0.4 migration — the research package's own list,
 * transcribed. Deliberately values, not field names: a removed *field* cannot
 * appear in a document the schema closes with `additionalProperties: false`,
 * and including field names would flag every sentence that describes the
 * migration, which is how a rule like this gets switched off.
 */
export const RETIRED_VOCABULARY: readonly string[] = [
  '__treatment__',
  'button_specific_pattern',
  'buttons',
  'candidate_cross_component_invariant',
  'component_children_verified',
  'observed_button_invariant',
  'ready_for_adversarial_non_button_validation',
];

/**
 * Fields a validator is supposed to *read* rather than display.
 *
 * This distinction is the whole correction, and getting it wrong in either
 * direction ruins the rule. D-4 applies whole-string equality **everywhere**,
 * so a retired token inside a condition never matches and three defects live.
 * Substring matching everywhere is no better in practice: `buttons` appears in
 * ordinary prose throughout a document about buttons, and a rule that fires on
 * every sentence is a rule nobody keeps.
 *
 * So: inside a field logic reads, a retired token anywhere in the string is a
 * violation, because that string is meant to be interpreted. Outside one, only
 * a leaf that *is* the retired value counts.
 */
export const LOGIC_BEARING_FIELD = /\/detectionCondition$/;

type Located = { readonly path: string; readonly value: string };

/** Every string leaf in a document, with a JSON Pointer to it. */
function stringLeaves(node: unknown, path = ''): readonly Located[] {
  if (typeof node === 'string') return [{ path, value: node }];
  if (Array.isArray(node)) return node.flatMap((child, i) => stringLeaves(child, `${path}/${i}`));
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
      stringLeaves(child, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`),
    );
  }
  return [];
}

/**
 * Finds retired vocabulary: as a substring inside a field logic reads, and as a
 * whole value anywhere else.
 */
export function findRetiredVocabulary(
  document: unknown,
  logicBearingField: RegExp = LOGIC_BEARING_FIELD,
): EvidenceResult {
  const violations: EvidenceViolation[] = [];
  for (const leaf of stringLeaves(document)) {
    const interpreted = logicBearingField.test(leaf.path);
    for (const token of RETIRED_VOCABULARY) {
      const hit = interpreted ? leaf.value.includes(token) : leaf.value === token;
      if (!hit) continue;
      violations.push({
        rule_id: 'REP-18',
        code: 'REP_RETIRED_VOCABULARY_IN_USE',
        location: leaf.path,
        message:
          `"${token}" was retired by the v0.4 migration and is absent from the schema, so a ` +
          'condition written in it can never fire' +
          (interpreted
            ? '. It survived because it is inside a sentence, and the check pointed at it ' +
              'compared whole leaf values'
            : ''),
        enforced_by: 'semantic-validator',
      });
    }
  }
  return result(violations);
}

/* ------------------------------------------------------------------ REP-19 */

export type Probe = {
  readonly name: string;
  /** SHA-256 of the probe's bytes. */
  readonly sha256: string;
};

/**
 * A probe must differ from the artifact it probes.
 *
 * D-6 exactly. A probe identical to its subject cannot produce an independent
 * result, and reporting that it "passes" restates the subject's own outcome
 * while reading as corroboration.
 */
export function checkProbesDiffer(input: {
  readonly subjectName: string;
  readonly subjectSha256: string;
  readonly probes: readonly Probe[];
}): EvidenceResult {
  const violations: EvidenceViolation[] = [];
  for (const probe of input.probes) {
    if (probe.sha256 === input.subjectSha256) {
      violations.push({
        rule_id: 'REP-19',
        code: 'REP_PROBE_IDENTICAL_TO_SUBJECT',
        location: probe.name,
        message:
          `${probe.name} is byte-identical to ${input.subjectName}, so "${probe.name} passes" is ` +
          `a restatement of "${input.subjectName} passes" rather than an independent result`,
        enforced_by: 'semantic-validator',
      });
    }
  }
  const byHash = new Map<string, string[]>();
  for (const probe of input.probes) {
    byHash.set(probe.sha256, [...(byHash.get(probe.sha256) ?? []), probe.name]);
  }
  for (const [, names] of byHash) {
    if (names.length > 1) {
      violations.push({
        rule_id: 'REP-19',
        code: 'REP_PROBES_IDENTICAL_TO_EACH_OTHER',
        location: names.join(', '),
        message: `${names.join(' and ')} are byte-identical, so they test one thing, not several`,
        enforced_by: 'semantic-validator',
      });
    }
  }
  return result(violations);
}

/* ------------------------------------------------------------------ REP-20 */

/**
 * Status declarations a document may carry, and which of them contradict.
 *
 * Deliberately a small closed list rather than a general contradiction detector.
 * A general one would be unfalsifiable; this one either finds two of these in
 * one document or it does not, and D-11 is the case it was written from.
 */
const STATUS_CLAIMS: readonly { readonly pattern: RegExp; readonly means: string }[] = [
  { pattern: /\bIMPLEMENTED\b/i, means: 'implemented' },
  { pattern: /\bLOCKED\b/i, means: 'locked' },
  { pattern: /\bPROPOSED\b/i, means: 'proposed' },
  { pattern: /\bNot implemented\b/i, means: 'not implemented' },
  { pattern: /\bSUPERSEDED\b/i, means: 'superseded' },
];

const CONTRADICTS: readonly (readonly [string, string])[] = [
  ['implemented', 'proposed'],
  ['implemented', 'not implemented'],
  ['locked', 'proposed'],
  ['locked', 'not implemented'],
];

/**
 * A document declares one status.
 *
 * `headLines` bounds the search to the document's header, because a body that
 * *discusses* a proposal is not the same as a header that declares one. D-11 is
 * lines 1 and 8 of the same file.
 */
export function checkDocumentStatus(
  documentName: string,
  text: string,
  headLines = 12,
): EvidenceResult {
  const head = text.split('\n').slice(0, headLines).join('\n');
  const present = new Set(
    STATUS_CLAIMS.filter((claim) => claim.pattern.test(head)).map((claim) => claim.means),
  );
  const violations: EvidenceViolation[] = [];
  for (const [left, right] of CONTRADICTS) {
    if (present.has(left) && present.has(right)) {
      violations.push({
        rule_id: 'REP-20',
        code: 'REP_DOCUMENT_DECLARES_TWO_STATUSES',
        location: `${documentName}:1-${headLines}`,
        message:
          `${documentName} declares both "${left}" and "${right}" in its first ${headLines} ` +
          'lines. A reader takes whichever they saw first, and no check ever read both',
        enforced_by: 'semantic-validator',
      });
    }
  }
  return result(violations);
}

/* ------------------------------------------------------------------ REP-21 */

/**
 * A document that enumerates an artifact's members enumerates all of them.
 *
 * D-9, which is worth reading precisely: the non-Button contract carries eleven
 * blockers and the companion analysis lists ten. The missing one is the
 * migration-review blocker, and nothing noticed because the document's table
 * was written by hand and no check ever recomputed it.
 *
 * The obvious implementation counts. Counting would not have caught this — the
 * document never states a number anywhere; it just has ten rows. So this
 * compares **id sets, in both directions**, taking the truth from the artifact
 * and never from a second document. A one-way check would miss the opposite
 * defect, a table listing something the contract dropped.
 */
export function checkDeclaredEnumeration(input: {
  readonly documentName: string;
  readonly text: string;
  /** What is being enumerated, for the message: `blockers`, say. */
  readonly noun: string;
  /** Matches an id where it appears in the document. */
  readonly idPattern: RegExp;
  /** Recomputed from the artifact, never read from another document. */
  readonly actual: readonly string[];
}): EvidenceResult {
  const stated = new Set([...input.text.matchAll(input.idPattern)].map((match) => match[0]));
  const actual = new Set(input.actual);
  const violations: EvidenceViolation[] = [];

  for (const id of [...actual].filter((value) => !stated.has(value)).sort()) {
    violations.push({
      rule_id: 'REP-21',
      code: 'REP_ENUMERATION_MISSES_MEMBER',
      location: input.documentName,
      message:
        `the artifact carries ${input.noun} ${id} and ${input.documentName} does not list it. A ` +
        'hand-written table is a second copy of a fact, and this one drifted',
      enforced_by: 'semantic-validator',
    });
  }
  for (const id of [...stated].filter((value) => !actual.has(value)).sort()) {
    violations.push({
      rule_id: 'REP-21',
      code: 'REP_ENUMERATION_INVENTS_MEMBER',
      location: input.documentName,
      message: `${input.documentName} lists ${input.noun} ${id}, which the artifact does not carry`,
      enforced_by: 'semantic-validator',
    });
  }
  return result(violations);
}
