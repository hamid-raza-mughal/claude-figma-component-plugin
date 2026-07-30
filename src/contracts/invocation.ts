/**
 * The run invocation — where a route becomes a fact rather than an inference
 * (decision D3, P1-FINAL §14.3.1).
 *
 * `run_type` is **required and human-supplied**. There is no model route
 * classifier: an absent or invalid route blocks *before* any model invocation,
 * so a misrouted run cannot exist. The v1 design had a narrow classifier on
 * absence; the locked architecture removed it, because a route guessed wrong
 * sends the whole pipeline down the wrong branch and `audit` must never reach
 * Builder.
 */
import type { RefClass } from './identity.ts';

export const RUN_TYPES = ['new', 'modify', 'audit'] as const;
export type RunType = (typeof RUN_TYPES)[number];

export function isRunType(value: unknown): value is RunType {
  return typeof value === 'string' && (RUN_TYPES as readonly string[]).includes(value);
}

/**
 * Where a run may be routed next.
 *
 * `audit` can only ever reach `synthesizer`; `new` and `modify` only `builder`.
 * A blocked or failed run carries `null` — the absence of a forward route is a
 * value, not a missing field, so it cannot be omitted and defaulted.
 */
export const FORWARD_ROUTES = ['builder', 'synthesizer'] as const;
export type ForwardRoute = (typeof FORWARD_ROUTES)[number];

/**
 * Deterministic route policy. Not a model decision, and not overridable.
 *
 * `as const satisfies` rather than an annotated `Record`: the annotation would widen
 * each value to the `ForwardRoute` union, and the composer needs the **literal** —
 * `ROUTE_POLICY.audit` must be exactly `'synthesizer'` so assigning it to
 * `AuditReadyOutput.next_route` is a type check rather than a runtime hope. The
 * `satisfies` clause still guarantees every route is covered.
 */
export const ROUTE_POLICY = {
  new: 'builder',
  modify: 'builder',
  audit: 'synthesizer',
} as const satisfies Record<RunType, ForwardRoute>;

export function forwardRouteFor(runType: RunType): ForwardRoute {
  return ROUTE_POLICY[runType];
}

/** UUID v1–v5, any variant. Format assertion is enabled in the schema layer;
 *  this is the programmatic twin. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InvocationErrorCode =
  | 'INVOCATION_ROUTE_MISSING'
  | 'INVOCATION_ROUTE_INVALID'
  | 'INVOCATION_RUN_ID_INVALID'
  | 'INVOCATION_INTENT_EMPTY'
  | 'INVOCATION_TARGET_REQUIRED';

export class InvocationError extends Error {
  override readonly name = 'InvocationError';
  readonly code: InvocationErrorCode;

  constructor(message: string, code: InvocationErrorCode) {
    super(message);
    this.code = code;
  }
}

/**
 * A reference to the component a `modify` or `audit` run targets.
 *
 * Deliberately a reference and a hash, never inline content (§14.3.21). The full
 * observed tree is preserved externally and immutably; models receive bounded,
 * provenance-linked excerpts prepared by deterministic code (§5.4).
 */
export type ObservedComponentTreeRef = {
  readonly tree_ref: string;
  readonly tree_sha256: string;
  readonly node_count: number;
  readonly captured_at: string;
};

/**
 * The validated, route-bearing entry point to a run.
 *
 * `run_id` is a UUID for machines; a readable name lives in `display_id`. The v1
 * schema declared `format: uuid` while its canonical fixture used
 * `warning-toast-run-002`, and it validated only because format assertion was
 * off — so the two identities are separated here rather than overloaded.
 */
export type ResolvedCoordinatorInvocation = {
  readonly run_id: string;
  readonly display_id?: string | undefined;
  readonly run_type: RunType;
  /** The user's request, treated as untrusted data — never as instructions. */
  readonly user_intent: string;
  /** Required for `modify` and `audit`; must be absent for `new`. */
  readonly target?: ObservedComponentTreeRef | undefined;
  readonly requested_at: string;
  /** Reference classes the caller expects to be involved, when known. Advisory:
   *  the deterministic planner may widen or narrow it. */
  readonly expected_ref_classes?: readonly RefClass[] | undefined;
};

export type RawInvocation = {
  readonly run_id?: unknown;
  readonly display_id?: unknown;
  readonly run_type?: unknown;
  readonly user_intent?: unknown;
  readonly target?: unknown;
  readonly requested_at?: unknown;
  readonly expected_ref_classes?: unknown;
};

/**
 * Validates an invocation before anything else happens.
 *
 * Throws rather than returning a result: this runs at the very front of the
 * pipeline, and there is no meaningful partial-progress state to report. The
 * ordering matters — the route is checked before the intent, so a routeless run
 * fails for the reason that actually blocks it.
 */
export function resolveInvocation(raw: RawInvocation): ResolvedCoordinatorInvocation {
  if (raw.run_type === undefined || raw.run_type === null || raw.run_type === '') {
    throw new InvocationError(
      'run_type is required and human-supplied. There is no model route classifier: ' +
        `supply one of ${RUN_TYPES.join(' | ')} (decision D3).`,
      'INVOCATION_ROUTE_MISSING',
    );
  }
  if (!isRunType(raw.run_type)) {
    throw new InvocationError(
      `run_type must be one of ${RUN_TYPES.join(' | ')}, received: ${String(raw.run_type)}`,
      'INVOCATION_ROUTE_INVALID',
    );
  }
  if (typeof raw.run_id !== 'string' || !UUID.test(raw.run_id)) {
    throw new InvocationError(
      `run_id must be a UUID; a readable name belongs in display_id. Received: ${String(raw.run_id)}`,
      'INVOCATION_RUN_ID_INVALID',
    );
  }
  if (typeof raw.user_intent !== 'string' || raw.user_intent.trim() === '') {
    throw new InvocationError('user_intent must be a non-empty string', 'INVOCATION_INTENT_EMPTY');
  }
  const runType = raw.run_type;
  const needsTarget = runType === 'modify' || runType === 'audit';
  if (needsTarget && (raw.target === undefined || raw.target === null)) {
    throw new InvocationError(
      `run_type "${runType}" requires a target component reference`,
      'INVOCATION_TARGET_REQUIRED',
    );
  }

  const resolved: ResolvedCoordinatorInvocation = {
    run_id: raw.run_id,
    run_type: runType,
    user_intent: raw.user_intent,
    requested_at: typeof raw.requested_at === 'string' ? raw.requested_at : new Date().toISOString(),
    ...(typeof raw.display_id === 'string' ? { display_id: raw.display_id } : {}),
    ...(needsTarget ? { target: raw.target as ObservedComponentTreeRef } : {}),
    ...(Array.isArray(raw.expected_ref_classes)
      ? { expected_ref_classes: raw.expected_ref_classes as readonly RefClass[] }
      : {}),
  };
  return resolved;
}
