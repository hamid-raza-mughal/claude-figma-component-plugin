/**
 * The promoted component representation contract — identity, version and the one
 * reference type the rest of the module resolves.
 *
 * Builder Phase 1 promotes the research package's v0.4 representation contract
 * into tracked production code (BP-1). Three things live here and nowhere else:
 *
 *   - the schema `$id`, pinned as a constant exactly as
 *     `src/coordinator/compose-trusted-output.ts:51–52` pins the Coordinator
 *     schemas, so an id typo is a compile-time change rather than a silent
 *     `getSchema(id)` miss;
 *   - the contract version, `0.4.1-draft` (BP-3) — not `0.4.0-draft`, whose bytes
 *     the frozen research package pins by checksum, and not any non-draft version,
 *     because the schema's own root `allOf` makes `^1\.0\.0$` *require*
 *     `readinessStatus: ready_for_production` and zero blockers, which would
 *     encode a false approval claim in the version string;
 *   - `RuleTarget`, the structured reference that replaces prose.
 *
 * `RuleTarget` is the whole point of the promotion. Four verified research
 * defects — D-1, D-2, D-3 and D-7 — were load-bearing references that lived only
 * inside sentences, and every one of them survived a fully green research suite:
 * a rule naming three retired vocabulary tokens, a blocker asserting a fact the
 * corpus contradicted, a matrix-cell rule pointing at a list representation, and
 * a blocker citing a file that does not exist. Nothing could see them because
 * nothing resolved them. Here the reference is typed, and the prose it used to
 * hide in is confined to a `narrative` object that no code path reads.
 */

/** BP-8. Client-neutral URN: the contract is reusable, so its identity must not
 *  name one client's domain. Ajv's `getSchema(id)` accepts any string, and JSON
 *  Schema `$id` need not be dereferenceable. */
export const REPRESENTATION_CONTRACT_SCHEMA_ID =
  'urn:component-representation:schema:representation-contract:0.4.1-draft';

/** BP-3. The version the schema is authored at. `parseSchemaIdVersion` proves the
 *  `$id` and this constant agree — the D-12 discipline, applied before the
 *  duplication exists rather than after. */
export const REPRESENTATION_CONTRACT_VERSION = '0.4.1-draft';

/** Repository-relative location of the schema document. */
export const REPRESENTATION_CONTRACT_SCHEMA_PATH =
  'schemas/representation/representation-contract.schema.json';

/**
 * The collection a `targetRef` resolves against.
 *
 * Closed by construction: an open target kind would let a reference name a
 * collection no resolver knows about, which is prose again with extra steps.
 */
export const TARGET_KINDS = [
  'node',
  'component_set',
  'schema_variant',
  'semantic_family',
  'layout_representation',
  'representation_node_binding',
  'naming_rule',
  'correlated_axis_tuple',
  'structural_finding',
  'owner_confirmation',
  'coverage_metric',
  'artifact',
  'contract_field',
  'contract',
] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];

/** Layout strategies a representation may declare (C-1). */
export const LAYOUT_STRATEGIES = ['matrix', 'list', 'scenario_gallery'] as const;

export type LayoutStrategy = (typeof LAYOUT_STRATEGIES)[number];

/**
 * The single normative reference carried by a rule, blocker, finding or known
 * limitation.
 *
 * `requiredStrategy` exists for D-3 alone: a rule that guards matrix cells must
 * be able to say so, so that a target resolving to a `list` representation is a
 * validation failure rather than a Builder acting on the wrong representation.
 */
export type RuleTarget = {
  readonly targetKind: TargetKind;
  /** An identifier, a JSON Pointer (`contract_field`), a repository-relative path
   *  (`artifact`) or the literal `self` (`contract`). Never a sentence. */
  readonly targetRef: string;
  /** Kind-compatibility, permitted only on a `layout_representation` target. */
  readonly requiredStrategy?: LayoutStrategy | undefined;
  /** Content pin, required on — and permitted only on — an `artifact` target. */
  readonly requiredArtifactSha256?: string | undefined;
};

/**
 * Extracts the version segment of a representation-contract URN.
 *
 * Returns `null` for anything that is not one, so a caller cannot mistake a
 * parse failure for a version. The URN's last colon-separated field is the
 * version, which is why the id is built that way.
 */
export function parseSchemaIdVersion(schemaId: string): string | null {
  const prefix = 'urn:component-representation:schema:representation-contract:';
  if (!schemaId.startsWith(prefix)) return null;
  const version = schemaId.slice(prefix.length);
  return version.length > 0 && !version.includes(':') ? version : null;
}
