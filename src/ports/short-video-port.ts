/**
 * Short-video port surface (§14.3.14).
 *
 * Contract only. Short-video *processing* is explicitly out of scope (§7.2); what
 * Phase 1 fixes is that a video can only ever be referenced, never inlined —
 * it is the largest thing that could enter a payload, and no version of inlining
 * it stays bounded.
 */
export type { ShortVideoPort, ShortVideoRef } from '../contracts/observed-tree.ts';
export { hasInlinedVideoContent } from '../contracts/observed-tree.ts';
