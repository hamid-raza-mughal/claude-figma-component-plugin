/**
 * `listByCategory` — the capped escape hatch (§13.4.4).
 *
 * **Not a Coordinator tool.** Controller-executed, capped, logged, and it runs
 * only when the deterministic planner could not form a safe narrow query. It
 * always reports `broadened_from`, so relaxed retrieval is visible in the run
 * record rather than inferred later from a suspiciously wide candidate set.
 *
 * The ownership rule is enforced by requiring an explicit caller identity rather
 * than by documentation, because "don't call this from the Coordinator" is not a
 * constraint a comment can hold.
 */
import type { IndexReader } from './index-reader.ts';
import type { ResolverCandidate } from '../contracts/resolution.ts';
import { confidenceFromScore } from './candidate-ranking.ts';

/** Hard cap. Broadening exists to unblock a run, not to dump the index into
 *  context — an uncapped listing would reintroduce exactly the payload the
 *  architecture removed. */
export const LIST_BY_CATEGORY_CAP = 25;

export const CALLER_CONTROLLER = 'controller' as const;

export type ListByCategoryCaller = typeof CALLER_CONTROLLER;

export class ListByCategoryOwnershipError extends Error {
  override readonly name = 'ListByCategoryOwnershipError';
  readonly code = 'LIST_BY_CATEGORY_FORBIDDEN_CALLER';
}

export type ListByCategoryRequest = {
  /** Must be `'controller'`. Any other value is refused. */
  readonly caller: string;
  readonly property_category: string;
  /** What the narrow query was, so the broadening is attributable. */
  readonly broadened_from: string;
  readonly cap?: number | undefined;
};

export type ListByCategoryResult = {
  readonly property_category: string;
  readonly candidates: readonly ResolverCandidate[];
  /** Always present — this operation is a broadening by definition. */
  readonly broadened_from: string;
  readonly cap_applied: number;
  readonly truncated: boolean;
  readonly total_in_category: number;
  /** Audit record. This operation is required to be logged (§13.4.4). */
  readonly log_entry: string;
};

export function listByCategory(reader: IndexReader, request: ListByCategoryRequest): ListByCategoryResult {
  if (request.caller !== CALLER_CONTROLLER) {
    throw new ListByCategoryOwnershipError(
      `listByCategory is controller-owned; refused for caller "${request.caller}". ` +
        'It is not a Coordinator tool (§13.4.4).',
    );
  }

  const cap = Math.min(request.cap ?? LIST_BY_CATEGORY_CAP, LIST_BY_CATEGORY_CAP);
  const totals = reader.countByCategory();
  const total = totals[request.property_category] ?? 0;
  // Fetch one extra to detect truncation without a second count query.
  const rows = reader.listByCategoryRows(request.property_category, cap + 1);
  const truncated = rows.length > cap;
  const kept = rows.slice(0, cap);

  const candidates: ResolverCandidate[] = kept.map((row) => ({
    candidate_id: row.candidate_id,
    source_record_ref: row.source_record_ref,
    source_sha256: reader.meta.source_sha256,
    index_version: reader.meta.index_version,
    ref_class: row.ref_class,
    property_category: row.property_category,
    path: row.path,
    key: row.key,
    ...(row.normalized_id === '' ? {} : { normalized_id: row.normalized_id }),
    ...(row.modes.length === 1 && row.modes[0] !== undefined ? { mode: row.modes[0] } : {}),
    ...(row.value_num === undefined ? {} : { value_preview: row.value_num }),
    // Every candidate from a broadened listing is `low`: it arrived because the
    // narrow query failed, so nothing here has been ranked against intent.
    confidence: confidenceFromScore(0, undefined),
    ranking_reasons: ['broadened-retrieval'],
  }));

  return {
    property_category: request.property_category,
    candidates,
    broadened_from: request.broadened_from,
    cap_applied: cap,
    truncated,
    total_in_category: total,
    log_entry:
      `listByCategory(category=${request.property_category}) by ${request.caller}: ` +
      `returned ${candidates.length} of ${total}${truncated ? ' (truncated)' : ''}, ` +
      `broadened_from=${request.broadened_from}`,
  };
}
