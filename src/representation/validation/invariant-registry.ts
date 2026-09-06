/**
 * The `REP-*` invariant registry (BP-6).
 *
 * One row per invariant, each naming **exactly one** `EnforcementOwner`. That
 * rule is inherited from `INV-15` in `src/validation/invariant-registry.ts` and
 * its stated reason applies unchanged: "an invariant owned by 'the schema and
 * also the validator' is in practice owned by neither."
 *
 * Two things about this registry are deliberate and are the point of the work
 * package.
 *
 * **It is the only declaration.** The promoted contract instance carries no rule
 * arrays of its own (MB-7). D-5 is what happens when it does: in the research
 * package three ids were asserted by fixtures against rules the contract never
 * declared, while a fourth was declared with no negative fixture at all — a
 * divergence only possible because declaration and enforcement lived in
 * different files with nothing reconciling them.
 *
 * **It never runs ahead of its enforcement.** A row appears here only once
 * something enforces it and fixtures prove it in both directions. Rules still
 * awaiting their enforcement point are recorded in `promotion-ledger.ts` with
 * the work package that will land them, so a dropped rule is a failing test
 * rather than a silence. Declaring the full catalogue now and covering it later
 * would reproduce D-5 exactly, on purpose.
 */
import type { EnforcementOwner } from '../../contracts/failures.ts';

export type RepresentationInvariant = {
  /** Stable id, referenced by fixtures and by error codes. */
  readonly id: string;
  readonly statement: string;
  /** Exactly one. `ENFORCEMENT_OWNERS` already carries the three this phase
   *  needs; BP-6 forbids adding a fourth. */
  readonly owner: EnforcementOwner;
  /** The research rule this descends from, or `null` where the rule is new to
   *  the promotion. Lineage is what makes the promotion ledger checkable. */
  readonly promoted_from: string | null;
  /** The verified research defect this exists to prevent, where there is one. */
  readonly prevents?: string | undefined;
  /** Machine-readable code emitted on violation. */
  readonly error_code: string;
};

export const REPRESENTATION_INVARIANTS: readonly RepresentationInvariant[] = [
  {
    id: 'REP-01',
    statement:
      'A contractVersion matching ^1.0.0$ requires readinessStatus ready_for_production, ' +
      'approvalStatus.overall approved and zero blockers.',
    owner: 'schema',
    promoted_from: 'CV-10',
    prevents:
      'a version string encoding an approval claim the document does not support — the reason ' +
      'the promotion is 0.4.1-draft and not 1.0.0 (BP-3)',
    error_code: 'REP_VERSION_CLAIMS_UNEARNED_APPROVAL',
  },
  {
    id: 'REP-02',
    statement:
      'A -draft contractVersion permits only readinessStatus not_ready or validation_ready.',
    owner: 'schema',
    promoted_from: 'CV-10',
    prevents: 'a draft declaring itself production-ready, which would make the suffix decorative',
    error_code: 'REP_DRAFT_DECLARED_READY',
  },
  {
    id: 'REP-03',
    statement:
      'An approved contract carries zero blockers and a non-empty ownerConfirmationRef.',
    owner: 'schema',
    promoted_from: 'CV-4',
    prevents:
      'D-5: the research fixture set asserted CV-4 against a rule its contract never declared',
    error_code: 'REP_APPROVED_WITH_OPEN_BLOCKERS',
  },
  {
    id: 'REP-04',
    statement:
      'A layoutRepresentation carries an allocation if and only if its strategy is matrix.',
    owner: 'schema',
    promoted_from: 'CV-9',
    prevents:
      'D-3: a matrix-cell rule whose target resolved to a list representation with no allocation',
    error_code: 'REP_ALLOCATION_STRATEGY_MISMATCH',
  },
  {
    id: 'REP-05',
    statement:
      "A namingRule's uniquenessPolicy agrees with its enforcement level: required and " +
      'recommended take a real policy, observed_only takes not_applicable.',
    owner: 'schema',
    promoted_from: 'CV-19',
    prevents:
      'D-5: CV-19 was fixture-asserted and undeclared, so a rule nobody enforces could still ' +
      'claim uniqueness',
    error_code: 'REP_NAMING_POLICY_DISAGREES_WITH_ENFORCEMENT',
  },
  {
    id: 'REP-06',
    statement:
      'Every structuralFinding, approval blocker and knownLimitation carries a structured target.',
    owner: 'schema',
    promoted_from: null,
    prevents:
      'D-1, D-2 and D-7 — three load-bearing references that lived only inside sentences and ' +
      'survived a fully green suite because nothing resolved them',
    error_code: 'REP_ROW_WITHOUT_STRUCTURED_TARGET',
  },
  {
    id: 'REP-07',
    statement:
      'A target is kind-compatible: requiredStrategy appears only on a layout_representation ' +
      'target, a contract target takes the literal ref self, and a contract_field target takes ' +
      'a JSON Pointer.',
    owner: 'schema',
    promoted_from: null,
    prevents:
      'D-3: the rule and its subject were both present and simply did not match, which no ' +
      'existence check alone would have caught',
    error_code: 'REP_TARGET_KIND_INCOMPATIBLE',
  },
  {
    id: 'REP-08',
    statement: 'An artifact target carries a SHA-256 content pin.',
    owner: 'schema',
    promoted_from: null,
    prevents:
      'D-7: a blocker citing an allocation-evidence artifact that does not exist. A path alone ' +
      'can also resolve to different bytes than the claim was made over',
    error_code: 'REP_ARTIFACT_TARGET_UNPINNED',
  },
  {
    id: 'REP-09',
    statement:
      'Free text is confined to a closed narrative object, which no production code path reads ' +
      'as a reference.',
    owner: 'schema',
    promoted_from: null,
    prevents:
      "D-1 and D-4: three retired vocabulary tokens inside a rule's sentence, invisible to a " +
      'checker doing whole-string equality on leaf values',
    error_code: 'REP_REFERENCE_SMUGGLED_INTO_PROSE',
  },
  {
    id: 'REP-10',
    statement:
      'authoringMode authored requires a null migrationReportRef; migrated requires a hashed one.',
    owner: 'schema',
    promoted_from: 'CV-17',
    prevents:
      'legacy migration states being reachable in an authored contract without version-sniffing',
    error_code: 'REP_MIGRATION_PROVENANCE_MISMATCH',
  },
  {
    id: 'REP-11',
    statement:
      "A target's targetRef resolves to an existing member of the collection its targetKind " +
      'names.',
    owner: 'reference-validator',
    promoted_from: 'CV-3',
    prevents:
      'D-1 and D-2 — references that existed only inside sentences, so nothing ever tried to ' +
      'resolve them',
    error_code: 'REP_TARGET_UNRESOLVED',
  },
  {
    id: 'REP-12',
    statement:
      'A layout_representation target declaring requiredStrategy resolves to a representation ' +
      'whose strategy is that one.',
    owner: 'reference-validator',
    promoted_from: 'CV-3b',
    prevents:
      'D-3 exactly. Existence alone passes it — LR-1 exists — and what was wrong was its kind',
    error_code: 'REP_TARGET_STRATEGY_MISMATCH',
  },
  {
    id: 'REP-13',
    statement:
      'An artifact target resolves to a file that exists, and its bytes hash to the pin the ' +
      'target carries.',
    owner: 'reference-validator',
    promoted_from: null,
    prevents:
      'D-7: a blocker citing an allocation-evidence artifact absent from disk. A path with no ' +
      'reader is a violation, not a skip — an unchecked reference must not read as a passing one',
    error_code: 'REP_ARTIFACT_TARGET_UNRESOLVABLE',
  },
  {
    id: 'REP-14',
    statement: "A contract_field target's JSON Pointer resolves to a value inside this contract.",
    owner: 'reference-validator',
    promoted_from: null,
    prevents:
      'a pointer that runs off the end of an array, which resolves to undefined and would ' +
      'otherwise pass silently',
    error_code: 'REP_CONTRACT_FIELD_POINTER_UNRESOLVED',
  },
  {
    id: 'REP-15',
    statement:
      "Every typedScope's scopeRef resolves against the array its scopeType names.",
    owner: 'reference-validator',
    promoted_from: 'CV-3',
    prevents:
      'C-3 regressing: scope was separated from corroboration precisely so a finding could say ' +
      'what it applies to, and an unresolvable scope says nothing',
    error_code: 'REP_SCOPE_REF_UNRESOLVED',
  },
  {
    id: 'REP-16',
    statement:
      'An identifier names one member of its namespace, and no buildFrameId collides with a ' +
      'component set id.',
    owner: 'semantic-validator',
    promoted_from: 'CV-2',
    prevents:
      'C-11: buildFrameId is a many-to-one reference, so a collision makes one string mean two ' +
      'things depending on which field read it',
    error_code: 'REP_DUPLICATE_IDENTIFIER',
  },
  {
    id: 'REP-17',
    statement:
      'Every schema variant is either covered by a layout representation or listed as ' +
      'undocumented, and never both.',
    owner: 'semantic-validator',
    promoted_from: 'CV-3b',
    prevents:
      'silence reading the same as "we looked and found nothing" — the condition every one of ' +
      'D-1, D-2, D-7 and D-9 depends on to survive',
    error_code: 'REP_UNCOVERED_VARIANT_NOT_DECLARED',
  },
];

export const REPRESENTATION_INVARIANTS_BY_ID: ReadonlyMap<string, RepresentationInvariant> =
  new Map(REPRESENTATION_INVARIANTS.map((invariant) => [invariant.id, invariant]));
