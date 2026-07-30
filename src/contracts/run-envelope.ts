/**
 * Lifecycle and the operational-field boundary (P1-FINAL §12, decision D4).
 *
 * **Defined, not executed.** Phase 1 fixes these types so downstream contracts
 * can reference them; it does not persist run state or perform transitions.
 * That is Phase 2 Runtime Controller work (§7.2).
 *
 * The boundary this file exists to draw: `RunEnvelope` owns every operational
 * fact, and a model draft owns none. Without that split a model can author its
 * own approval, its own token counts, or its own tool results — which is how a
 * self-graded run comes to look like an evidenced one.
 */

/**
 * The eight durable phases, **scoped to a stage** (decision D4).
 *
 * Stage-scoping is the whole point. Eight phases applied to the *run* ended at
 * Gate 1 and left roughly sixty percent of the run — build, verify, synthesise,
 * review, accept — unphased, so a run would sit in `handoff-ready` for most of
 * its life and defeat the timeout enforcement the phases exist to enable. The
 * same lifecycle maps onto every dispatched unit of work instead, with no ninth
 * phase invented.
 */
export const STAGE_PHASES = [
  'received',
  'preparing',
  'drafting',
  'awaiting-clarification',
  'validating',
  'awaiting-approval',
  'handoff-ready',
  'terminal',
] as const;

export type StagePhase = (typeof STAGE_PHASES)[number];

/**
 * Run-level outcomes. `timed-out` is the one the earlier seven-state model could
 * not express while the controller mandates per-dependency timeouts — which is
 * the evidence that closed DR-2 rather than re-litigating it.
 */
export const RUN_OUTCOMES = ['completed', 'blocked', 'failed', 'cancelled', 'timed-out'] as const;

export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export const STAGE_NAMES = [
  'ingestion',
  'figma-read',
  'coordinator',
  'builder',
  'post-build',
  'synthesizer',
  'reviewer',
] as const;

export type StageName = (typeof STAGE_NAMES)[number];

/**
 * Which phases each stage may legitimately enter, per the locked architecture.
 *
 * Encoded rather than described because the exclusions carry meaning: ingestion
 * has no `drafting` and no human phases; Synthesizer has no human phases at all
 * because its gaps exit as findings, never as questions.
 */
export const STAGE_PHASE_MAP: Readonly<Record<StageName, readonly StagePhase[]>> = {
  ingestion: ['received', 'preparing', 'validating', 'handoff-ready', 'terminal'],
  'figma-read': ['received', 'preparing', 'validating', 'handoff-ready', 'terminal'],
  coordinator: [...STAGE_PHASES],
  builder: [
    'received',
    'preparing',
    'drafting',
    'awaiting-clarification',
    'awaiting-approval',
    'handoff-ready',
    'terminal',
  ],
  'post-build': ['received', 'preparing', 'validating', 'handoff-ready', 'terminal'],
  synthesizer: ['received', 'preparing', 'drafting', 'validating', 'handoff-ready', 'terminal'],
  reviewer: [
    'received',
    'preparing',
    'drafting',
    'validating',
    'awaiting-approval',
    'handoff-ready',
    'terminal',
  ],
};

export function isPhaseValidForStage(stage: StageName, phase: StagePhase): boolean {
  return STAGE_PHASE_MAP[stage].includes(phase);
}

/** Run state is active stage + that stage's phase + the run's outcome. */
export type RunState = {
  readonly active_stage: StageName;
  readonly stage_phase: StagePhase;
  /** Absent until the run reaches a terminal outcome. */
  readonly outcome?: RunOutcome | undefined;
};

export type ToolInvocationRecord = {
  readonly tool: string;
  readonly invoked_at: string;
  readonly duration_ms: number;
  readonly ok: boolean;
  /** Machine-readable reason when `ok` is false. Never free prose. */
  readonly error_code?: string | undefined;
};

/**
 * Gate approval. `gate_mode` is carried explicitly so an observation-only run can
 * never be mistaken for an authorising one.
 *
 * Phase 1 uses `observe-only-validation` (§14.3.20): no Figma write exists, so
 * no approval here can authorise one.
 */
export const GATE_MODES = ['observe-only-validation', 'authorising'] as const;
export type GateMode = (typeof GATE_MODES)[number];

export type ApprovalRecord = {
  readonly gate: 'gate-1-semantic' | 'gate-2-acceptance';
  readonly gate_mode: GateMode;
  /** SHA-256 of the exact artifact approved. Binding the hash is what makes the
   *  approval refer to something specific rather than to a moment in time. */
  readonly approved_artifact_sha256: string;
  readonly approved_at: string;
  readonly approved_by: string;
  readonly decision: 'approved' | 'rejected' | 'changes-requested';
};

export type TokenMetrics = {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_creation_tokens: number;
  readonly cache_read_tokens: number;
};

/**
 * Every operational fact about a run. **Deterministic code writes all of it.**
 *
 * Phase 1 defines the shape and populates nothing that needs a model adapter —
 * `token_metrics` and `model_id` stay absent rather than zeroed, because a
 * fabricated zero is indistinguishable from a measurement.
 */
export type RunEnvelope = {
  readonly run_id: string;
  readonly display_id?: string | undefined;
  readonly spec_schema_version: string;
  readonly prompt_version?: string | undefined;
  readonly model_id?: string | undefined;
  readonly source_sha256: string;
  readonly index_version: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly state: RunState;
  readonly tool_invocations: readonly ToolInvocationRecord[];
  readonly retry_count: number;
  readonly repair_call_count: number;
  readonly clarification_round_count: number;
  readonly approvals: readonly ApprovalRecord[];
  readonly token_metrics?: TokenMetrics | undefined;
  readonly latency_by_stage_ms?: Readonly<Record<string, number>> | undefined;
};

/**
 * Field names a model draft may never contain, at any depth.
 *
 * This list is the executable form of §14.3.4 ("`CoordinatorJudgmentDraft`
 * cannot contain operational fields"). WP3's schemas close every object, and
 * WP5's semantic validator uses this list as a second, independent check —
 * belt and braces, because a single missing `unevaluatedProperties` is how the
 * v1 schema came to accept anything at all.
 */
export const OPERATIONAL_FIELD_NAMES: readonly string[] = [
  'run_id',
  'display_id',
  'spec_schema_version',
  'prompt_version',
  'model_id',
  'source_sha256',
  'index_version',
  'created_at',
  'updated_at',
  'state',
  'active_stage',
  'stage_phase',
  'outcome',
  'tool_invocations',
  'tool_results',
  'retry_count',
  'repair_call_count',
  'clarification_round_count',
  'approvals',
  'approved_artifact_sha256',
  'approved_at',
  'approved_by',
  'gate_mode',
  'token_metrics',
  'input_tokens',
  'output_tokens',
  'cache_creation_tokens',
  'cache_read_tokens',
  'latency_by_stage_ms',
  'telemetry',
];

export type OperationalLeak = {
  readonly field: string;
  /** JSON Pointer to where the forbidden field appeared. */
  readonly path: string;
};

/**
 * Walks an arbitrary parsed value and reports every operational field found.
 *
 * Returns all leaks rather than the first, so a repair prompt can be issued once
 * instead of iterating — the repair budget is one call (§15.5).
 */
export function findOperationalLeaks(value: unknown, basePath = ''): OperationalLeak[] {
  const leaks: OperationalLeak[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}/${key}`;
      if (OPERATIONAL_FIELD_NAMES.includes(key)) {
        leaks.push({ field: key, path: childPath });
      }
      visit(child, childPath);
    }
  };
  visit(value, basePath);
  return leaks;
}
