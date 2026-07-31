/**
 * The machine handoff (§16.3).
 *
 * Rendered from the **same validated object** as the approval view, and binding the
 * same `source_object_sha256`. That shared hash is the mechanism: it makes "the
 * recorded response refers to the exact artifact the next stage receives" a
 * checkable claim — **not** a claim of verified human authorization. In Phase 2
 * every response is model-relayed and unverified (§7.4); this renderer must never
 * describe one otherwise.
 *
 * This renderer deliberately does almost nothing. It selects, orders and stamps —
 * it does not summarise, reformat or enrich. Any transformation here would be a
 * place where the two views could diverge, and the whole point of one trusted object
 * is that there is nowhere for a divergence to live.
 */
import { hashOutput } from '../coordinator/compose-trusted-output.ts';
import { isReady } from '../contracts/coordinator-output.ts';
import type { CoordinatorOutput } from '../contracts/coordinator-output.ts';
import type { ApprovalRecord } from '../contracts/run-envelope.ts';

export type MachineHandoff = {
  /** Identical to the approval view's, by construction. */
  readonly source_object_sha256: string;
  readonly handoff_version: '1.0.0';
  /** The next stage, or null. Copied from the output — never recomputed, because a
   *  second derivation is a second chance to disagree. */
  readonly next_stage: 'builder' | 'synthesizer' | null;
  readonly run_id: string;
  readonly run_type: string;
  readonly status: string;
  /** The validated object, verbatim. */
  readonly payload: CoordinatorOutput;
  /** Present only when a response has been recorded — model-relayed and unverified
   *  in Phase 2 (§7.4), never verified human authorization. Absent means no
   *  response recorded, which is distinguishable from approved-with-no-record. */
  readonly approval?: ApprovalRecord | undefined;
  /** Preconditions the receiving stage must check before acting. Explicit, so a
   *  downstream stage cannot claim it did not know. */
  readonly receiver_preconditions: readonly string[];
};

export function renderMachineHandoff(
  output: CoordinatorOutput,
  approval?: ApprovalRecord,
): MachineHandoff {
  const sha = hashOutput(output);
  const preconditions: string[] = [
    `Verify the design-system snapshot is still ${output.snapshot.source_sha256.slice(0, 12)}… before acting.`,
    'Treat every resolution as verified against that snapshot and re-verify none of it by guesswork.',
  ];

  if (isReady(output)) {
    if (output.run_type === 'audit') {
      preconditions.push('This is an audit. Produce findings; do not build, and do not propose fixes.');
      preconditions.push(
        `Coverage is ${output.extraction_coverage.examined_nodes}/${output.extraction_coverage.total_nodes} nodes; ` +
          'excluded regions are listed and must not be reported as clean.',
      );
    } else {
      preconditions.push('Build into a sandbox target only. No production write is authorised by this handoff.');
      preconditions.push(
        'Implementation-supporting frames and wrappers are permitted when declared and justified; ' +
          'undeclared or unrelated nodes fail validation.',
      );
      preconditions.push('Return a nodeMap from semantic_id to created node id.');
    }
    if (output.run_type === 'modify') {
      preconditions.push(
        `Honour all ${output.preservation_contract.obligations.length} preservation obligations; each names how it is verified.`,
      );
    }
  } else {
    preconditions.push('This run produced no forward work. Do not act on it.');
  }

  if (approval === undefined) {
    preconditions.push(
      'NO RECORDED RESPONSE. A response binding this exact sha256 is required before any write, ' +
        'and even a recorded one is model-relayed and unverified — not human authorization (§7.4, §7.6.1).',
    );
  } else if (approval.approved_artifact_sha256 !== sha) {
    // Surfaced rather than thrown: the receiving stage must be able to see that the
    // approval refers to a different artifact than the one it was handed.
    preconditions.push(
      `APPROVAL MISMATCH. The approval binds ${approval.approved_artifact_sha256.slice(0, 12)}… ` +
        `but this artifact is ${sha.slice(0, 12)}…. Do not act.`,
    );
  } else if (approval.gate_mode === 'observe-only-validation') {
    preconditions.push(
      'Approval gate_mode is observe-only-validation: it authorises no write. Phase 1 has no write plane.',
    );
  }

  if (approval !== undefined && !approval.verified && !approval.authorizing) {
    preconditions.push(
      `Recorded response source: ${approval.response_source}. This is unverified and non-authorizing — ` +
        'it is not evidence of human authorization (§7.4).',
    );
  }

  return {
    source_object_sha256: sha,
    handoff_version: '1.0.0',
    next_stage: output.next_route,
    run_id: output.run_id,
    run_type: output.run_type,
    status: output.status,
    payload: output,
    ...(approval === undefined ? {} : { approval }),
    receiver_preconditions: preconditions,
  };
}

/**
 * Proves both renderings came from one object.
 *
 * Used by tests and by the Run Guard (§9.2, G-10) before `closeRun completed`. The
 * check is trivial by design — the value is that it exists at all, so a future
 * "small improvement" to one renderer fails loudly instead of silently.
 */
export function renderingsAgree(
  approvalSha: string,
  handoffSha: string,
  output: CoordinatorOutput,
): boolean {
  const expected = hashOutput(output);
  return approvalSha === expected && handoffSha === expected;
}
