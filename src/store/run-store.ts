/**
 * The durable run/event store (§11) — `run` (immutable after `beginRun`) and
 * `run_event` (append-only, sole authority, §11.1). Artifact/approval/etc.
 * tables exist in the schema (§11.2/§11.5) but their read/write methods are
 * added where WP6/WP7 first need them, not speculatively here.
 *
 * Every method that touches `run_event` either succeeds completely or throws
 * `StoreAppendError` — **never** partial (§11.6.1: the log append and any
 * dependent write commit together or not at all). A caller that catches
 * `StoreAppendError` must terminate the run `hard-dependency-failure` (G-20b)
 * and must not continue from in-memory state.
 */
import { DatabaseSync } from 'node:sqlite';
import { STORE_SCHEMA_SQL } from './schema.ts';
import type { RunEventRow } from '../guard/fold.ts';
import type { RunEventKind } from '../registry/transitions.ts';
import type { StagePhase } from '../contracts/run-envelope.ts';
import type { RunType } from '../contracts/invocation.ts';
import type { RouteProvenance } from '../guard/provenance.ts';
import { GuardRefusal } from '../guard/errors.ts';

export type RunRow = {
  readonly run_id: string;
  readonly display_id: string;
  readonly operation_id: string;
  readonly run_type: RunType;
  readonly route_provenance: RouteProvenance;
  readonly route_verified: boolean;
  readonly user_intent: string;
  readonly target_ref: string | null;
  readonly requested_at: string;
  readonly source_sha256: string;
  readonly index_version: string;
  readonly spec_schema_version: string;
  /** Provenance only — never read by the Guard (G-17, §11.2). */
  readonly invoked_as: string;
};

export class StoreAppendError extends Error {
  override readonly name = 'StoreAppendError';
  constructor(message: string) {
    super(message);
  }
}

export class RunAlreadyExistsError extends Error {
  override readonly name = 'RunAlreadyExistsError';
}

export type ArtifactRow = {
  readonly run_id: string;
  readonly artifact_sha256: string;
  readonly composed_at: string;
  readonly superseded_at: string | null;
  readonly canonical_json: string;
};

export type ApprovalRow = {
  readonly run_id: string;
  readonly gate: 'gate-1-semantic' | 'gate-2-acceptance';
  readonly gate_mode: string;
  readonly approved_artifact_sha256: string;
  readonly decision: 'approved' | 'rejected' | 'changes-requested';
  readonly approved_at: string;
  readonly approved_by: string;
  readonly response_source: string;
  readonly verified: boolean;
  readonly authorizing: boolean;
};

export type AppendResult = { readonly ok: true; readonly seq: number } | { readonly ok: false; readonly reason: 'cas-conflict' };

type RunEventRowRaw = {
  run_id: string;
  seq: number;
  at: string;
  kind: string;
  from_phase: string | null;
  to_phase: string | null;
  payload_json: string;
};

function toRunEventRow(raw: RunEventRowRaw): RunEventRow {
  return {
    seq: raw.seq,
    run_id: raw.run_id,
    at: raw.at,
    kind: raw.kind as RunEventKind,
    from_phase: raw.from_phase as StagePhase | null,
    to_phase: raw.to_phase as StagePhase | null,
    payload: JSON.parse(raw.payload_json) as Record<string, unknown>,
  };
}

export class RunStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(STORE_SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  /** Immutable after this call — no `updateRun` method exists to omit. */
  createRun(row: RunRow): void {
    try {
      this.db
        .prepare(
          `INSERT INTO run (run_id, display_id, operation_id, run_type, route_provenance,
             route_verified, user_intent, target_ref, requested_at, source_sha256,
             index_version, spec_schema_version, invoked_as)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.run_id,
          row.display_id,
          row.operation_id,
          row.run_type,
          row.route_provenance,
          row.route_verified ? 1 : 0,
          row.user_intent,
          row.target_ref,
          row.requested_at,
          row.source_sha256,
          row.index_version,
          row.spec_schema_version,
          row.invoked_as,
        );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE/i.test(message)) {
        throw new RunAlreadyExistsError(`run_id "${row.run_id}" or display_id "${row.display_id}" already exists.`);
      }
      throw new StoreAppendError(`createRun failed: ${message}`);
    }
  }

  getRun(runId: string): RunRow | undefined {
    const row = this.db.prepare('SELECT * FROM run WHERE run_id = ?').get(runId) as
      | (Omit<RunRow, 'route_verified'> & { route_verified: number })
      | undefined;
    if (row === undefined) return undefined;
    return { ...row, route_verified: row.route_verified === 1 };
  }

  displayIdExists(displayId: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM run WHERE display_id = ?').get(displayId);
    return row !== undefined;
  }

  /** §2.5: resumption re-enters a run by run_id or display_id. */
  getRunByDisplayId(displayId: string): RunRow | undefined {
    const row = this.db.prepare('SELECT * FROM run WHERE display_id = ?').get(displayId) as
      | (Omit<RunRow, 'route_verified'> & { route_verified: number })
      | undefined;
    if (row === undefined) return undefined;
    return { ...row, route_verified: row.route_verified === 1 };
  }

  /** The seq to use for the *next* append — 0 if the run has no events yet. */
  getMaxSeq(runId: string): number {
    const row = this.db.prepare('SELECT MAX(seq) AS max_seq FROM run_event WHERE run_id = ?').get(runId) as
      | { max_seq: number | null }
      | undefined;
    return row?.max_seq ?? 0;
  }

  getEvents(runId: string): readonly RunEventRow[] {
    const rows = this.db
      .prepare('SELECT run_id, seq, at, kind, from_phase, to_phase, payload_json FROM run_event WHERE run_id = ? ORDER BY seq ASC')
      .all(runId) as RunEventRowRaw[];
    return rows.map(toRunEventRow);
  }

  /**
   * §13.2: every tool call is recorded, success or refusal — a refusal that
   * leaves no trace is indistinguishable from a call never made. `runId` is
   * nullable because `resolveCommand` and a refused `beginRun` happen before
   * a run exists (§11.2) — keying on `run_id` would make exactly the
   * refusals this table exists to record unrecordable.
   */
  logToolInvocation(
    runId: string | null,
    tool: string,
    invokedAt: string,
    durationMs: number,
    ok: boolean,
    errorCode: string | null,
  ): void {
    this.db
      .prepare(
        'INSERT INTO tool_invocation (run_id, tool, invoked_at, duration_ms, ok, error_code) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(runId, tool, invokedAt, durationMs, ok ? 1 : 0, errorCode);
  }

  getToolInvocations(runId: string | null): readonly {
    readonly tool: string;
    readonly invoked_at: string;
    readonly duration_ms: number;
    readonly ok: boolean;
    readonly error_code: string | null;
  }[] {
    const sql =
      runId === null
        ? 'SELECT tool, invoked_at, duration_ms, ok, error_code FROM tool_invocation WHERE run_id IS NULL ORDER BY op_seq ASC'
        : 'SELECT tool, invoked_at, duration_ms, ok, error_code FROM tool_invocation WHERE run_id = ? ORDER BY op_seq ASC';
    const rows = (runId === null ? this.db.prepare(sql).all() : this.db.prepare(sql).all(runId)) as {
      tool: string;
      invoked_at: string;
      duration_ms: number;
      ok: number;
      error_code: string | null;
    }[];
    return rows.map((row) => ({ ...row, ok: row.ok === 1 }));
  }

  /**
   * §4.4/§11.2: written once per version, by `submitDraft`, on a `ready`
   * composition. History is retained — a voided artifact must stay readable
   * to explain a void approval — so an existing non-superseded artifact for
   * this run is marked `superseded_at` rather than deleted or overwritten,
   * in the same transaction as the new insert (§11.6.1).
   */
  putArtifact(runId: string, artifactSha256: string, composedAt: string, canonicalJson: string): void {
    try {
      this.db.exec('BEGIN');
      this.db
        .prepare('UPDATE artifact SET superseded_at = ? WHERE run_id = ? AND superseded_at IS NULL')
        .run(composedAt, runId);
      this.db
        .prepare(
          'INSERT INTO artifact (run_id, artifact_sha256, composed_at, superseded_at, canonical_json) VALUES (?, ?, ?, NULL, ?)',
        )
        .run(runId, artifactSha256, composedAt, canonicalJson);
      this.db.exec('COMMIT');
    } catch (error: unknown) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Rollback outside a transaction throws; the original error matters.
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new StoreAppendError(`putArtifact failed for run "${runId}": ${message}`);
    }
  }

  /**
   * §11.6.1: the `run_event` append and its dependent `artifact` write commit
   * together or not at all. `submitDraft`'s own two writes (event, then
   * artifact on `ready`) were previously two separate statements — correct
   * order, but not atomic, so a failure in the second left a committed
   * `draft-submitted` event with no artifact behind it. This is the fix:
   * one transaction, and a CAS conflict on the event rolls back the artifact
   * write too, exactly as if neither had been attempted.
   */
  appendEventAndPutArtifact(
    runId: string,
    seq: number,
    at: string,
    kind: RunEventKind,
    fromPhase: StagePhase | null,
    toPhase: StagePhase | null,
    eventPayload: Readonly<Record<string, unknown>>,
    artifactSha256: string,
    canonicalJson: string,
  ): AppendResult {
    try {
      this.db.exec('BEGIN');
      this.db
        .prepare(
          'INSERT INTO run_event (run_id, seq, at, kind, from_phase, to_phase, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(runId, seq, at, kind, fromPhase, toPhase, JSON.stringify(eventPayload));
      this.db
        .prepare('UPDATE artifact SET superseded_at = ? WHERE run_id = ? AND superseded_at IS NULL')
        .run(at, runId);
      this.db
        .prepare(
          'INSERT INTO artifact (run_id, artifact_sha256, composed_at, superseded_at, canonical_json) VALUES (?, ?, ?, NULL, ?)',
        )
        .run(runId, artifactSha256, at, canonicalJson);
      this.db.exec('COMMIT');
      return { ok: true, seq };
    } catch (error: unknown) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Rollback outside a transaction throws; the original error matters.
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE|PRIMARY KEY/i.test(message)) return { ok: false, reason: 'cas-conflict' };
      throw new StoreAppendError(`appendEventAndPutArtifact failed for run "${runId}" seq ${seq}: ${message}`);
    }
  }

  /** The current (non-superseded) artifact, or `undefined` if none exists yet. */
  getCurrentArtifact(runId: string): ArtifactRow | undefined {
    return this.db
      .prepare('SELECT * FROM artifact WHERE run_id = ? AND superseded_at IS NULL')
      .get(runId) as ArtifactRow | undefined;
  }

  /** Every version, oldest first — a voided artifact stays readable. */
  getArtifactHistory(runId: string): readonly ArtifactRow[] {
    return this.db
      .prepare('SELECT * FROM artifact WHERE run_id = ? ORDER BY composed_at ASC')
      .all(runId) as ArtifactRow[];
  }

  /**
   * §7.2/§7.4: `gate_mode: 'authorising'` (G-9a) and `verified`/`authorizing:
   * true` (G-9b) are refused **at the one place any approval row is
   * written**, not merely absent from a caller-facing parameter. Phase 2's
   * own tools never construct either — `recordApproval`'s parameters give a
   * caller no field to supply them through — but this is the backstop PD-5
   * named and this file had not, until now, actually implemented: a Guard
   * rule that is only ever satisfied by the absence of a code path that
   * could violate it is not yet an enforced rule.
   */
  private assertApprovalGuardRules(row: ApprovalRow): void {
    if (row.gate_mode === 'authorising') {
      throw new GuardRefusal('G-9a', `Run "${row.run_id}": gate_mode "authorising" is refused in Phase 2 (§7.2).`);
    }
    if (row.verified || row.authorizing) {
      throw new GuardRefusal(
        'G-9b',
        `Run "${row.run_id}": an approval row with verified or authorizing true is refused in Phase 2 (§7.4).`,
      );
    }
  }

  /** §7.4: `response_source`/`verified`/`authorizing` are always
   *  `'model-relayed'`/`false`/`false` in Phase 2 — this method's caller
   *  constructs them, never the tool's own caller (G-9b is structural: the
   *  public tool input has no field for a caller to supply them through). */
  putApproval(row: ApprovalRow): void {
    this.assertApprovalGuardRules(row);
    try {
      this.db
        .prepare(
          `INSERT INTO approval (run_id, gate, gate_mode, approved_artifact_sha256, decision,
             approved_at, approved_by, response_source, verified, authorizing)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.run_id,
          row.gate,
          row.gate_mode,
          row.approved_artifact_sha256,
          row.decision,
          row.approved_at,
          row.approved_by,
          row.response_source,
          row.verified ? 1 : 0,
          row.authorizing ? 1 : 0,
        );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new StoreAppendError(`putApproval failed for run "${row.run_id}": ${message}`);
    }
  }

  /**
   * §11.6.1's atomicity, extended to `approval` the same way
   * `appendEventAndPutArtifact` extends it to `artifact`: `recordApproval`
   * previously wrote the `approval` row and then the `run_event` as two
   * separate statements, in that order — so a CAS conflict on the event left
   * a committed approval with no event explaining when or why it exists.
   * One transaction; a CAS conflict rolls back the approval write too.
   */
  appendEventAndPutApproval(
    runId: string,
    seq: number,
    at: string,
    kind: RunEventKind,
    fromPhase: StagePhase | null,
    toPhase: StagePhase | null,
    eventPayload: Readonly<Record<string, unknown>>,
    approval: ApprovalRow,
  ): AppendResult {
    this.assertApprovalGuardRules(approval);
    try {
      this.db.exec('BEGIN');
      this.db
        .prepare(
          'INSERT INTO run_event (run_id, seq, at, kind, from_phase, to_phase, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(runId, seq, at, kind, fromPhase, toPhase, JSON.stringify(eventPayload));
      this.db
        .prepare(
          `INSERT INTO approval (run_id, gate, gate_mode, approved_artifact_sha256, decision,
             approved_at, approved_by, response_source, verified, authorizing)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          approval.run_id,
          approval.gate,
          approval.gate_mode,
          approval.approved_artifact_sha256,
          approval.decision,
          approval.approved_at,
          approval.approved_by,
          approval.response_source,
          approval.verified ? 1 : 0,
          approval.authorizing ? 1 : 0,
        );
      this.db.exec('COMMIT');
      return { ok: true, seq };
    } catch (error: unknown) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Rollback outside a transaction throws; the original error matters.
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE|PRIMARY KEY/i.test(message)) return { ok: false, reason: 'cas-conflict' };
      throw new StoreAppendError(`appendEventAndPutApproval failed for run "${runId}" seq ${seq}: ${message}`);
    }
  }

  /** Most recent approval row, or `undefined` if none has been recorded. */
  getLatestApproval(runId: string): ApprovalRow | undefined {
    const row = this.db
      .prepare('SELECT * FROM approval WHERE run_id = ? ORDER BY op_seq DESC LIMIT 1')
      .get(runId) as (Omit<ApprovalRow, 'verified' | 'authorizing'> & { verified: number; authorizing: number }) | undefined;
    if (row === undefined) return undefined;
    return { ...row, verified: row.verified === 1, authorizing: row.authorizing === 1 };
  }

  /**
   * §2.11.1: every `run_id` immutably pinned to `sourceSha256` — both
   * terminal and non-terminal. The caller (the Guard's maintenance flow)
   * folds each to decide which are still non-terminal and therefore need a
   * `source-invalidated` marker; this method only answers "pinned to this
   * hash," which is a plain, immutable column read.
   */
  listRunIdsBySourceHash(sourceSha256: string): readonly string[] {
    const rows = this.db.prepare('SELECT run_id FROM run WHERE source_sha256 = ?').all(sourceSha256) as {
      run_id: string;
    }[];
    return rows.map((row) => row.run_id);
  }

  /** Every distinct `source_sha256` any run is pinned to — the candidate set
   *  a refresh must compare its new hash against (there is no single "old"
   *  hash to diff, since different runs can be pinned to different sources
   *  after more than one prior refresh). */
  listDistinctSourceHashes(): readonly string[] {
    const rows = this.db.prepare('SELECT DISTINCT source_sha256 FROM run').all() as { source_sha256: string }[];
    return rows.map((row) => row.source_sha256);
  }

  /**
   * CAS append (§11.6.2, G-13): the caller passes the `seq` it wants to write
   * (normally `getMaxSeq(runId) + 1`, read just before this call). If another
   * writer already committed that `seq`, the `PRIMARY KEY (run_id, seq)`
   * constraint fails the insert and this returns `{ok: false}` — refused, the
   * caller must re-read `getMaxSeq` and retry, never assume its stale read.
   *
   * Any *other* failure (disk full, corruption, closed handle) throws
   * `StoreAppendError` — per §11.0.3/G-20b, the caller must terminate the run
   * `hard-dependency-failure` and never continue from memory.
   */
  appendEvent(
    runId: string,
    seq: number,
    at: string,
    kind: RunEventKind,
    fromPhase: StagePhase | null,
    toPhase: StagePhase | null,
    payload: Readonly<Record<string, unknown>>,
  ): AppendResult {
    try {
      this.db
        .prepare(
          'INSERT INTO run_event (run_id, seq, at, kind, from_phase, to_phase, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(runId, seq, at, kind, fromPhase, toPhase, JSON.stringify(payload));
      return { ok: true, seq };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE|PRIMARY KEY/i.test(message)) {
        return { ok: false, reason: 'cas-conflict' };
      }
      throw new StoreAppendError(`appendEvent failed for run "${runId}" seq ${seq}: ${message}`);
    }
  }
}
