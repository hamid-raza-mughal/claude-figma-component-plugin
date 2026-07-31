/**
 * The transition registry is the one normative source (§1.4) — these tests
 * prove its internal derivations agree with each other and with §10/§12.2 as
 * printed, and name the one place they deliberately don't (PD-6).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSITIONS,
  RUN_EVENT_KINDS,
  MARKER_EVENT_KINDS,
  ANY_NON_TERMINAL,
  NON_TERMINAL_PHASES,
  NON_PHASE_SCOPED_TOOLS,
  GUARD_ONLY_TOOLS,
  computeToolSurfaceByPhase,
  isToolReachableFromPhase,
  findTransitions,
} from '../../src/registry/transitions.ts';
import { STAGE_PHASES } from '../../src/contracts/run-envelope.ts';

describe('run_event.kind — 1:1 with TRANSITIONS rows (§19 D-3, PD-3)', () => {
  test('every row has a unique kind', () => {
    const kinds = TRANSITIONS.map((row) => row.kind);
    assert.equal(kinds.length, TRANSITIONS.length);
    assert.equal(new Set(kinds).size, kinds.length, 'no two rows share a kind');
  });

  test('every non-marker RUN_EVENT_KINDS value is used by exactly one row', () => {
    const rowKinds = new Set(TRANSITIONS.map((row) => row.kind));
    const nonMarkerKinds = RUN_EVENT_KINDS.filter(
      (kind) => !(MARKER_EVENT_KINDS as readonly string[]).includes(kind),
    );
    assert.deepEqual([...rowKinds].sort(), [...nonMarkerKinds].sort());
  });

  test('the two marker kinds are never a row kind', () => {
    const rowKinds = new Set(TRANSITIONS.map((row) => row.kind));
    for (const marker of MARKER_EVENT_KINDS) assert.ok(!rowKinds.has(marker));
  });

  test('TRANSITIONS has exactly 20 rows, matching §10', () => {
    assert.equal(TRANSITIONS.length, 20);
  });
});

describe('G-1 allowlist — every transition is a named row, nothing else', () => {
  test('a legal (phase, tool) pair matches at least one row', () => {
    assert.ok(findTransitions('drafting', 'submitDraft').length > 0);
    assert.ok(findTransitions('awaiting-approval', 'recordApproval').length > 0);
  });

  test('an illegal (phase, tool) pair matches no row', () => {
    assert.equal(findTransitions('received', 'submitDraft').length, 0);
    assert.equal(findTransitions('handoff-ready', 'openClarification').length, 0);
    assert.equal(findTransitions('drafting', 'recordApproval').length, 0);
  });

  test('cancelRun and expireRun match from every non-terminal phase (any-non-terminal)', () => {
    for (const phase of NON_TERMINAL_PHASES) {
      assert.ok(findTransitions(phase, 'cancelRun').length > 0, `cancelRun from ${phase}`);
      assert.ok(findTransitions(phase, 'expireRun').length > 0, `expireRun from ${phase}`);
    }
  });

  test('ANY_NON_TERMINAL expands to exactly the seven non-terminal phases', () => {
    assert.equal(NON_TERMINAL_PHASES.length, 7);
    assert.ok(!NON_TERMINAL_PHASES.includes('terminal'));
    for (const phase of STAGE_PHASES) {
      if (phase === 'terminal') continue;
      assert.ok(NON_TERMINAL_PHASES.includes(phase));
    }
    assert.equal(typeof ANY_NON_TERMINAL, 'string');
  });
});

describe('§12.2 tool surface — derived, not transcribed', () => {
  const surface = computeToolSurfaceByPhase();

  test('drafting exposes exactly submitDraft, closeRun (PD-6) and cancelRun', () => {
    assert.deepEqual(
      [...(surface.get('drafting') ?? [])].sort(),
      ['cancelRun', 'closeRun', 'submitDraft'].sort(),
    );
  });

  test('preparing exposes failRun, closeRun (PD-6) and cancelRun — not prepareContext', () => {
    // Row 4 (preparing -> drafting, "its return") is the same external
    // prepareContext call that produced received -> preparing, not a second
    // invocation opportunity while paused in preparing (preparing is not a
    // pause phase, §3.2) — so prepareContext is absent here, matching §12.2.
    assert.deepEqual(
      [...(surface.get('preparing') ?? [])].sort(),
      ['cancelRun', 'closeRun', 'failRun'].sort(),
    );
  });

  test('awaiting-clarification exposes exactly answerClarification, closeRun, cancelRun', () => {
    assert.deepEqual(
      [...(surface.get('awaiting-clarification') ?? [])].sort(),
      ['answerClarification', 'cancelRun', 'closeRun'].sort(),
    );
  });

  test('awaiting-approval exposes recordApproval, cancelRun, and closeRun (PD-6)', () => {
    // §12.2's printed table omits closeRun here; PD-6 records why the
    // mechanical derivation includes it — §10 row 20 says "any non-terminal"
    // for the source-invalidated closeRun-blocked exit, added in revision 4.
    assert.deepEqual(
      [...(surface.get('awaiting-approval') ?? [])].sort(),
      ['cancelRun', 'closeRun', 'recordApproval'].sort(),
    );
  });

  test('handoff-ready exposes both tools of the compound trigger, plus cancelRun', () => {
    assert.deepEqual(
      [...(surface.get('handoff-ready') ?? [])].sort(),
      ['buildHandoff', 'cancelRun', 'closeRun'].sort(),
    );
  });

  test('validating exposes every caller-invocable §10 row it appears in as From', () => {
    // submitDraft is absent: the validating -> drafting (repairable) row is the
    // same submitDraft call that produced drafting -> validating, not a second
    // invocation opportunity while paused in validating (not a pause phase).
    assert.deepEqual(
      [...(surface.get('validating') ?? [])].sort(),
      ['cancelRun', 'closeRun', 'failRun', 'openClarification', 'presentForApproval'].sort(),
    );
  });

  test('expireRun never appears in any phase surface — Guard-initiated only', () => {
    for (const phase of NON_TERMINAL_PHASES) {
      assert.ok(!(surface.get(phase) ?? new Set()).has('expireRun'));
    }
    assert.deepEqual([...GUARD_ONLY_TOOLS], ['expireRun']);
  });

  test('every non-phase-scoped tool is reachable regardless of phase', () => {
    for (const tool of NON_PHASE_SCOPED_TOOLS) {
      for (const phase of NON_TERMINAL_PHASES) {
        assert.ok(isToolReachableFromPhase(tool, phase), `${tool} from ${phase}`);
      }
    }
  });

  test('expireRun is unreachable from every phase via isToolReachableFromPhase', () => {
    for (const phase of NON_TERMINAL_PHASES) {
      assert.ok(!isToolReachableFromPhase('expireRun', phase));
    }
  });
});

describe('G-11 authority-leak matrix — generated from the registry, not hand-listed', () => {
  const surface = computeToolSurfaceByPhase();
  const phaseScopedTools = ['submitDraft', 'openClarification', 'answerClarification', 'presentForApproval', 'recordApproval', 'buildHandoff', 'closeRun', 'failRun', 'cancelRun'] as const;

  for (const phase of NON_TERMINAL_PHASES) {
    for (const tool of phaseScopedTools) {
      const allowed = surface.get(phase)?.has(tool) ?? false;
      test(`${tool} from ${phase}: ${allowed ? 'reachable' : 'refused'}`, () => {
        assert.equal(isToolReachableFromPhase(tool, phase), allowed);
      });
    }
  }
});
