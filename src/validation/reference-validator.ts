/**
 * Reference validators (§16.2) — identity and source integrity.
 *
 * These are the checks that make the never-hallucinate rule executable. The v1
 * design stated it in prose and a real key paired with a fabricated path passed
 * three separate reviews, because none of them ran.
 *
 * The read surface is deliberately narrow. `ResolutionLookupPort` declares only the
 * lookups these validators need — there is no write method to omit, because none is
 * declared, and a port that *could* write would be one refactor from being wired up
 * (§16.3 Gate 5: "no write-capable port is injectable into Coordinator core").
 */
import { assertIdentityConsistent, assertIdentityFresh, IdentityError } from '../contracts/identity.ts';
import { INVARIANTS_BY_ID } from './invariant-registry.ts';
import type { CandidateIdentity, RefClass } from '../contracts/identity.ts';
import type { TypedResolution } from '../contracts/resolution.ts';
import type { FailureEvidence } from '../contracts/failures.ts';

/**
 * The only capability the validators and composer require of the index.
 *
 * Read-only by construction. Structurally narrower than `IndexReader`, so a
 * caller cannot hand the composer something that can mutate anything.
 */
export type ResolutionLookupPort = {
  readonly snapshot: { readonly source_sha256: string; readonly index_version: string };
  readonly lookupByCandidateId: (candidateId: string) => LookedUpRecord | undefined;
};

export type LookedUpRecord = {
  readonly candidate_id: string;
  readonly source_record_ref: string;
  readonly ref_class: RefClass;
  readonly path: string;
  readonly key: string;
  readonly normalized_id: string;
  readonly raw_id: string;
  readonly property_category: string;
  readonly value_num?: number | undefined;
  readonly modes: readonly string[];
};

export type Finding = FailureEvidence;

function finding(invariantId: string, message: string, instancePath?: string): Finding {
  const invariant = INVARIANTS_BY_ID.get(invariantId);
  if (invariant === undefined) throw new Error(`unknown invariant id: ${invariantId}`);
  return {
    code: invariant.error_code,
    message,
    enforced_by: 'reference-validator',
    contract_path: `#/invariants/${invariantId}`,
    ...(instancePath === undefined ? {} : { instance_path: instancePath }),
  };
}

/** Every selected id must exist in the index. A fabricated id resolves to nothing —
 *  which is the point of deriving ids from the source hash. */
export function validateSelectionsExist(
  selectedIds: readonly string[],
  port: ResolutionLookupPort,
): readonly Finding[] {
  return selectedIds
    .filter((id) => port.lookupByCandidateId(id) === undefined)
    .map((id) =>
      finding(
        'INV-05',
        `selected candidate_id "${id}" matches no indexed record — fabricated, or selected against a different snapshot`,
        '/selected_candidate_id',
      ),
    );
}

/**
 * A duplicated selection across the whole draft.
 *
 * Usually means two semantic elements were collapsed. Deduplicating silently would
 * hide that, so it is reported.
 */
export function validateNoDuplicateSelections(selectedIds: readonly string[]): readonly Finding[] {
  const counts = new Map<string, number>();
  for (const id of selectedIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) =>
      finding(
        'INV-05',
        `candidate_id "${id}" was selected ${count} times; two semantic elements may have been collapsed`,
        '/selected_candidate_id',
      ),
    );
}

/** Source hash and index version must match the current snapshot (§16.1 step 4). */
export function validateSnapshotFreshness(
  identities: readonly CandidateIdentity[],
  port: ResolutionLookupPort,
): readonly Finding[] {
  const findings: Finding[] = [];
  for (const identity of identities) {
    try {
      assertIdentityFresh(identity, port.snapshot);
    } catch (error: unknown) {
      if (error instanceof IdentityError) {
        findings.push(finding('INV-05', error.message, `/resolutions/${identity.candidate_id}`));
        continue;
      }
      throw error;
    }
  }
  return findings;
}

/** An identity whose id does not derive from its own ref has been edited. */
export function validateIdentityConsistency(
  identities: readonly CandidateIdentity[],
): readonly Finding[] {
  const findings: Finding[] = [];
  for (const identity of identities) {
    try {
      assertIdentityConsistent(identity);
    } catch (error: unknown) {
      if (error instanceof IdentityError) {
        findings.push(finding('INV-05', error.message, `/resolutions/${identity.candidate_id}`));
        continue;
      }
      throw error;
    }
  }
  return findings;
}

/**
 * Every field of a composed resolution must match the indexed record.
 *
 * This is the check that catches **defect #1** — `stroke/base` attached to a real
 * key. The path, key, ids, class and value are compared against what the index
 * actually holds, so a fabricated label cannot survive composition even if it
 * arrived attached to a genuine candidate.
 */
export function validateResolutionFidelity(
  resolutions: readonly TypedResolution[],
  port: ResolutionLookupPort,
): readonly Finding[] {
  const findings: Finding[] = [];
  for (const resolution of resolutions) {
    const record = port.lookupByCandidateId(resolution.candidate_id);
    if (record === undefined) {
      findings.push(
        finding(
          'INV-05',
          `resolution references candidate_id "${resolution.candidate_id}", which matches no indexed record`,
          `/resolutions/${resolution.candidate_id}`,
        ),
      );
      continue;
    }
    const comparisons: readonly (readonly [string, unknown, unknown])[] = [
      ['path', resolution.path, record.path],
      ['key', resolution.key, record.key],
      ['normalized_id', resolution.normalized_id, record.normalized_id],
      ['raw_id', resolution.raw_id, record.raw_id],
      ['ref_class', resolution.ref_class, record.ref_class],
      ['source_record_ref', resolution.source_record_ref, record.source_record_ref],
      ['property_category', resolution.property_category, record.property_category],
    ];
    for (const [field, composed, actual] of comparisons) {
      if (String(composed) !== String(actual)) {
        findings.push(
          finding(
            'INV-05',
            `resolution ${field} is "${String(composed)}" but the indexed record holds "${String(actual)}"`,
            `/resolutions/${resolution.candidate_id}/${field}`,
          ),
        );
      }
    }
    if (resolution.ref_class === 'variable' && record.value_num !== undefined) {
      if (typeof resolution.value === 'number' && resolution.value !== record.value_num) {
        findings.push(
          finding(
            'INV-05',
            `resolution value is ${resolution.value} but the indexed record holds ${record.value_num}`,
            `/resolutions/${resolution.candidate_id}/value`,
          ),
        );
      }
    }
    const mode = 'mode' in resolution ? resolution.mode : undefined;
    if (mode !== undefined && record.modes.length > 0 && !record.modes.includes(mode)) {
      findings.push(
        finding(
          'INV-05',
          `resolution claims mode "${mode}" but the record publishes ${record.modes.join(', ')}`,
          `/resolutions/${resolution.candidate_id}/mode`,
        ),
      );
    }
  }
  return findings;
}

/**
 * INV-06: no resolution may carry a Figma API instruction.
 *
 * Checked at runtime as well as in the schema, because a resolution can be
 * constructed in code without passing through the schema, and the prohibition is
 * about authority rather than shape.
 */
export function validateNoBindingCall(resolutions: readonly TypedResolution[]): readonly Finding[] {
  const forbidden = /binding_call|bindingCall|setBoundVariable|applyStyleId|createFrame/;
  return resolutions
    .filter((resolution) => forbidden.test(JSON.stringify(resolution)))
    .map((resolution) =>
      finding(
        'INV-06',
        `resolution for "${resolution.path}" carries a Figma API instruction; ref_class is the contract and the call is Builder's`,
        `/resolutions/${resolution.candidate_id}`,
      ),
    );
}

/**
 * Two resolutions cannot bind the same property of the same element to different
 * records — a collision that would make the built result depend on ordering.
 */
export function validateNoCrossRecordCollision(
  bindings: readonly { readonly semantic_id: string; readonly property: string; readonly candidate_id: string }[],
): readonly Finding[] {
  const byKey = new Map<string, Set<string>>();
  for (const binding of bindings) {
    const key = `${binding.semantic_id}::${binding.property}`;
    const set = byKey.get(key) ?? new Set<string>();
    set.add(binding.candidate_id);
    byKey.set(key, set);
  }
  return [...byKey.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([key, ids]) =>
      finding(
        'INV-05',
        `${key} is bound to ${ids.size} different records (${[...ids].join(', ')}); the built result would depend on ordering`,
        `/bindings/${key}`,
      ),
    );
}

export type ReferenceValidationInput = {
  readonly selectedIds: readonly string[];
  readonly resolutions: readonly TypedResolution[];
  readonly bindings?: readonly {
    readonly semantic_id: string;
    readonly property: string;
    readonly candidate_id: string;
  }[];
  readonly port: ResolutionLookupPort;
};

export function validateReferences(input: ReferenceValidationInput): readonly Finding[] {
  return [
    ...validateSelectionsExist(input.selectedIds, input.port),
    ...validateNoDuplicateSelections(input.selectedIds),
    ...validateSnapshotFreshness(input.resolutions, input.port),
    ...validateIdentityConsistency(input.resolutions),
    ...validateResolutionFidelity(input.resolutions, input.port),
    ...validateNoBindingCall(input.resolutions),
    ...validateNoCrossRecordCollision(input.bindings ?? []),
  ];
}
