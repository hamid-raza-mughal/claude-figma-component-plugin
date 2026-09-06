/**
 * Deterministic query planning (§13.3).
 *
 * Hard constraints: **no arbitrary SQL, and no model call.** Queries are derived
 * from the explicit route, the request terminology, and any supplied observed-tree
 * properties, using predefined property categories and term mappings.
 *
 * The interface is kept replaceable on purpose. A model-assisted planner may turn
 * out to be better, but it requires measured pilot evidence and a recorded
 * amendment — not a quiet substitution. Until then, the honest residual risk is
 * that query formulation replaces hallucination as the failure mode, and a
 * deterministic planner is what makes that risk testable.
 */
import { extractTerms } from './candidate-ranking.ts';
import { DEFAULT_CANDIDATE_COUNT, MAX_CANDIDATE_COUNT } from '../contracts/resolution.ts';
import type { RefClass } from '../contracts/identity.ts';
import type { RunType } from '../contracts/invocation.ts';
import type { ClarificationNeeded, QueryPlanResult, ResolverQuery } from './resolver-types.ts';

/**
 * Property → permitted reference classes. Ported from the prototype's
 * `CLS_FOR_PROP`, which is what keeps a fill from resolving to a variable.
 */
export const PROPERTY_TO_REF_CLASSES: Readonly<Record<string, readonly RefClass[]>> = {
  fill: ['paint-style'],
  stroke: ['paint-style'],
  text_style: ['text-style'],
  effect: ['effect-style'],
  grid: ['grid-style'],
  padding: ['variable'],
  gap: ['variable'],
  'corner-radius': ['variable'],
  'stroke-weight': ['variable'],
  size: ['variable'],
  'layer-opacity': ['variable'],
};

/** Property → property category. Ported from `CAT_FOR_PROP`. */
export const PROPERTY_TO_CATEGORY: Readonly<Record<string, string>> = {
  padding: 'spacing',
  gap: 'spacing',
  size: 'spacing',
  'corner-radius': 'corner-radius',
  'stroke-weight': 'border-width',
  'layer-opacity': 'opacity',
  fill: 'color',
  stroke: 'color',
  text_style: 'typography',
  effect: 'effect',
  grid: 'grid',
};

/**
 * Scope hints per property. `scopes` is populated on all 531 variables and is the
 * real discriminator in this export, whereas descriptions cover only 18% and are
 * formulaic — so this mapping earns more than the description text does.
 */
export const PROPERTY_TO_SCOPES: Readonly<Record<string, readonly string[]>> = {
  padding: ['GAP', 'WIDTH_HEIGHT'],
  gap: ['GAP'],
  size: ['WIDTH_HEIGHT'],
  'corner-radius': ['CORNER_RADIUS'],
  'stroke-weight': ['STROKE_FLOAT'],
  'layer-opacity': ['OPACITY'],
  fill: ['ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'],
  stroke: ['STROKE_COLOR'],
};

/** Unit expressions normalized to a bare number (§13.3, "normalize common
 *  numeric/unit expressions"). Percentages are captured as their literal value —
 *  `opacity_6` in this library means 6%, not 0.06. */
const VALUE_PATTERNS: readonly RegExp[] = [
  /(\d+(?:\.\d+)?)\s*px\b/,
  /(\d+(?:\.\d+)?)\s*pt\b/,
  /(\d+(?:\.\d+)?)\s*%/,
  /\b(\d+(?:\.\d+)?)\s*(?:pixel|point)s?\b/,
  /^\s*(\d+(?:\.\d+)?)\s*$/,
];

export function extractRequestedValue(text: string): number | undefined {
  const lower = text.toLowerCase();
  for (const pattern of VALUE_PATTERNS) {
    const match = pattern.exec(lower);
    if (match?.[1] !== undefined) {
      const value = Number.parseFloat(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

const MODE_NAMES = ['dark', 'light'] as const;

export function extractMode(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const mode of MODE_NAMES) {
    // Word-boundary matched so "highlight" does not read as "light".
    if (new RegExp(`\\b${mode}\\b`).test(lower)) return mode === 'dark' ? 'Dark' : 'Light';
  }
  return undefined;
}

export type PlanRequestItem = {
  /** Semantic element this reference belongs to, for correlation. */
  readonly semantic_id: string;
  /** Property being resolved — a key of {@link PROPERTY_TO_REF_CLASSES}. */
  readonly property: string;
  /** The user's words. Untrusted data, never instructions. */
  readonly reference_text: string;
  readonly observed_property_hints?: readonly string[] | undefined;
};

export type PlanInput = {
  readonly route: RunType;
  readonly items: readonly PlanRequestItem[];
};

/**
 * Whether a request carries enough signal for a safe bounded query.
 *
 * Requiring *either* a term or a value is the floor. Below it, the honest answer
 * is a structured clarification gap — guessing here is what produces a confident
 * wrong resolution, which is strictly worse than a question.
 */
function hasUsableSignal(referenceText: string): boolean {
  return extractTerms(referenceText).length > 0 || extractRequestedValue(referenceText) !== undefined;
}

export function planQueries(input: PlanInput): QueryPlanResult {
  const queries: ResolverQuery[] = [];
  const gaps: ClarificationNeeded[] = [];

  input.items.forEach((item, index) => {
    const queryId = `q${String(index + 1).padStart(3, '0')}-${item.semantic_id}-${item.property}`;

    const permitted = PROPERTY_TO_REF_CLASSES[item.property];
    if (permitted === undefined) {
      gaps.push({
        kind: 'clarification-needed',
        query_id: queryId,
        reason: 'query-too-vague',
        question: `Which kind of design-system reference should "${item.property}" resolve to?`,
        evidence:
          `property "${item.property}" has no reference-class mapping; known properties are ` +
          `${Object.keys(PROPERTY_TO_REF_CLASSES).sort().join(', ')}`,
      });
      return;
    }

    if (!hasUsableSignal(item.reference_text)) {
      gaps.push({
        kind: 'clarification-needed',
        query_id: queryId,
        reason: 'no-term-or-value-signal',
        question: `Which ${item.property} should be used? Please name a token or give a value.`,
        evidence: `reference text ${JSON.stringify(item.reference_text)} yields no usable term or numeric value`,
      });
      return;
    }

    const requestedValue = extractRequestedValue(item.reference_text);
    const mode = extractMode(item.reference_text);
    const scopes = PROPERTY_TO_SCOPES[item.property];
    const category = PROPERTY_TO_CATEGORY[item.property];

    queries.push({
      query_id: queryId,
      route: input.route,
      property_category: category ?? 'other',
      reference_text: item.reference_text,
      permitted_ref_classes: permitted,
      ...(requestedValue === undefined ? {} : { requested_value: requestedValue }),
      ...(mode === undefined ? {} : { mode_hint: mode }),
      ...(scopes === undefined ? {} : { requested_scopes: scopes }),
      ...(item.observed_property_hints === undefined
        ? {}
        : { observed_property_hints: item.observed_property_hints }),
      limit: DEFAULT_CANDIDATE_COUNT,
    });
  });

  return { queries, gaps };
}

/** Widen a query's limit to the hard ceiling. Used only when scores are close
 *  enough to be genuinely ambiguous (§13.4.1). */
export function widenForAmbiguity(query: ResolverQuery): ResolverQuery {
  return { ...query, limit: MAX_CANDIDATE_COUNT };
}
