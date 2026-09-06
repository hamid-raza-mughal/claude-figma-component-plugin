/**
 * B3 — structured target resolution.
 *
 * This module is the direct remedy for four verified research defects, and each
 * of them is a reference that a fully green suite could not see:
 *
 *   - **D-1** a rule naming three v0.3 vocabulary tokens absent from the v0.4
 *     schema, inside a sentence;
 *   - **D-2** a blocker asserting "no non-Button component has been analyzed"
 *     while the non-Button experiment was the reason the version existed;
 *   - **D-3** a matrix-cell rule whose target was `LR-1`, a `list`
 *     representation with no `allocation` key, while the matrix was `LR-2`;
 *   - **D-7** a blocker citing an allocation-evidence artifact not present on
 *     disk.
 *
 * D-3 is the one that shapes the design. Existence alone would have passed it:
 * `LR-1` exists. What was wrong was its **kind** — so a target may state the
 * strategy it requires, and resolution checks the resolved representation
 * against it. An existence-only resolver is a resolver that would still ship
 * D-3.
 *
 * The filesystem is reached through an injected `ArtifactReader` rather than
 * `node:fs`. That is not ceremony: an artifact target's whole point is that the
 * artifact may be missing, and a validator that can only be tested against the
 * real repository can only be tested for the missing case by deleting a file.
 * With a port, "the artifact is absent" and "the artifact is present but its
 * bytes differ from the pin" are both ordinary fixtures.
 */
import type { EnforcementOwner } from '../../contracts/failures.ts';
import type { RuleTarget, TargetKind } from '../contracts/representation-contract.ts';

/**
 * Reads a repository-relative path. Returns `null` when nothing is there —
 * absence is a result, never an exception, because absence is the case D-7 is.
 */
export type ArtifactReader = {
  readonly read: (relativePath: string) => { readonly sha256: string } | null;
};

export type ReferenceViolation = {
  /** The `REP-*` invariant this violates. */
  readonly rule_id: string;
  readonly code: string;
  /** JSON Pointer to the offending target. */
  readonly instance_path: string;
  readonly message: string;
  /** Typed as the owner vocabulary, not as this one literal: a violation whose
   *  `enforced_by` disagrees with its rule's declared owner is BP-6 broken, and a
   *  test reconciles the two per rule. */
  readonly enforced_by: EnforcementOwner;
};

export type ReferenceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly ReferenceViolation[] };

/** Anything with an id, addressed by one of the target kinds. */
type Collections = ReadonlyMap<TargetKind, ReadonlySet<string>>;

type LayoutStrategyById = ReadonlyMap<string, string>;

type ContractShape = {
  readonly contractId?: unknown;
  readonly componentSets?: unknown;
  readonly propertySchemaVariants?: unknown;
  readonly semanticFamilies?: unknown;
  readonly layoutRepresentations?: unknown;
  readonly representationNodeBindings?: unknown;
  readonly namingRules?: unknown;
  readonly correlatedAxisTuples?: unknown;
  readonly structuralFindings?: unknown;
  readonly ownerConfirmations?: unknown;
  readonly coveragePolicy?: unknown;
  readonly approvalStatus?: unknown;
  readonly knownLimitations?: unknown;
};

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function field(row: unknown, name: string): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const value = (row as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

function idsOf(rows: unknown, key: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const row of asArray(rows)) {
    const id = field(row, key);
    if (id !== null) out.add(id);
  }
  return out;
}

/**
 * Every node id the contract mentions as a locator.
 *
 * `layoutRepresentations[].evidenceNodeIds` is deliberately **not** a source
 * here. The schema says it is provenance only and never a runtime locator, and
 * accepting it would let a target resolve against a node the operational table
 * does not carry — which is the shape of a Builder acting on a node it cannot
 * actually address.
 */
function operationalNodeIds(contract: ContractShape): ReadonlySet<string> {
  const out = new Set<string>();
  for (const row of asArray(contract.representationNodeBindings)) {
    const container = field(row, 'containerNodeId');
    const root = field(row, 'rootNodeId');
    if (container !== null) out.add(container);
    if (root !== null) out.add(root);
  }
  return out;
}

function coverageMetricKeys(contract: ContractShape): ReadonlySet<string> {
  const out = new Set<string>();
  const policy = contract.coveragePolicy;
  if (typeof policy !== 'object' || policy === null) return out;
  for (const row of asArray((policy as Record<string, unknown>)['perComponentSetCoverage'])) {
    const id = field(row, 'componentSetId');
    if (id !== null) out.add(id);
  }
  return out;
}

function collectionsOf(contract: ContractShape): Collections {
  return new Map<TargetKind, ReadonlySet<string>>([
    ['component_set', idsOf(contract.componentSets, 'id')],
    ['schema_variant', idsOf(contract.propertySchemaVariants, 'variantId')],
    ['semantic_family', idsOf(contract.semanticFamilies, 'familyId')],
    ['layout_representation', idsOf(contract.layoutRepresentations, 'representationId')],
    ['representation_node_binding', operationalNodeIds(contract)],
    ['node', operationalNodeIds(contract)],
    ['naming_rule', idsOf(contract.namingRules, 'namingRuleId')],
    ['correlated_axis_tuple', idsOf(contract.correlatedAxisTuples, 'tupleId')],
    ['structural_finding', idsOf(contract.structuralFindings, 'findingId')],
    ['owner_confirmation', idsOf(contract.ownerConfirmations, 'confirmationId')],
    ['coverage_metric', coverageMetricKeys(contract)],
    // A *scope* may name the contract by its id — `properties.contractId` says
    // so explicitly. A *target* may not: the schema pins `targetRef` to the
    // literal `self` and REP-07's statement says the same. Two vocabularies,
    // separated, because accepting the id for a target let the resolver pass
    // something the schema and the registry both forbid — harmless only while
    // the schema stays stricter than the resolver.
    ['contract', new Set(['self'])],
  ]);
}

function layoutStrategies(contract: ContractShape): LayoutStrategyById {
  const out = new Map<string, string>();
  for (const row of asArray(contract.layoutRepresentations)) {
    const id = field(row, 'representationId');
    const strategy = field(row, 'strategy');
    if (id !== null && strategy !== null) out.set(id, strategy);
  }
  return out;
}

/**
 * Resolves a JSON Pointer (RFC 6901) against the contract.
 *
 * Returns `undefined` for anything that does not resolve, including a pointer
 * that runs off the end of an array — `/componentSets/9` on a one-element array
 * is exactly the silent-miss case a `contract_field` target exists to catch.
 */
function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === '') return document;
  if (!pointer.startsWith('/')) return undefined;
  let current: unknown = document;
  for (const rawSegment of pointer.slice(1).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      const index = Number(segment);
      if (index >= current.length) return undefined;
      current = current[index];
    } else if (typeof current === 'object' && current !== null) {
      if (!(segment in (current as Record<string, unknown>))) return undefined;
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

type TargetSite = {
  readonly target: RuleTarget;
  readonly instance_path: string;
};

/** Every place the schema requires a structured target. */
function targetSites(contract: ContractShape): readonly TargetSite[] {
  const sites: TargetSite[] = [];
  const push = (value: unknown, path: string): void => {
    if (typeof value === 'object' && value !== null) {
      sites.push({ target: value as RuleTarget, instance_path: path });
    }
  };
  asArray(contract.structuralFindings).forEach((row, i) => {
    if (typeof row === 'object' && row !== null) {
      push((row as Record<string, unknown>)['target'], `/structuralFindings/${i}/target`);
    }
  });
  const approval = contract.approvalStatus;
  if (typeof approval === 'object' && approval !== null) {
    asArray((approval as Record<string, unknown>)['blockers']).forEach((row, i) => {
      if (typeof row === 'object' && row !== null) {
        push(
          (row as Record<string, unknown>)['target'],
          `/approvalStatus/blockers/${i}/target`,
        );
      }
    });
  }
  asArray(contract.knownLimitations).forEach((row, i) => {
    if (typeof row === 'object' && row !== null) {
      push((row as Record<string, unknown>)['target'], `/knownLimitations/${i}/target`);
    }
  });
  return sites;
}

type ScopeSite = {
  readonly scopeType: string;
  readonly scopeRef: string;
  readonly instance_path: string;
};

function scopeSites(contract: ContractShape): readonly ScopeSite[] {
  const sites: ScopeSite[] = [];
  const push = (value: unknown, path: string): void => {
    const scopeType = field(value, 'scopeType');
    const scopeRef = field(value, 'scopeRef');
    if (scopeType !== null && scopeRef !== null) {
      sites.push({ scopeType, scopeRef, instance_path: path });
    }
  };
  asArray(contract.structuralFindings).forEach((row, i) => {
    if (typeof row !== 'object' || row === null) return;
    asArray((row as Record<string, unknown>)['appliesToScopes']).forEach((scope, j) => {
      push(scope, `/structuralFindings/${i}/appliesToScopes/${j}`);
    });
  });
  asArray(contract.namingRules).forEach((row, i) => {
    if (typeof row !== 'object' || row === null) return;
    push((row as Record<string, unknown>)['scope'], `/namingRules/${i}/scope`);
  });
  return sites;
}

/** `scopeType` names a collection under a different vocabulary than `targetKind`
 *  does, and the two must not be silently merged. This map is the whole of the
 *  translation, stated once. */
const SCOPE_TYPE_TO_TARGET_KIND: Readonly<Record<string, TargetKind>> = {
  node: 'node',
  component_set: 'component_set',
  schema_variant: 'schema_variant',
  semantic_family: 'semantic_family',
  layout_representation: 'layout_representation',
  contract: 'contract',
};

export type ResolveInput = {
  readonly contract: unknown;
  /** Omitted when no artifact target is expected. An artifact target with no
   *  reader is a violation, not a skip — see REP-13. */
  readonly artifacts?: ArtifactReader | undefined;
};

/**
 * Resolves every structured reference in a contract.
 *
 * Returns violations, never throws: a malformed contract is an input the caller
 * reports on, and a resolver that throws hides every violation after the first.
 */
export function resolveReferences(input: ResolveInput): ReferenceResult {
  const violations: ReferenceViolation[] = [];
  const contract = (
    typeof input.contract === 'object' && input.contract !== null ? input.contract : {}
  ) as ContractShape;
  const collections = collectionsOf(contract);
  const scopeCollections = new Map(collections);
  const contractId = typeof (contract as { contractId?: unknown }).contractId === 'string'
    ? ((contract as { contractId: string }).contractId)
    : '';
  if (contractId !== '') scopeCollections.set('contract', new Set(['self', contractId]));
  const strategies = layoutStrategies(contract);

  const fail = (
    rule_id: string,
    code: string,
    instance_path: string,
    message: string,
  ): void => {
    violations.push({ rule_id, code, instance_path, message, enforced_by: 'reference-validator' });
  };

  for (const site of targetSites(contract)) {
    const { targetKind, targetRef } = site.target;

    if (targetKind === 'contract_field') {
      if (resolvePointer(contract, targetRef) === undefined) {
        fail(
          'REP-14',
          'REP_CONTRACT_FIELD_POINTER_UNRESOLVED',
          site.instance_path,
          `JSON Pointer ${targetRef} resolves to nothing in this contract`,
        );
      }
      continue;
    }

    if (targetKind === 'artifact') {
      if (input.artifacts === undefined) {
        fail(
          'REP-13',
          'REP_ARTIFACT_TARGET_UNRESOLVABLE',
          site.instance_path,
          `${targetRef} is an artifact target and no artifact reader was supplied, so its ` +
            'existence was never checked',
        );
        continue;
      }
      const found = input.artifacts.read(targetRef);
      if (found === null) {
        fail(
          'REP-13',
          'REP_ARTIFACT_TARGET_MISSING',
          site.instance_path,
          `${targetRef} does not exist — this is D-7 exactly`,
        );
        continue;
      }
      if (
        site.target.requiredArtifactSha256 !== undefined &&
        found.sha256 !== site.target.requiredArtifactSha256
      ) {
        fail(
          'REP-13',
          'REP_ARTIFACT_TARGET_HASH_MISMATCH',
          site.instance_path,
          `${targetRef} exists but its bytes are not the bytes the claim was made over`,
        );
      }
      continue;
    }

    const members = collections.get(targetKind);
    if (members === undefined || !members.has(targetRef)) {
      fail(
        'REP-11',
        'REP_TARGET_UNRESOLVED',
        site.instance_path,
        `${targetRef} is not a member of ${targetKind}`,
      );
      continue;
    }

    if (site.target.requiredStrategy !== undefined) {
      const actual = strategies.get(targetRef);
      if (actual !== site.target.requiredStrategy) {
        fail(
          'REP-12',
          'REP_TARGET_STRATEGY_MISMATCH',
          site.instance_path,
          `${targetRef} exists but is strategy ${String(actual)}, not ` +
            `${site.target.requiredStrategy} — this is D-3 exactly`,
        );
      }
    }
  }

  for (const site of scopeSites(contract)) {
    const kind = SCOPE_TYPE_TO_TARGET_KIND[site.scopeType];
    if (kind === undefined) {
      fail(
        'REP-15',
        'REP_SCOPE_TYPE_UNKNOWN',
        site.instance_path,
        `${site.scopeType} names no collection`,
      );
      continue;
    }
    const members = scopeCollections.get(kind);
    if (members === undefined || !members.has(site.scopeRef)) {
      fail(
        'REP-15',
        'REP_SCOPE_REF_UNRESOLVED',
        site.instance_path,
        `${site.scopeRef} is not a member of ${site.scopeType}`,
      );
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
