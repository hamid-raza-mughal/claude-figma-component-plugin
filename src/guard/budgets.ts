/**
 * Repair and clarification budgets, derived from the fold — never
 * self-reported (§5.3, §6.4). Both are pure predicates over `DerivedRunState`;
 * the tools that call these (WP6/WP7) decide what to do with the answer, e.g.
 * routing a `repairable` verdict to `failRun` instead of back to `drafting`
 * once the repair budget is spent (§6.5).
 */
import { GuardRefusal } from './errors.ts';
import type { DerivedRunState } from './fold.ts';

/** §6.2: exactly one repair call per run, ever — not per failure. */
export const REPAIR_BUDGET = 1;

/** §5.2: governance-valve default. Hard-capped at 3 by a shipped schema
 *  (`ClarificationGap.opened_in_round`), so a budget above 3 needs a schema
 *  amendment, not a config change. */
export const CLARIFICATION_ROUND_SOFT_BUDGET = 2;
export const CLARIFICATION_ROUND_HARD_CEILING = 3;

export function hasRepairBudgetRemaining(state: DerivedRunState): boolean {
  return state.repairCallCount < REPAIR_BUDGET;
}

export function hasClarificationBudgetRemaining(state: DerivedRunState): boolean {
  return state.clarificationRoundCount < CLARIFICATION_ROUND_SOFT_BUDGET;
}

/**
 * G-5: whether a `repairable` verdict from `submitDraft` may transition the
 * run back to `drafting` (§10 row 7). When the budget is already spent, the
 * caller must route to `failRun` instead (§6.5) — this function only answers
 * the eligibility question; it does not perform either transition.
 */
export function checkRepairEligibility(state: DerivedRunState): boolean {
  return hasRepairBudgetRemaining(state);
}

/**
 * G-6a/G-6b: `openClarification`'s two checks together. `openedInRound` is the
 * model-authored echo (§5.3.1) — validated equal to the Guard-derived next
 * round, never trusted as authority. Throws rather than returning false: a
 * caller needs to distinguish *which* rule refused (budget vs. mismatch).
 */
export function checkOpenClarification(state: DerivedRunState, openedInRound: number): void {
  if (!hasClarificationBudgetRemaining(state)) {
    throw new GuardRefusal(
      'G-6a',
      `Clarification round budget spent: ${state.clarificationRoundCount} of ` +
        `${CLARIFICATION_ROUND_SOFT_BUDGET} rounds already opened (§5.3).`,
    );
  }
  const derivedRound = state.clarificationRoundCount + 1;
  if (openedInRound !== derivedRound) {
    throw new GuardRefusal(
      'G-6b',
      `opened_in_round (${openedInRound}) does not match the Guard-derived round ` +
        `(${derivedRound}) — it is echo-only, never authority (§5.3.1).`,
    );
  }
}
