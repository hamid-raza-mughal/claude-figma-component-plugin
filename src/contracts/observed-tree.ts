/**
 * Observed-tree and read-plane contracts (§14.4, §5.4).
 *
 * **Interfaces and synthetic fixtures only.** Phase 1 defines the shape of the
 * Figma read plane and implements none of it: no token, no credential, no write
 * method exists anywhere in this repository.
 *
 * The rules these types enforce:
 *   - the **full tree is preserved externally and is immutable by hash**;
 *   - models receive only **bounded, provenance-linked excerpts**;
 *   - **every excluded region is recorded** in `ExtractionCoverage`, or audit
 *     coverage is unfalsifiable (`SA-8`);
 *   - Coordinator **never calls the read port** — a future Controller supplies the
 *     reference and the excerpts.
 *
 * The excerpt-selection *policy* is deliberately not tuned here. It is gated on
 * measuring one real observed tree, and designing it around synthetic data would
 * bake in a guess (`SA-8`). What Phase 1 fixes is that exclusions are visible.
 */

/**
 * A bounded slice of an observed tree, with provenance.
 *
 * `locator` and `tree_sha256` together mean an excerpt can always be traced back
 * to a specific region of a specific capture. An excerpt without provenance is
 * indistinguishable from an assertion.
 */
export type ObservedTreeExcerpt = {
  readonly excerpt_id: string;
  /** Path or node-id locator into the full tree. */
  readonly locator: string;
  /** Hash of the tree this was cut from, so drift is detectable. */
  readonly tree_sha256: string;
  readonly node_count: number;
  /** Structural summary only. Never raw Figma node payloads. */
  readonly content: string;
  /** Why this region was selected — makes the policy reviewable rather than
   *  opaque once a real tree is measured. */
  readonly selection_reason: string;
};

/**
 * The four named Figma dependencies (v3 §10).
 *
 * `FD-1` and `FD-2` are **contract-bearing**: falsifying either is an architecture
 * amendment, not an adapter fix. Naming them is what makes "revise only the
 * adapter" a claim with a falsifier attached rather than a hope.
 */
export const FIGMA_DEPENDENCIES = {
  'FD-1': {
    claim: 'Node identifiers are stable between the build call and the re-derivation call',
    bearing: 'contract',
    breaks: 'nodeMap, post-build validation, and every finding locator',
  },
  'FD-2': {
    claim: 'The connector exposes bound style and variable keys, not only computed values',
    bearing: 'contract',
    breaks: "token-fidelity grading against the pinned snapshot; the audit route's premise",
  },
  'FD-3': {
    claim: "A component's full subtree is retrievable in a bounded number of calls",
    bearing: 'adapter',
    breaks: 'the excerpt selector becomes mandatory rather than an optimisation',
  },
  'FD-4': {
    claim: 'Per-run target fetch is within auth and rate limits',
    bearing: 'adapter',
    breaks: 'fetch strategy and caching',
  },
} as const;

export type FigmaDependencyId = keyof typeof FIGMA_DEPENDENCIES;

/**
 * Read-only port for observed trees.
 *
 * Read-only by construction: there is no write method to omit, because none is
 * declared. A port that could write would be one refactor from being wired up.
 *
 * Coordinator never receives an instance of this. The Controller calls it and
 * hands over a reference plus excerpts (§5.4).
 */
export type ObservedTreeReadPort = {
  /** Capture a component's tree, returning a reference and hash — never content. */
  readonly capture: (targetUrl: string) => Promise<ObservedTreeCapture>;
  /** Fetch bounded excerpts for named locators. */
  readonly excerpt: (
    treeRef: string,
    locators: readonly string[],
  ) => Promise<readonly ObservedTreeExcerpt[]>;
};

export type ObservedTreeCapture = {
  readonly tree_ref: string;
  readonly tree_sha256: string;
  readonly node_count: number;
  readonly captured_at: string;
  /** Regions the capture could not reach — recorded at capture time, since a gap
   *  discovered later cannot be distinguished from one that never existed. */
  readonly unreachable: readonly { readonly locator: string; readonly reason: string }[];
};

/**
 * A short video, **by reference only** (§14.3.14).
 *
 * Raw frames and full transcripts are never inlined. A video is the largest thing
 * that could enter a payload, and there is no version of inlining it that stays
 * bounded.
 *
 * Phase 1 defines this contract and processes nothing — short-video processing is
 * explicitly out of scope (§7.2).
 */
export type ShortVideoRef = {
  readonly video_ref: string;
  readonly video_sha256: string;
  readonly duration_ms: number;
  readonly extraction_status: 'not-started' | 'partial' | 'complete' | 'failed';
  /** References to extracted keyframes. Never the images. */
  readonly keyframe_refs: readonly string[];
  /** Reference to a transcript artifact. Never the transcript text. */
  readonly transcript_ref?: string | undefined;
};

export type ShortVideoPort = {
  readonly describe: (videoRef: string) => Promise<ShortVideoRef>;
};

/** Structural guard: a payload must not inline video content. */
export function hasInlinedVideoContent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const forbidden = ['frames', 'transcript', 'transcript_text', 'keyframes', 'video_base64'];
  let found = false;
  const visit = (node: unknown): void => {
    if (found || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (forbidden.includes(key)) {
        found = true;
        return;
      }
      visit(child);
    }
  };
  visit(value);
  return found;
}
