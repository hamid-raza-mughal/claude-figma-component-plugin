/**
 * The §16.1 sequence, and where each step is implemented.
 *
 * P1-FINAL §16.1 specifies **eleven** steps. `composeTrustedOutput` implements
 * **ten** of them; the eleventh — "render approval and machine views from that
 * same object" — is deliberately *not* inside the composer:
 *
 *   - the composer stays pure and I/O-free, so it is testable without renderers;
 *   - the two renderings stay independently authored, each binding
 *     `source_object_sha256`, which is the mechanism that makes "the human
 *     approved the object the machine received" checkable rather than asserted.
 *     Folding rendering into composition would give a divergence somewhere to
 *     live.
 *
 * Both facts were true in the code and wrong in the prose: the composer's own
 * docstring, the blueprint diagram and a `describe()` block all called the
 * ten-step registry "the 11-step sequence". This module removes the discrepancy
 * by making the split executable instead of narrated — `SPEC_16_1_SEQUENCE` is
 * the eleven, `COMPOSITION_STEPS` is the ten, and a test asserts the first ten
 * are identical and that step 11 is the one the renderers own.
 */
import { COMPOSITION_STEPS } from './compose-trusted-output.ts';

/** Step 11. Owned by `src/rendering/`, not by the composer. */
export const RENDERING_STEP = '11-render-approval-and-machine-views' as const;

/**
 * The full specified sequence: the ten composition steps in order, then rendering.
 *
 * Derived from `COMPOSITION_STEPS` rather than retyped, so the two can never
 * drift apart in the direction that caused this defect.
 */
export const SPEC_16_1_SEQUENCE = [...COMPOSITION_STEPS, RENDERING_STEP] as const;

export type Spec16_1Step = (typeof SPEC_16_1_SEQUENCE)[number];

/** Which module is answerable for each step — so "who implements step 7" has an answer. */
export const STEP_OWNERSHIP = {
  composer: COMPOSITION_STEPS,
  renderers: [RENDERING_STEP],
} as const;
