/**
 * B3 — the semantic checks that reference resolution cannot express.
 *
 * Two rules live here, and they are here rather than in the resolver because
 * neither is about whether a reference points at something. `REP-16` is about
 * two things sharing one name; `REP-17` is about a thing nothing points at.
 *
 * `REP-17` is the one worth reading twice. A schema variant that no layout
 * representation covers is not an error — it is undocumented, which is a real
 * and common state. The rule is that the contract must **say so**: silence and
 * "we looked and there was nothing" are indistinguishable to a reader and to a
 * Builder, and the research package's own defect list is a catalogue of what
 * silence costs. `undocumentedSchemaVariantIds` is the field that makes the
 * absence explicit, so the check is bidirectional: an uncovered variant must be
 * listed, and a listed variant must not also be covered.
 */
import type { EnforcementOwner } from '../../contracts/failures.ts';

export type SemanticViolation = {
  readonly rule_id: string;
  readonly code: string;
  readonly instance_path: string;
  readonly message: string;
  /** Typed as the owner vocabulary, not as this one literal: a violation whose
   *  `enforced_by` disagrees with its rule's declared owner is BP-6 broken, and a
   *  test reconciles the two per rule. */
  readonly enforced_by: EnforcementOwner;
};

export type SemanticResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly SemanticViolation[] };

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function field(row: unknown, name: string): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const value = (row as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

/**
 * Each namespace, and the field its members are identified by.
 *
 * These names are a second account of the schema's own property names, and
 * `tests/representation/invariant-registry.test.ts` reconciles them against it.
 * Without that reconciliation the drift is **silent** here in a way it is not in
 * the reference resolver: if a key name changes, the resolver's id set empties
 * and every target stops resolving, loudly, while this filter drops every row
 * and reports a contract with duplicate ids as clean.
 */
export const NAMESPACES: readonly { readonly collection: string; readonly key: string }[] = [
  { collection: 'componentSets', key: 'id' },
  { collection: 'propertySchemaVariants', key: 'variantId' },
  { collection: 'layoutRepresentations', key: 'representationId' },
  { collection: 'namingRules', key: 'namingRuleId' },
  { collection: 'correlatedAxisTuples', key: 'tupleId' },
  { collection: 'structuralFindings', key: 'findingId' },
  { collection: 'ownerConfirmations', key: 'confirmationId' },
  { collection: 'knownLimitations', key: 'limitationId' },
];

export function checkSemantics(contractInput: unknown): SemanticResult {
  const violations: SemanticViolation[] = [];
  const contract = (
    typeof contractInput === 'object' && contractInput !== null ? contractInput : {}
  ) as Record<string, unknown>;

  const fail = (
    rule_id: string,
    code: string,
    instance_path: string,
    message: string,
  ): void => {
    violations.push({ rule_id, code, instance_path, message, enforced_by: 'semantic-validator' });
  };

  // REP-16 — one name, one thing.
  for (const namespace of NAMESPACES) {
    const rows = asArray(contract[namespace.collection]);
    const ids = rows
      .map((row) => field(row, namespace.key))
      .filter((id): id is string => id !== null);
    /*
     * The failure mode this catches is silence, and it is asymmetric with the
     * resolver in a way audit cycle 2 named. If a key name here drifts from the
     * schema — `namingRuleId` becoming `ruleId`, say — the reference resolver
     * fails loud: its id set empties and every target stops resolving. This
     * check fails *silent*: `field` returns null for every row, the filter drops
     * them all, and a contract with duplicate identifiers reports clean. A
     * duplicate check that has quietly stopped checking is D-5's shape.
     */
    if (rows.length > 0 && ids.length === 0) {
      fail(
        'REP-16',
        'REP_NAMESPACE_KEY_UNREADABLE',
        `/${namespace.collection}`,
        `no member of ${namespace.collection} carries a ${namespace.key}, so uniqueness was not ` +
          'checked — this is the check reporting that it did not run, not that it passed',
      );
    }
    for (const duplicate of duplicates(ids)) {
      fail(
        'REP-16',
        'REP_DUPLICATE_IDENTIFIER',
        `/${namespace.collection}`,
        `${duplicate} identifies more than one member of ${namespace.collection}`,
      );
    }
  }

  /**
   * C-11: `buildFrameId` is a many-to-one *reference*, not an identity —
   * several component sets legitimately share one build frame. What must never
   * happen is a build frame id colliding with a component set id, because then
   * a single string means two different things depending on which field read it.
   */
  const componentSetIds = new Set(
    asArray(contract['componentSets'])
      .map((row) => field(row, 'id'))
      .filter((id): id is string => id !== null),
  );
  asArray(contract['componentSets']).forEach((row, index) => {
    const buildFrameId = field(row, 'buildFrameId');
    if (buildFrameId !== null && componentSetIds.has(buildFrameId)) {
      fail(
        'REP-16',
        'REP_BUILD_FRAME_ID_COLLIDES_WITH_SET_ID',
        `/componentSets/${index}/buildFrameId`,
        `${buildFrameId} is used both as a component set id and as a build frame reference`,
      );
    }
  });

  // REP-17 — an absence is stated, not left to be inferred.
  const declaredVariants = asArray(contract['propertySchemaVariants'])
    .map((row) => field(row, 'variantId'))
    .filter((id): id is string => id !== null);
  const covered = new Set<string>();
  for (const representation of asArray(contract['layoutRepresentations'])) {
    if (typeof representation !== 'object' || representation === null) continue;
    const appliesTo = (representation as Record<string, unknown>)['appliesTo'];
    if (typeof appliesTo !== 'object' || appliesTo === null) continue;
    for (const id of asArray((appliesTo as Record<string, unknown>)['schemaVariantIds'])) {
      if (typeof id === 'string') covered.add(id);
    }
  }
  const undocumented = new Set(
    asArray(contract['undocumentedSchemaVariantIds']).filter(
      (id): id is string => typeof id === 'string',
    ),
  );

  for (const variantId of declaredVariants) {
    if (!covered.has(variantId) && !undocumented.has(variantId)) {
      fail(
        'REP-17',
        'REP_UNCOVERED_VARIANT_NOT_DECLARED',
        '/undocumentedSchemaVariantIds',
        `${variantId} is covered by no layout representation and is not listed as undocumented — ` +
          'silence and "we looked and found nothing" must not read the same',
      );
    }
    if (covered.has(variantId) && undocumented.has(variantId)) {
      fail(
        'REP-17',
        'REP_VARIANT_BOTH_COVERED_AND_UNDOCUMENTED',
        '/undocumentedSchemaVariantIds',
        `${variantId} is listed as undocumented and is also covered by a layout representation`,
      );
    }
  }

  const declaredSet = new Set(declaredVariants);
  for (const variantId of undocumented) {
    if (!declaredSet.has(variantId)) {
      fail(
        'REP-17',
        'REP_UNDOCUMENTED_VARIANT_NOT_DECLARED',
        '/undocumentedSchemaVariantIds',
        `${variantId} is listed as undocumented but is not a declared schema variant`,
      );
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
