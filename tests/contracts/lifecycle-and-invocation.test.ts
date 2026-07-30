/**
 * Gate 1 evidence for the lifecycle and the operational-field boundary
 * (P1-FINAL §12, §14.3.1–4, decisions D3 and D4).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_PHASES,
  RUN_OUTCOMES,
  STAGE_NAMES,
  STAGE_PHASE_MAP,
  isPhaseValidForStage,
  findOperationalLeaks,
  OPERATIONAL_FIELD_NAMES,
} from '../../src/contracts/run-envelope.ts';
import {
  resolveInvocation,
  forwardRouteFor,
  ROUTE_POLICY,
  RUN_TYPES,
  InvocationError,
} from '../../src/contracts/invocation.ts';
import {
  FAILURE_CLASSES,
  FAILURE_IS_TERMINAL,
  FAILURE_IS_REPAIRABLE,
  classifyFailure,
} from '../../src/contracts/failures.ts';
import { hasBlockingGap, type ClarificationGap, type Disclosure } from '../../src/contracts/resolution.ts';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('lifecycle (D4) — eight phases, five outcomes, stage-scoped', () => {
  test('exactly eight phases and five outcomes', () => {
    assert.equal(STAGE_PHASES.length, 8);
    assert.equal(RUN_OUTCOMES.length, 5);
  });

  /** `timed-out` is the outcome the earlier seven-state model could not express
   *  while the controller mandates per-dependency timeouts. */
  test('timed-out is expressible', () => {
    assert.ok(RUN_OUTCOMES.includes('timed-out'));
  });

  test('every stage declares its permitted phases', () => {
    for (const stage of STAGE_NAMES) {
      assert.ok(STAGE_PHASE_MAP[stage].length > 0, `${stage} has no phases`);
    }
  });

  test('Coordinator is the only stage using all eight', () => {
    const full = STAGE_NAMES.filter((s) => STAGE_PHASE_MAP[s].length === STAGE_PHASES.length);
    assert.deepEqual(full, ['coordinator']);
  });

  /** The exclusions carry meaning, so they are asserted rather than assumed. */
  test('deterministic stages have no drafting and no human phases', () => {
    for (const stage of ['ingestion', 'figma-read', 'post-build'] as const) {
      assert.ok(!isPhaseValidForStage(stage, 'drafting'), `${stage} must not draft`);
      assert.ok(!isPhaseValidForStage(stage, 'awaiting-approval'), `${stage} has no human gate`);
      assert.ok(!isPhaseValidForStage(stage, 'awaiting-clarification'), `${stage} asks nothing`);
    }
  });

  test('Synthesizer has no human phases — gaps exit as findings, never questions', () => {
    assert.ok(!isPhaseValidForStage('synthesizer', 'awaiting-clarification'));
    assert.ok(!isPhaseValidForStage('synthesizer', 'awaiting-approval'));
  });

  test('Builder and Reviewer each carry a human gate', () => {
    assert.ok(isPhaseValidForStage('builder', 'awaiting-approval'));
    assert.ok(isPhaseValidForStage('reviewer', 'awaiting-approval'));
  });
});

describe('route policy (D3) — required, human-supplied, deterministic', () => {
  test('accepts each valid route', () => {
    for (const runType of RUN_TYPES) {
      const target =
        runType === 'new'
          ? {}
          : {
              target: {
                tree_ref: 'tree-1',
                tree_sha256: 'b'.repeat(64),
                node_count: 12,
                captured_at: '2026-07-29T10:00:00Z',
              },
            };
      const resolved = resolveInvocation({
        run_id: UUID,
        run_type: runType,
        user_intent: 'do the thing',
        requested_at: '2026-07-29T10:00:00Z',
        ...target,
      });
      assert.equal(resolved.run_type, runType);
    }
  });

  test('a missing route blocks, and says why', () => {
    assert.throws(
      () => resolveInvocation({ run_id: UUID, user_intent: 'x' }),
      (e: unknown) =>
        e instanceof InvocationError &&
        e.code === 'INVOCATION_ROUTE_MISSING' &&
        /no model route classifier/.test(e.message),
    );
  });

  test('an invalid route blocks', () => {
    assert.throws(
      () => resolveInvocation({ run_id: UUID, run_type: 'refactor', user_intent: 'x' }),
      (e: unknown) => e instanceof InvocationError && e.code === 'INVOCATION_ROUTE_INVALID',
    );
  });

  /** The route is checked before the intent, so a routeless run fails for the
   *  reason that actually blocks it rather than for a downstream symptom. */
  test('route is validated before intent', () => {
    assert.throws(
      () => resolveInvocation({ run_id: UUID, user_intent: '' }),
      (e: unknown) => e instanceof InvocationError && e.code === 'INVOCATION_ROUTE_MISSING',
    );
  });

  test('a non-UUID run_id is rejected — a readable name belongs in display_id', () => {
    assert.throws(
      () =>
        resolveInvocation({
          run_id: 'warning-toast-run-002',
          run_type: 'new',
          user_intent: 'x',
        }),
      (e: unknown) => e instanceof InvocationError && e.code === 'INVOCATION_RUN_ID_INVALID',
    );
  });

  test('display_id carries the readable identity alongside a UUID', () => {
    const resolved = resolveInvocation({
      run_id: UUID,
      display_id: 'warning-toast-run-002',
      run_type: 'new',
      user_intent: 'x',
    });
    assert.equal(resolved.display_id, 'warning-toast-run-002');
  });

  test('modify and audit require a target', () => {
    for (const runType of ['modify', 'audit'] as const) {
      assert.throws(
        () => resolveInvocation({ run_id: UUID, run_type: runType, user_intent: 'x' }),
        (e: unknown) => e instanceof InvocationError && e.code === 'INVOCATION_TARGET_REQUIRED',
      );
    }
  });

  /** The structural guarantee: audit can never reach Builder. */
  test('audit routes to synthesizer; new and modify route to builder', () => {
    assert.equal(forwardRouteFor('audit'), 'synthesizer');
    assert.equal(forwardRouteFor('new'), 'builder');
    assert.equal(forwardRouteFor('modify'), 'builder');
    assert.notEqual(ROUTE_POLICY.audit, 'builder');
  });
});

describe('operational-field boundary (§14.3.4)', () => {
  test('a clean semantic draft reports no leaks', () => {
    const draft = {
      component_name: 'Warning Toast',
      elements: [{ semantic_id: 'root', selected_candidate_id: 'c_' + '0'.repeat(24) }],
    };
    assert.deepEqual(findOperationalLeaks(draft), []);
  });

  test('a model-authored approval is detected', () => {
    const leaks = findOperationalLeaks({
      component_name: 'X',
      approvals: [{ decision: 'approved', approved_by: 'the model' }],
    });
    assert.ok(leaks.some((l) => l.field === 'approvals'));
    assert.ok(leaks.some((l) => l.field === 'approved_by'));
  });

  test('model-authored telemetry is detected', () => {
    const leaks = findOperationalLeaks({ token_metrics: { input_tokens: 42 } });
    assert.ok(leaks.some((l) => l.field === 'token_metrics'));
    assert.ok(leaks.some((l) => l.field === 'input_tokens'));
  });

  /** Nesting is where this kind of check usually fails. */
  test('leaks are found at depth and inside arrays, with a JSON Pointer', () => {
    const leaks = findOperationalLeaks({
      elements: [{ children: [{ meta: { run_id: 'forged' } }] }],
    });
    assert.equal(leaks.length, 1);
    assert.equal(leaks[0]?.field, 'run_id');
    assert.equal(leaks[0]?.path, '/elements/0/children/0/meta/run_id');
  });

  test('all leaks are reported at once, so one repair call suffices', () => {
    const leaks = findOperationalLeaks({ run_id: 'a', model_id: 'b', retry_count: 3 });
    assert.equal(leaks.length, 3);
  });

  test('the forbidden list covers every operational concern named in §14.3.3', () => {
    for (const field of [
      'run_id',
      'index_version',
      'source_sha256',
      'created_at',
      'tool_invocations',
      'retry_count',
      'approvals',
      'token_metrics',
      'gate_mode',
      'stage_phase',
    ]) {
      assert.ok(OPERATIONAL_FIELD_NAMES.includes(field), `${field} must be forbidden in a draft`);
    }
  });
});

describe('gaps and disclosures — blocking is a property of the type', () => {
  const blocking: ClarificationGap = {
    gap_id: 'gap-1',
    state: 'active',
    severity: 'blocking',
    owner: 'user',
    question: 'Which surface token?',
    evidence: 'two equally ranked candidates',
    required_answer: 'a token path',
    opened_in_round: 1,
  };

  test('an active blocking gap blocks', () => {
    assert.ok(hasBlockingGap([blocking]));
  });

  test('a reopened blocking gap still blocks', () => {
    assert.ok(hasBlockingGap([{ ...blocking, state: 'reopened' }]));
  });

  test('a resolved gap does not block', () => {
    assert.ok(!hasBlockingGap([{ ...blocking, state: 'resolved' }]));
  });

  test('a non-blocking gap does not block', () => {
    assert.ok(!hasBlockingGap([{ ...blocking, severity: 'non-blocking' }]));
  });

  /**
   * Finding C7: routing a non-blocking disclosure through ClarificationGap would
   * trip the blocking-gap rule and block a run that should proceed. `actionable`
   * is the literal `false`, so the type system carries the guarantee.
   */
  test('a disclosure is structurally non-actionable', () => {
    const disclosure: Disclosure = {
      disclosure_id: 'disc-1',
      kind: 'interaction_state_gap',
      owner: 'coordinator',
      evidence: 'focus-visible absent on Button',
      actionable: false,
    };
    assert.equal(disclosure.actionable, false);
    // A Disclosure is not a ClarificationGap, so it cannot reach hasBlockingGap
    // at all — enforced at compile time, asserted here for the record.
    assert.ok(!('severity' in disclosure));
  });
});

describe('failure classification (§14.3.18)', () => {
  test('all seven classes exist', () => {
    assert.equal(FAILURE_CLASSES.length, 7);
  });

  test('enrichment failure and partial extraction are non-terminal', () => {
    assert.equal(FAILURE_IS_TERMINAL['optional-enrichment-failure'], false);
    assert.equal(FAILURE_IS_TERMINAL['partial-audit-extraction'], false);
  });

  test('only validation failure is repairable', () => {
    const repairable = FAILURE_CLASSES.filter((c) => FAILURE_IS_REPAIRABLE[c]);
    assert.deepEqual(repairable, ['validation-failure']);
  });

  test('cancellation is terminal but not a defect to repair', () => {
    assert.equal(FAILURE_IS_TERMINAL.cancellation, true);
    assert.equal(FAILURE_IS_REPAIRABLE.cancellation, false);
  });

  test('classifyFailure derives terminality and repairability rather than trusting a caller', () => {
    const report = classifyFailure(
      'validation-failure',
      [{ code: 'SCHEMA_UNKNOWN_FIELD', message: 'unknown field', enforced_by: 'schema' }],
      '2026-07-29T10:00:00Z',
    );
    assert.equal(report.terminal, false);
    assert.equal(report.repairable, true);
    assert.equal(report.evidence[0]?.enforced_by, 'schema');
  });
});
