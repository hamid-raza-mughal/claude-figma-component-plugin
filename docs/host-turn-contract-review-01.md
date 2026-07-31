# Adversarial Review 01 — host-turn workflow contract + spec-amendments v4

**Date:** 2026-07-30 · **Reviewer:** independent adversarial pass, briefed to attack the documents and to
verify every claim against source. **Subject:** `docs/host-turn-workflow-contract.md` and
`manage-ds-components-spec-amendments_v4.md` (both PROPOSED).

**Outcome: 8 blocking, 14 serious, 9 minor.** Recorded in full because the defect list is the working
backlog.

> ## Status after revision 2 — review pass 02, 2026-07-30
>
> **Pass 02 verdict on this list: 20 CLOSED · 8 PARTIAL · 1 REGRESSED.** It also raised **26 new findings**
> (4 blocking, 11 serious, 11 minor) against the fix itself.
>
> **B-3 REGRESSED.** The fix deleted `route_confirmed` and reintroduced the identical defect as
> `route_provenance` — a caller-supplied value from which `route_verified` was computed. The structural remedy
> had been applied to `run_id` in §2.2 and not to provenance three lines below it in the same table.
>
> **Four blocking items from pass 02 are now closed, with evidence:**
>
> | ID | Defect | Closure | Evidence |
> |---|---|---|---|
> | **N-4 / B-3** | `route_provenance` self-asserted | Provenance, `route_verified` and `run_type` are all **Guard-derived and absent from `beginRun`'s type** | contract §2.10.3, §2.10.3.1, G-15, §13 |
> | **N-1** | Composition assigned to `presentForApproval`, which cannot work — `composeTrustedOutput` returns the three-way verdict `submitDraft` declares, and its failure evidence *is* composition output | Composition moved to `submitDraft`; `presentForApproval` reads and renders only | §4.4, §4.5, §10, §13. Verified `compose-trusted-output.ts:124` returns `CompositionResult`, `:132` `composed_at` inside the hash |
> | **N-2** | A `blocked` composition could be approved and closed `completed`, bypassing clarification | **G-19a** refuses presenting a non-`ready` artifact; **G-19b** refuses `completed` when `next_route` is null; new `validating → terminal` (blocked) row | §4.6, §10, G-19a/b. Verified `compose-trusted-output.ts:182` + `resolution.ts:213`: a blocking gap yields `ok` with `next_route: null` |
> | **N-3** | G-5 pooled the repair budget with clarification and changes-requested, bricking the run | G-5 scoped to repair re-entries only; the budget check stays on the `validating → drafting` row | G-5, §6.6 |
>
> Also fixed: **N-7** (`runMaintenance` stranded — §12.2.1 scopes G-11 to phase-scoped tools), **N-11**
> (`run_type` derived from `operation_id`), **N-20** (`openClarification{run_id}` only; gaps read from the
> draft).
>
> **NOT relocked.** 11 serious and 11 minor pass-02 findings are open, including **N-5** (the
> `ApprovalRecord` widening breaks a fourth closed schema, `run-envelope.schema.json:57–79`), **N-6**
> (`render-machine-handoff.ts:73` still asserts a human approval is required), **N-8** (§4's table contradicts
> §10 on six of eight rows), **N-9** (nothing can call `expireRun`), **N-10** (a source refresh can invalidate
> a paused run that then closes `completed`), **N-15** (register §E still contradicts SA-41/SA-42).
>
> **Pattern worth naming:** each pass closes most findings and introduces new ones of the same *class* — a
> self-asserted trust field, a tool stranded by its own derivation rule, two accounts of one fact. The classes
> recur even as the instances are fixed, which is the argument for a third pass rather than a lock.

**Why this exists.** The author's own verification pass before this review checked that every `§` citation
*resolved* — not that the cited clause *supported the claim*. That is the failure mode already recorded in
this project's history as *validate logic, not syntax*, repeated. A green cross-reference check was allowed
to stand in for correctness.

**Independently re-verified by the author** (not taken on the reviewer's word): **B-6** — `SA-2` targets
`synthesizer_agent_spec.md` (`spec-amendments_v3.md:39`) and `runtime-diagrams_v3.md:73` routes
`SY -->|"GapReport"| RV`, so Reviewer receives `GapReport`, **not** the evidence bundles. Confirmed.
**M-1** — the approval line is `render-approval-view.ts:66`, the **fifth** line (run id, route/status,
snapshot, blank precede it), and its full text ends `You are approving intent only.` Confirmed.

---

## Two findings are decisions, not repairs

**B-1 and B-3 cannot be fixed by editing the document.** They establish that two guarantees the design
claims are unenforceable in this runtime. They need a ruling: declare the limit, or add a mechanism.

### B-1 · BLOCKING · Gate 1 is not a gate

`recordApproval{run_id, decision, approved_by}` takes all three from its caller, which in a host turn is the
model. A turn can call `presentForApproval` then `recordApproval{decision:'approved'}` back to back with no
human involved, and the durable record is indistinguishable from a real approval. Every downstream guarantee
— G-7, G-8, §9.1 `completed` — is then satisfied by a fabricated record.

§7.6 concedes only that `approved_by` is "host-asserted and unverified" and frames it as **attribution**. The
exposure is **authorization**. §18.1's three options are all record-keeping; the one that is actually a
control (hash-prefix challenge) is foreclosed by §16.1, which forbids showing hashes to designers.

**Enforceable form, if wanted:** a nonce minted by `presentForApproval`, rendered only to the human, required
back in `recordApproval`. Requires B-2. **Otherwise** §7.1 must read *advisory in Phase 2*.

### B-2 · BLOCKING · The contract is named after the turn; the turn is invisible to the schema

§3.1 defines the turn boundary, §3.2 asserts a two-turn minimum, §3.3 defines an abandoned turn, §7.3
re-verifies a hash "because between the two the turn ended." §11.2 has no `turn_id`, no host identifier, no
per-turn column. Deterministic code cannot detect that a turn started, ended, or is the same turn as the last
call. §3.2 is unenforceable, §3.3 collapses into wall-clock staleness, G-12 can only fire on elapsed time.

**Author's note:** B-1 and B-2 share one root the review states separately and which is larger than either —
**the host turn is invisible to the tools inside it.** Tools cannot observe the turn boundary and cannot
observe a human. This is the same class of fact as unmeasurable `token_metrics` (SA-33): something the
architecture cannot do, which must be **declared rather than engineered around.**

### B-3 · BLOCKING · The D3 reconciliation is a relabelling, not a distinction

`beginRun` takes `{operation_id, route_confirmed}`; `route_confirmed` is caller-supplied. §5.3 already states
the governing principle — *"A model that could report its own round count could reset it"* — and §2.10 does
not apply it to itself. §13.1 ("no tool accepts a count, a phase, or an attempt number from its caller")
exempts `route_confirmed` without argument. §11.2 has **no column** for it, so G-15 cites a confirmation
record the schema does not contain.

Worse: D3's guarantee as written in `invocation.ts:6–10` is *"blocks before any model invocation, so a
misrouted run cannot exist."* **In a host-turn runtime the model invocation has already happened before any
tool runs.** D3's stated mechanism is falsified by precisely the argument SA-29 uses to kill "sole
dispatcher" — deterministic code sits below the model in the call stack. Both documents apply that test to
the Controller and not to D3.

**Options:** downgrade §2.1/§2.10 to accepted-residual-risk alongside §1.3, **or** adopt §18.6's second
option — confirmation restates the route as a literal string stored verbatim beside the inferred proposal, so
the record holds two independently written values.

---

## Blocking repairs

| ID | Defect | Fix |
|---|---|---|
| **B-4** | `openClarification`, `presentForApproval`, `resumeRun`, `resolveCommand` are in §13 and in **no** §12.2 phase surface, so G-11 makes them uncallable. §12.2 gives `validating` "none". The run can never reach a gate. Symmetrically, `closeRun` is registered only in `handoff-ready`, so `blocked` and `cancelled` cannot be recorded from the phases §10 places them in | Rebuild §12.2 mechanically from §10: every trigger tool registered in its `From` phase; every §10 row gets a named tool |
| **B-5** | `failed` is unreachable — §10 has no `received/preparing/drafting/validating → terminal` rows, so every terminal failure §8 mandates is illegal under G-1. And `rejected` (§7.5) maps to no member of `RUN_OUTCOMES`, which is closed at five (`run-envelope.ts:42`). §10 also names `cancelled` as an approval decision §7.5's enum lacks, with no `cancelRun` tool | Add the `→ terminal` rows with outcomes; decide whether `rejected` maps to `blocked` or `cancelled` and record it; add a cancellation tool or remove cancellation |
| **B-6** | §18.5 / SA-39 cite Reviewer's input as `BuildEvidenceBundle`/`AuditEvidenceBundle`. **SA-2 targets the Synthesizer**; Reviewer receives `GapReport`. Neither bundle exists in code. SA-39 also concedes the ordering — "User ruling" first, structure appended as "independent of the ruling" — which the contract then promotes to "**Settled:**", lending a preference the look of necessity | Cite `GapReport` (`runtime-diagrams_v3.md:73`) or drop the structural paragraph; the ruling plus the promotion criterion carry the decision unaided |
| **B-7** | SA-37 enumerates `component.review` as an authoritative operation ID; SA-39 and §2.7 forbid it. An implementer building the registry from SA-37 ships the operation SA-39 bans | Strike `component.review` from SA-37 |
| **B-8** | `clarification_round_count` and `repair_call_count` appear in **no** §11.2 column, yet §5.3/§6.3/§13.1 insist budgets are read from durable state — G-5 and G-6 refuse on values the schema cannot hold. Also §6.2/§10 scope repair *per failure* while `RunEnvelope.repair_call_count` is a scalar (`run-envelope.ts:160`) | Fold from `run_event` and delete the "read from durable state" wording, or add derived columns. Decide per-run vs per-failure and align §6.2, §10 and the Phase 1 type |

---

## Serious

- **S-1** `ClarificationGap.opened_in_round` is **required of the model** by a shipped closed schema
  (`coordinator-output.schema.json:68,78`, `maximum: 3`; `$ref`'d by the draft schema) and is not in
  `OPERATIONAL_FIELD_NAMES`, so `findOperationalLeaks` misses it. The model authors a round number — the exact
  situation §5.3 forbids — and it duplicates the Guard's `clarification.round` with no reconciliation rule.
  The schema's `maximum: 3` also silently pre-empts §18.2's open override.
- **S-2** Adding `run-guard` to `ENFORCEMENT_OWNERS` edits `failures.ts:60–67` **and** a hard-coded enum in
  `coordinator-output.schema.json:159–168` — a closed schema listed as Implemented in the Phase 1 handoff.
  Neither file is in v4 §F. §2.7.1 boasts of not widening `invocation.ts` while this widens another closed
  contract silently.
- **S-3** `approval.approved_by_verified` is not on `ApprovalRecord` (`run-envelope.ts:122–131`), and
  `renderMachineHandoff` embeds the record verbatim (`render-machine-handoff.ts:32,95`), so §7.6's required
  qualification cannot reach a receiving stage. Not in §F.
- **S-4** §E's "touches nothing that was built" is false. `list-by-category.ts:22,53` defines
  `CALLER_CONTROLLER = 'controller'` as its only ownership check; `resolution.ts:170,202` include
  `'controller'` in two closed union types; `run-envelope.ts:9` names "Phase 2 Runtime Controller work".
- **S-5** `list_by_category`'s privilege is a caller-supplied string with one published value. §4.1 and SA-18
  lean on it as enforcement; it is real only because of the §12.2 surface exclusion. Say so.
- **S-6** No tool in §13 is stated to run `composeTrustedOutput` or write the `artifact` row, yet the hash
  every approval binds is the composed output's. Recomposition is not available — `composed_at` is inside the
  hashed object (`compose-trusted-output.ts:132`). Related: `canonical()` sorts with
  `localeCompare(a,b,'en')` (line 109), so on a small-ICU Node build §7.3's re-verify can fail across
  environments for a byte-identical artifact.
- **S-7** No concurrency rule. The v4 ruling explicitly permits invocation from multiple hosts, so two turns
  can resume one `run_id`; `resumeRun` acquires no lease and nothing does CAS on `last_event_seq`.
- **S-8** SA-31 makes the store a precondition ("enforcement is vacuous without it") without stating which
  permitted hosts can run local code against a writable filesystem. That is a capability gate of FD-1…FD-4
  weight, ungated.
- **S-9** Nothing makes the `run_event` append and the `run_state` update one transaction, and nothing
  requires recomputing from the fold on resume — a crash between them leaves a live run reading stale state.
  Also `tool_invocation` is keyed on `run_id`, so `resolveCommand` and G-3/G-14 refusals occurring *before a
  run exists* cannot be recorded — defeating §13.2's own rationale.
- **S-10** §11.1 cites D-F for two-accounts-plus-a-test. **D-F chose derivation** precisely so the two
  "cannot drift" (`composition-sequence.ts:33`, `phase1-decision-log.md:176`). Opposite disciplines; §18.4
  already suspects as much.
- **S-11** §16.1 bans hashes, phase names and run ids from designer-facing text, but the Phase-1-validated
  approval view prints `Run ${run_id}` (`render-approval-view.ts:56`) and the binding sha (line 198), §16.2
  gives the sha a designer-facing form, and §18.1 proposes showing a hash prefix.
- **S-12** §2.4 says `new` requires `target` absent; `resolveInvocation` checks only the other direction and
  **silently drops** `target` for `new` (`invocation.ts:150–164`). No error code, no Guard rule — the
  invisible-edit failure mode §2.3 objects to.
- **S-13** G-4 refuses "a model-supplied `run_id`", but `beginRun` takes `RawInvocation`, which has
  `run_id?: unknown` (`invocation.ts:109`), and provenance is undetectable. The rule must be structural — the
  field absent from the signature — not a refusal.
- **S-14 · Unadmitted authority leaks.** §1.3 admits one; these are stated as "must" while being enforceable
  only if the model cooperates: **§2.3** `user_intent` verbatim (no deterministic code sees the raw user
  message, so a tidied intent is undetectable — the purest case); **§5.4** "re-authored, never patched" (the
  Guard cannot tell the difference); **§3.1/§3.2** the turn boundary (see B-2); **§4.2** "no tool calls in
  drafting" — §12.2 registers `submitDraft` for "preparing / drafting", so the model may submit without
  reading the assembled context, and §10 has no `preparing → validating` row; **all of §16** — the entire
  designer-facing surface is model-executed prose with no enforcement point.

---

## Minor

- **M-1** §7.7/§16.4 misquote the approval line (omitting *"You are approving intent only."*) and call it the
  opening; it is the fifth line. §7.7 forbids softening it while quoting a softened form. Inherited from
  `phase1-handoff-evidence.md:226` — fix both.
- **M-2** `renderingsAgree()` recomputes from the object passed in (`render-machine-handoff.ts:107–114`), so a
  Guard deriving all three values from one stored `canonical_json` makes G-10 a tautology. Also enforced
  twice (§13 `buildHandoff` and G-10), against §8.5's one-owner rule. §9.2 quotes "before dispatch" while
  relocating the call.
- **M-3** §16.5 credits the renderer; the weakest-child rule is `aggregateConfidence`
  (`coordinator-output.ts:169–176`), computed at composition step 8.
- **M-4** §16.2 maps "`AuditReadyOutput`, findings with owner tags → the findings". `AuditReadyOutput`
  (`coordinator-output.ts:78–90`) has **no findings** — those are Synthesizer output, out of Phase 2 scope.
- **M-5** §4's preamble ("no phase a turn can enter by narrating") is falsified by its own table: two of
  eight rows are return-triggered, including entry to `drafting`.
- **M-6** §11.1 prose puts derived state in the `run` row; §11.2 puts it in `run_state`.
- **M-7** `latency_by_stage_ms` (§11.4) has no column. `RunEnvelope.prompt_version` is neither in the schema
  nor in §11.3's deliberately-absent list.
- **M-8** G-11 cites §4, which defines no tool surfaces — §12.2 does. G-6 cites §5.2 (the number) rather than
  §5.3 (the enforcement rule). Against §10's own "an uncited rule is a rule someone invented".
- **M-9** v4 places SA-36 after SA-39, breaking numeric order in a register keyed by ID.

---

## Verified correct

Recorded so the tested surface is distinguishable from the untested. `RUN_TYPES` closed at three
(`invocation.ts:14`) · `invocation.ts` unchanged by these proposals · `ENFORCEMENT_OWNERS` exactly the six
quoted with no transition/budget/approval owner (`failures.ts:60–67`) · `FAILURE_IS_REPAIRABLE` only
`validation-failure`, and `FAILURE_IS_TERMINAL` matching §8 on all seven rows (`failures.ts:33–54`) ·
`FailureEvidence.enforced_by` required · `ClarificationGap.state` semantic and the sole path-scoped exemption,
with `RunEnvelope.state` still forbidden (`run-envelope.ts:230–242`) · `COMPOSITION_STEPS` = 10 and
`SPEC_16_1_SEQUENCE` = 11 derived, D-F correctly cited · `renderingsAgree()` exists · `STAGE_PHASES` = 8,
`RUN_OUTCOMES` = 5, `coordinator` mapped to all eight · `GATE_MODES` contains both values so G-9 refuses a
real one · `findOperationalLeaks` returns all leaks · every unit §4.1 attributes to `prepareContext` exists as
a Phase 1 module · `AuditReadyOutput.next_route` is the literal `'synthesizer'` and the composer writes the
literal · the Phase 1 §20 not-claimed list · v4's arithmetic (SA-29…SA-39 = 11; 28 + 11 = 39).

**Unverifiable:** `BuildEvidenceBundle`/`AuditEvidenceBundle` exist only in specs, never in code.
**P1-FINAL §15.5**, the authority §6.2 cites for the one-repair budget — P1-FINAL was not in scope for the
reviewer; unchecked. §2.7.0.1's "review"/`reviewer` test is prospective, not built.
