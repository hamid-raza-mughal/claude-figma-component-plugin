/**
 * Static payload metrics — measured, never estimated (§11.6).
 *
 * Byte counts only. A token count needs the model's tokenizer, which arrives with
 * the Phase 2 adapter; anything divided by "≈3.5 chars per token" is an estimate and
 * is labelled as one wherever it appears.
 */
import type { AssembledModelInput } from '../coordinator/assemble-model-input.ts';
import type { PayloadSectionContribution } from './telemetry-types.ts';

export type StaticPayloadMetrics = {
  readonly total_bytes: number;
  readonly section_contribution: readonly PayloadSectionContribution[];
  /** Bytes of raw curated source in the payload. **Must be zero** (§18). */
  readonly raw_source_bytes: 0;
  readonly largest_section: string;
  /** Share held by the always-loaded core — the figure that matters for any later
   *  caching decision, since it is the part that repeats across runs. */
  readonly core_share: number;
};

export function measurePayload(assembled: AssembledModelInput): StaticPayloadMetrics {
  const sorted = [...assembled.section_contribution].sort((a, b) => b.bytes - a.bytes);
  const core = assembled.section_contribution.find((section) => section.name === 'core');
  return {
    total_bytes: assembled.total_bytes,
    section_contribution: assembled.section_contribution,
    raw_source_bytes: 0,
    largest_section: sorted[0]?.name ?? 'none',
    core_share: core?.share ?? 0,
  };
}

/**
 * Compares a payload against the source it deliberately excludes.
 *
 * Reported as a ratio of bytes, not of tokens, and never described as a saving —
 * the source was never *in* the payload, so nothing was reduced. It was designed out.
 */
export function payloadVersusSource(
  assembled: AssembledModelInput,
  sourceBytes: number,
): { readonly payload_bytes: number; readonly source_bytes: number; readonly ratio: number } {
  return {
    payload_bytes: assembled.total_bytes,
    source_bytes: sourceBytes,
    ratio: sourceBytes === 0 ? 0 : Number((assembled.total_bytes / sourceBytes).toFixed(5)),
  };
}
