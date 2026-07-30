/**
 * `verifyBatch` — bounded read-only verification (§13.4.3).
 *
 * Returns **evidence, not alternative semantic decisions.** That boundary is the
 * point: Synthesizer may ask "is this what the source says?" and receive an
 * answer, but it may not receive a suggestion. Letting a verification tool propose
 * a replacement would quietly relocate semantic authority out of the Coordinator
 * and past the human gate.
 */
import type { IndexReader } from './index-reader.ts';
import type { RefClass } from '../contracts/identity.ts';

export type VerificationRequest = {
  readonly request_id: string;
  /** Verify by opaque id, or by class plus path when checking a claim made
   *  elsewhere (a finding locator, a built node's bound key). */
  readonly candidate_id?: string | undefined;
  readonly ref_class?: RefClass | undefined;
  readonly path?: string | undefined;
  /** Assertions to check. Each supplied field produces a verdict. */
  readonly expect?:
    | {
        readonly key?: string | undefined;
        readonly normalized_id?: string | undefined;
        readonly value?: number | undefined;
        readonly mode?: string | undefined;
      }
    | undefined;
};

export type VerificationVerdict = 'confirmed' | 'contradicted' | 'not-found' | 'unverifiable';

export type FieldVerdict = {
  readonly field: string;
  readonly verdict: 'confirmed' | 'contradicted' | 'unverifiable';
  readonly expected: string;
  readonly actual: string;
};

export type VerificationEvidence = {
  readonly request_id: string;
  readonly verdict: VerificationVerdict;
  readonly source_record_ref?: string | undefined;
  readonly path?: string | undefined;
  readonly ref_class?: RefClass | undefined;
  readonly fields: readonly FieldVerdict[];
  /** Snapshot the verification was performed against. Present on every result so
   *  evidence can never be quoted without its provenance. */
  readonly source_sha256: string;
  readonly index_version: string;
};

export function verifyBatch(
  reader: IndexReader,
  requests: readonly VerificationRequest[],
): readonly VerificationEvidence[] {
  const snapshot = {
    source_sha256: reader.meta.source_sha256,
    index_version: reader.meta.index_version,
  };

  return requests.map((request): VerificationEvidence => {
    const row =
      request.candidate_id !== undefined
        ? reader.findByCandidateId(request.candidate_id)
        : request.ref_class !== undefined && request.path !== undefined
          ? reader.findByPath(request.ref_class, request.path)
          : undefined;

    if (row === undefined) {
      return {
        request_id: request.request_id,
        verdict:
          request.candidate_id === undefined && (request.ref_class === undefined || request.path === undefined)
            ? 'unverifiable'
            : 'not-found',
        fields: [],
        ...snapshot,
      };
    }

    const fields: FieldVerdict[] = [];
    const expect = request.expect;
    if (expect !== undefined) {
      if (expect.key !== undefined) {
        fields.push(compare('key', expect.key, row.key));
      }
      if (expect.normalized_id !== undefined) {
        fields.push(compare('normalized_id', expect.normalized_id, row.normalized_id));
      }
      if (expect.value !== undefined) {
        fields.push(
          row.value_num === undefined
            ? {
                field: 'value',
                verdict: 'unverifiable',
                expected: String(expect.value),
                actual: '(no numeric value indexed)',
              }
            : compare('value', String(expect.value), String(row.value_num)),
        );
      }
      if (expect.mode !== undefined) {
        fields.push(
          row.modes.length === 0
            ? {
                field: 'mode',
                verdict: 'unverifiable',
                expected: expect.mode,
                actual: '(record publishes no modes)',
              }
            : {
                field: 'mode',
                verdict: row.modes.includes(expect.mode) ? 'confirmed' : 'contradicted',
                expected: expect.mode,
                actual: row.modes.join(','),
              },
        );
      }
    }

    // Any contradiction dominates. A partly-confirmed claim is a contradicted
    // claim: reporting it as confirmed-with-caveats is how a wrong resolution
    // survives a review.
    const verdict: VerificationVerdict = fields.some((field) => field.verdict === 'contradicted')
      ? 'contradicted'
      : 'confirmed';

    return {
      request_id: request.request_id,
      verdict,
      source_record_ref: row.source_record_ref,
      path: row.path,
      ref_class: row.ref_class,
      fields,
      ...snapshot,
    };
  });
}

function compare(field: string, expected: string, actual: string): FieldVerdict {
  return {
    field,
    verdict: expected === actual ? 'confirmed' : 'contradicted',
    expected,
    actual,
  };
}
