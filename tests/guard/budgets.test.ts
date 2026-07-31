/**
 * §5.2/§5.3 (clarification) and §6.2/§6.4 (repair) — budgets derived from the
 * fold, never self-reported.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasRepairBudgetRemaining,
  hasClarificationBudgetRemaining,
  checkRepairEligibility,
  checkOpenClarification,
  REPAIR_BUDGET,
  CLARIFICATION_ROUND_SOFT_BUDGET,
} from '../../src/guard/budgets.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import type { DerivedRunState } from '../../src/guard/fold.ts';

function state(overrides: Partial<DerivedRunState> = {}): DerivedRunState {
  return {
    phase: 'validating',
    outcome: undefined,
    repairCallCount: 0,
    clarificationRoundCount: 0,
    sourceInvalidated: false,
    lastEventAt: '2026-07-29T10:00:00Z',
    eventCount: 4,
    ...overrides,
  };
}

describe('repair budget (§6.2) — exactly one per run', () => {
  test('a fresh run has the budget', () => {
    assert.equal(hasRepairBudgetRemaining(state({ repairCallCount: 0 })), true);
    assert.equal(checkRepairEligibility(state({ repairCallCount: 0 })), true);
  });

  test('after one repair, the budget (and eligibility) is spent', () => {
    assert.equal(hasRepairBudgetRemaining(state({ repairCallCount: REPAIR_BUDGET })), false);
    assert.equal(checkRepairEligibility(state({ repairCallCount: REPAIR_BUDGET })), false);
  });
});

describe('clarification budget (§5.2/§5.3) — G-6a/G-6b', () => {
  test('round 1 is open when no rounds have been opened yet', () => {
    assert.doesNotThrow(() => checkOpenClarification(state({ clarificationRoundCount: 0 }), 1));
  });

  test('round 2 is open after round 1', () => {
    assert.doesNotThrow(() => checkOpenClarification(state({ clarificationRoundCount: 1 }), 2));
  });

  test('G-6a: refuses opening a third round when the soft budget (2) is spent', () => {
    assert.equal(hasClarificationBudgetRemaining(state({ clarificationRoundCount: CLARIFICATION_ROUND_SOFT_BUDGET })), false);
    assert.throws(
      () => checkOpenClarification(state({ clarificationRoundCount: CLARIFICATION_ROUND_SOFT_BUDGET }), 3),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-6a',
    );
  });

  test('G-6b: refuses an opened_in_round that does not match the Guard-derived round', () => {
    assert.throws(
      () => checkOpenClarification(state({ clarificationRoundCount: 0 }), 2),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-6b',
    );
    assert.throws(
      () => checkOpenClarification(state({ clarificationRoundCount: 1 }), 1),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-6b',
    );
  });

  test('G-6a is checked before G-6b when both would fire', () => {
    // Budget spent AND a mismatched round: the budget refusal is more
    // fundamental (no round is legal at all) so it must win.
    assert.throws(
      () => checkOpenClarification(state({ clarificationRoundCount: CLARIFICATION_ROUND_SOFT_BUDGET }), 99),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-6a',
    );
  });
});
