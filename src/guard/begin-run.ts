/**
 * `beginRun` (§13, §10 row 1) — the Guard's derivation, not the store write.
 * Persisting the resulting `run` row is WP3/WP5's concern; this module is the
 * pure decision: which `run_type`, which provenance, which minted identifiers,
 * and whether the call is refused at all (G-2, G-3a, G-3b).
 *
 * G-15 is enforced structurally, by `BeginRunInput`'s shape: it has no
 * `run_id`, `display_id`, `route_provenance`, `route_verified` or `run_type`
 * field to supply. There is nothing for a runtime check to catch that the type
 * doesn't already exclude.
 */
import { randomUUID } from 'node:crypto';
import { GuardRefusal } from './errors.ts';
import { mintDisplayId } from './display-id.ts';
import { deriveRouteProvenance, type HostCommandMetadata, type DerivedProvenance } from './provenance.ts';
import { deriveRunTypeFromOperationId, OperationMappingError } from '../registry/operations.ts';
import type { RunType } from '../contracts/invocation.ts';
import type { ObservedComponentTreeRef } from '../contracts/invocation.ts';

export type BeginRunInput = {
  readonly operation_id: string;
  readonly user_intent: string;
  readonly target?: ObservedComponentTreeRef | undefined;
};

export type BeginRunDerived = DerivedProvenance & {
  readonly run_id: string;
  readonly display_id: string;
  readonly run_type: RunType;
  readonly phase: 'received';
};

/**
 * §2.4: `modify` and `audit` require a target **and** are unavailable pending
 * FD-1…FD-4 — the Figma read-plane connector, which nothing in this
 * repository implements (`src/ports/`, `src/contracts/observed-tree.ts`:
 * "interfaces and synthetic fixtures only... no token, no credential, no
 * write method exists"). G-3a therefore refuses both route types
 * unconditionally today, naming the unmet dependency, not merely a missing
 * target. Only `new` can ever succeed until a read-plane adapter exists.
 */
const CAPABILITY_GATED_RUN_TYPES: readonly RunType[] = ['modify', 'audit'];

export function deriveBeginRun(
  input: BeginRunInput,
  hostCommandMetadata?: HostCommandMetadata,
): BeginRunDerived {
  let runType: RunType;
  try {
    runType = deriveRunTypeFromOperationId(input.operation_id);
  } catch (error) {
    if (error instanceof OperationMappingError) {
      throw new GuardRefusal('G-2', error.message);
    }
    throw error;
  }

  if (CAPABILITY_GATED_RUN_TYPES.includes(runType)) {
    throw new GuardRefusal(
      'G-3a',
      `run_type "${runType}" is capability-gated: FD-1…FD-4 (the Figma read-plane ` +
        'connector) are unmet — no implementation exists (§2.4).',
    );
  }

  if (runType === 'new' && input.target !== undefined) {
    throw new GuardRefusal('G-3b', 'run_type "new" must not carry a target (§2.4).');
  }

  const runId = randomUUID();
  return {
    run_id: runId,
    display_id: mintDisplayId(runType, runId),
    run_type: runType,
    phase: 'received',
    ...deriveRouteProvenance(hostCommandMetadata),
  };
}
