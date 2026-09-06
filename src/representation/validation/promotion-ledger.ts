/**
 * The promotion ledger — what happened to every research rule.
 *
 * The research package declares twenty-nine rules across two families: nine
 * `VR-*` governing a Builder's runtime behaviour when consuming a valid
 * contract, and twenty `CV-*` governing the integrity of the document itself.
 * The promotion does not land them all at once, because a rule declared before
 * anything enforces it is D-5 reproduced deliberately.
 *
 * So this ledger exists to make the gap **countable instead of silent**. Every
 * research id appears here exactly once with a disposition: promoted into named
 * `REP-*` rows, pending in a named work package, or retired with a reason. A
 * test asserts the list is complete, that every `promoted_to` names a row that
 * actually exists, and that nothing is pending without saying where it lands.
 * A rule quietly dropped during promotion therefore fails a test rather than
 * disappearing — which is the failure mode the research package demonstrates
 * and could not see.
 *
 * The ids here are transcribed, not read: nothing in this repository imports or
 * opens `plugin_explore_phase/` (BP-1, BP-2).
 */

export type PromotionDisposition =
  | 'promoted'
  /** Some legs of the rule are enforced now and some are not. Modelling this as
   *  plain `promoted` would overstate what is covered, which is the specific
   *  dishonesty the ledger exists to prevent. */
  | 'partially_promoted'
  | 'pending'
  | 'retired';

export type PromotionLedgerRow = {
  /** The research rule id, `VR-*` or `CV-*`. */
  readonly research_id: string;
  readonly disposition: PromotionDisposition;
  /** `REP-*` rows this rule became. Non-empty for promoted and
   *  partially_promoted, empty otherwise. */
  readonly promoted_to: readonly string[];
  /** The work package that lands the rest of it. Present for pending and
   *  partially_promoted, absent otherwise. */
  readonly pending_in?: string | undefined;
  /** Why, in one line. Never empty — a disposition with no reason is a guess. */
  readonly note: string;
};

const promoted = (
  research_id: string,
  promoted_to: readonly string[],
  note: string,
): PromotionLedgerRow => ({ research_id, disposition: 'promoted', promoted_to, note });

const partial = (
  research_id: string,
  promoted_to: readonly string[],
  pending_in: string,
  note: string,
): PromotionLedgerRow => ({
  research_id,
  disposition: 'partially_promoted',
  promoted_to,
  pending_in,
  note,
});

const pending = (research_id: string, pending_in: string, note: string): PromotionLedgerRow => ({
  research_id,
  disposition: 'pending',
  promoted_to: [],
  pending_in,
  note,
});

export const PROMOTION_LEDGER: readonly PromotionLedgerRow[] = [
  // --- VR-*: Builder runtime behaviour ------------------------------------
  // These govern what a Builder does with an already-valid contract, so their
  // enforcement point is the Builder stage, not the document validator. What
  // Builder Phase 1 does for them now is structural: REP-06 and REP-07 make
  // every one of them carry a resolvable target, which is the correction D-1
  // and D-3 call for and is a precondition for enforcing any of them at all.
  pending('VR-1', 'D', 'Naming drift with an unambiguous structural role. D-3: its research target named LR-1, a list representation, while the matrix it guards was LR-2.'),
  pending('VR-2', 'D', 'Ambiguous structural role — a Builder must refuse rather than choose.'),
  pending('VR-3', 'D', 'An unresolved axis correlation must not gate a write.'),
  pending('VR-4', 'D', 'A fully_enumerated approval is re-checked at use time, not trusted from the contract.'),
  pending('VR-5', 'D', 'Physical completeness claims require component-child-level evidence.'),
  pending('VR-6', 'D', 'Matrix allocation requires explicit human approval before use.'),
  pending('VR-7', 'D', 'Theme mode names are read from the file, never assumed.'),
  pending('VR-8', 'D', 'Canonical values and display-label captions are not interchangeable.'),
  pending('VR-9', 'D', 'D-1: its research detectionCondition named three v0.3 tokens absent from the v0.4 schema, so the rule was unactionable as written.'),

  // --- CV-*: document integrity -------------------------------------------
  pending('CV-1', 'B3', 'Weak evidence must not be paired with a physical-completeness claim.'),
  promoted('CV-2', ['REP-16'], 'Duplicate identifiers within a namespace, plus C-11: a buildFrameId must not collide with a component set id.'),
  promoted('CV-3', ['REP-11', 'REP-15'], 'Broken or inconsistent cross-references. D-5 said it was declared with zero negative fixture; both directions now carry one.'),
  promoted('CV-3b', ['REP-12', 'REP-17'], 'Layout-representation kind-compatibility (D-3) and explicit declaration of variants no representation covers.'),
  promoted('CV-4', ['REP-03'], 'D-5 orphan: fixture-asserted, never declared. Now declared with coverage in both directions.'),
  pending('CV-5', 'B3', 'Incomplete or duplicate correlated-axis tuple entry.'),
  pending('CV-6', 'B3', 'Owner approval without a resolvable, bidirectionally-agreeing confirmation record.'),
  pending('CV-7', 'B3', 'An allocation dimension referencing something that does not exist or is out of scope.'),
  pending('CV-8', 'B3', 'Unauthorized promotion into approvedCombinations.'),
  promoted('CV-9', ['REP-04'], 'D-5 orphan: fixture-asserted, never declared. The schema conditional it names is the one D-3 walked past.'),
  promoted('CV-10', ['REP-01', 'REP-02'], 'The version/readiness/approval promotion gate, split into the two directions it actually enforces.'),
  pending('CV-11', 'B3', 'Enumeration evidence must be artifact-backed and internally consistent.'),
  pending('CV-12', 'B3', 'Matrix allocations must be recomputable from evidence, per source documentation block.'),
  pending('CV-13', 'B3', 'Enumeration-provenance class rules.'),
  pending('CV-14', 'B3', 'Competing display-label mappings within one effective scope.'),
  pending('CV-15', 'B3', 'Corroboration must resolve to hashed external contracts.'),
  pending('CV-16', 'B3', 'Coverage metrics must be discriminated and non-duplicated.'),
  partial('CV-17', ['REP-10'], 'B3', 'Migration provenance. The authoringMode leg is schema-enforced today as REP-10; the legacy-state and migration-review legs are semantic and land in B3.'),
  pending('CV-18', 'B3', 'Representation node bindings — the operational locator table.'),
  promoted('CV-19', ['REP-05'], 'D-5 orphan: fixture-asserted, never declared. Naming enforcement and uniqueness policy must agree.'),
];

/** `REP-*` rows introduced by the promotion rather than descended from a
 *  research rule. Kept beside the ledger so "new" is a list, not an inference. */
export const NEW_IN_PROMOTION: readonly string[] = [
  'REP-06',
  'REP-07',
  'REP-08',
  'REP-09',
  'REP-13',
  'REP-14',
];
