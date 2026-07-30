/**
 * The workbook assertion registry and runner (§17.3).
 *
 * Three rules govern this module, and each exists because of something that already
 * went wrong:
 *
 *   1. **An assertion is never marked passed without being executed.** The v1
 *      workbook's 18 Results rows all carry the same reviewer label
 *      (`architect-self-review`) and the same prompt version. They are architect
 *      self-simulation, not live evidence, and this runner cannot produce that
 *      category of row: a status comes from calling the check or it does not exist.
 *   2. **Only contract-neutral assertions are migrated.** A v1 case that depends on
 *      the old open schema, the 0-100 scoring model, or the contaminated fixture is
 *      preserved as historical rather than ported. Porting it would give a green
 *      result about a contract that no longer exists.
 *   3. **Evidence is appended, never overwritten.** Case ids stay stable so a result
 *      can be compared across runs.
 */

export const ASSERTION_STATUSES = ['passed', 'failed', 'not-executed', 'historical'] as const;
export type AssertionStatus = (typeof ASSERTION_STATUSES)[number];

/** Why a v1 case was not migrated. Naming it prevents a silent drop. */
export const NON_MIGRATION_REASONS = [
  'depends-on-open-schema',
  'depends-on-scalar-scoring',
  'depends-on-contaminated-fixture',
  'depends-on-live-model',
  'depends-on-unbuilt-stage',
] as const;

export type NonMigrationReason = (typeof NON_MIGRATION_REASONS)[number];

export type Assertion = {
  /** Stable id, carried forward from the v1 workbook where one existed. */
  readonly case_id: string;
  readonly statement: string;
  /**
   * The check. Returning a boolean is deliberate: there is no way to register a
   * "passed" without supplying something that runs.
   */
  readonly check: () => boolean;
  /** Which Phase 1 artifact this exercises. */
  readonly covers: string;
};

export type HistoricalCase = {
  readonly case_id: string;
  readonly statement: string;
  readonly reason: NonMigrationReason;
  readonly note: string;
};

export type AssertionResult = {
  readonly case_id: string;
  readonly status: AssertionStatus;
  readonly statement: string;
  readonly covers?: string | undefined;
  /** Present when the check threw — a thrown check is `not-executed`, not `failed`,
   *  because we do not know what it would have concluded. */
  readonly error?: string | undefined;
  readonly reason?: NonMigrationReason | undefined;
};

export type RunReport = {
  readonly executed_at: string;
  readonly total_registered: number;
  readonly passed: number;
  readonly failed: number;
  readonly not_executed: number;
  readonly historical: number;
  readonly results: readonly AssertionResult[];
  /** True only when every registered assertion ran and passed. Deliberately strict:
   *  a `not-executed` is not a pass. */
  readonly clean: boolean;
};

export class AssertionRunner {
  private readonly assertions: Assertion[] = [];
  private readonly historical: HistoricalCase[] = [];

  register(assertion: Assertion): this {
    if (this.assertions.some((existing) => existing.case_id === assertion.case_id)) {
      throw new Error(`duplicate assertion case_id: ${assertion.case_id}`);
    }
    this.assertions.push(assertion);
    return this;
  }

  /** Records a v1 case that was **not** migrated, with the reason. */
  preserveHistorical(entry: HistoricalCase): this {
    this.historical.push(entry);
    return this;
  }

  run(now: string): RunReport {
    const results: AssertionResult[] = [];

    for (const assertion of this.assertions) {
      let status: AssertionStatus;
      let error: string | undefined;
      try {
        // The only path to a `passed`.
        status = assertion.check() ? 'passed' : 'failed';
      } catch (thrown: unknown) {
        // A check that threw did not conclude anything, so it is not a failure of
        // the thing under test — it is an absence of evidence.
        status = 'not-executed';
        error = thrown instanceof Error ? thrown.message : String(thrown);
      }
      results.push({
        case_id: assertion.case_id,
        status,
        statement: assertion.statement,
        covers: assertion.covers,
        ...(error === undefined ? {} : { error }),
      });
    }

    for (const entry of this.historical) {
      results.push({
        case_id: entry.case_id,
        status: 'historical',
        statement: entry.statement,
        reason: entry.reason,
      });
    }

    const count = (status: AssertionStatus): number =>
      results.filter((result) => result.status === status).length;

    return {
      executed_at: now,
      total_registered: this.assertions.length,
      passed: count('passed'),
      failed: count('failed'),
      not_executed: count('not-executed'),
      historical: count('historical'),
      results,
      clean: count('failed') === 0 && count('not-executed') === 0 && this.assertions.length > 0,
    };
  }
}

/**
 * Renders a report as an appendable record.
 *
 * Append-only by design (§17.3): a historical Results row is evidence of what was
 * believed at the time, and overwriting it destroys the ability to see a metric move.
 */
export function renderReport(report: RunReport): string {
  const lines = [
    `# Assertion run — ${report.executed_at}`,
    '',
    `Registered: ${report.total_registered} · passed ${report.passed} · failed ${report.failed} ` +
      `· not-executed ${report.not_executed} · historical (not migrated) ${report.historical}`,
    `Clean: ${report.clean ? 'yes' : 'no'}`,
    '',
    '| case | status | statement | note |',
    '|---|---|---|---|',
  ];
  for (const result of report.results) {
    const note = result.error ?? result.reason ?? '';
    lines.push(
      `| ${result.case_id} | ${result.status} | ${result.statement.replace(/\|/g, '\\|')} | ${note} |`,
    );
  }
  return lines.join('\n');
}
