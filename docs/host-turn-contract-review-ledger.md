# Host-Turn Contract — Review Ledger

**The tracked authority for every review finding.** `docs/host-turn-contract-review-01.md` remains the
narrative record of pass 01; this file is the ledger and supersedes it for **status**.

**Date:** 2026-07-30 · **Passes recorded:** 01 (B/S/M, 31 findings) · 02 (N, 26 findings) · **Total 57.**

**Arithmetic, corrected.** `B-4 … B-8` is **five** repairs, not six. An earlier report said six; the count is
five and every aggregate below is derived from the rows in this file.

**Counting rule.** No aggregate may be quoted unless it is reproducible by counting rows here. `STATUS` is one
of `open` · `partial` · `closed` · `residual-risk-accepted` · `superseded`. A superseded finding stays visible
with a pointer. **No finding is ever deleted.**

**Root defect classes**, used in the `CLASS` column:

| Code | Class |
|---|---|
| **C1** | Self-asserted trust — a caller supplies a value whose purpose is to vouch for the caller |
| **C2** | Stranded reachability — a tool, transition or outcome unreachable, or owned twice |
| **C3** | Two accounts of one fact — the same fact maintained in two editable places |
| **C4** | Unenforceable requirement — a control that exists only as instruction text |
| **C5** | Mis-citation — evidence that does not support the claim it is attached to |
| **C6** | Undeclared contract widening — a closed type or schema changed without registration |
| **C7** | Overstated claim — a guarantee asserted more strongly than the mechanism supports |
| **C8** | Unverified host capability described as available |

---

## Status roll-up — GENERATED, do not hand-edit

Produced by `node tools/ledger-rollup.ts`, which parses the status marker off every row below. **The first
version of this table was hand-typed and was wrong in three of six rows** — while sitting directly under a rule
that counts must be mechanically reproducible. A retyped count is a second account of one fact, defect class
**C3**, committed inside the ledger that tracks C3. The generator is the fix; `--check` fails if this table
disagrees with the rows.

<!-- BEGIN GENERATED: tools/ledger-rollup.ts -->
| Pass | Findings | closed | partial | open | superseded |
|---|---|---|---|---|---|
| 01 — blocking `B-1…B-8` | 8 | 5 | 2 | 0 | 1 |
| 01 — serious `S-1…S-14` | 14 | 12 | 2 | 0 | 0 |
| 01 — minor `M-1…M-9` | 9 | 8 | 1 | 0 | 0 |
| 02 — blocking `N-1…N-4` | 4 | 4 | 0 | 0 | 0 |
| 02 — serious `N-5…N-15` | 11 | 0 | 3 | 8 | 0 |
| 02 — minor `N-16…N-26` | 11 | 2 | 0 | 9 | 0 |
| **Total** | **57** | **31** | **8** | **17** | **1** |

```
Blocking not fully closed (2): B-4, B-5
Serious not fully closed (13): S-3, S-6, N-5, N-6, N-7, N-8, N-9, N-10, N-11, N-12, N-13, N-14, N-15
RELOCKABLE: NO
```
<!-- END GENERATED -->

**Not relockable.** Relock requires zero blocking and zero serious. Two blocking remain partial (`B-4`, `B-5`)
and thirteen serious are open or partial. `residual-risk-accepted` is currently **0** — nothing has yet been
formally accepted as a residual risk.

---

## Pass 01 — Blocking

### B-1 · Gate 1 is not a gate · CLASS C7 · **closed**
**Claim.** `recordApproval` receives `decision` and `approved_by` from its caller, which in a host turn is the
model; a turn can present and approve back-to-back with no human, producing a record indistinguishable from a
real one. §7.6 of revision 1 framed this as *attribution*; the exposure is *authorization*.
**Evidence.** `src/contracts/run-envelope.ts` `ApprovalRecord` (`:122–131`) has no provenance field;
`schemas/shared/run-envelope.schema.json:57–80` requires `approved_by` with `minLength: 1` and nothing else.
**Affected.** contract §7, §9.1, §13; register SA-41.
**Closure.** Honest demotion, not a mechanism: §7.1 "observe-only and non-authorizing"; §7.4 carries
`response_source: 'model-relayed'`, `verified: false`, `authorizing: false`; §7.6 rejects the nonce as
"security theatre"; §7.6.1 blocks Builder on HD-1; §9.1 `completed` "carries no claim of human
authorization"; rules G-9b, G-9c. **Residual intake defect tracked separately as N-12.**

### B-2 · Turn boundaries invisible to the schema · CLASS C7 · **closed**
**Claim.** Revision 1 asserted a turn-boundary rule, a two-turn minimum, an "abandoned turn", and justified
hash re-verification by "the turn ended" — none observable by deterministic code, and the schema had no turn
column.
**Evidence.** No `turn_id` in any Phase 1 type or schema; nothing in `src/` observes host-turn lifecycle.
**Affected.** contract §3, §7.5, §11; register SA-42, SA-31.
**Closure.** §3.1 "All of that is removed"; §3.2 pause phases; §3.3 staleness from timestamps only; §3.4 turn
ids only under HD-3; §11.3 lists `turn_id` absent; §14.7. SA-31 carries a partial-withdrawal banner.

### B-3 · D3 reconciliation is a relabelling · CLASS C1 · **superseded** — replaced by N-4
**Claim.** Revision 1 claimed route inference does not violate D3 because the designer confirms — carried as
caller-supplied `route_confirmed: boolean`, refuted by the contract's own §5.3.
**Evidence.** `src/contracts/invocation.ts:6–10` states D3's mechanism as "blocks **before any model
invocation**", which in a host-mediated runtime has already occurred before any tool runs.
**Affected.** contract §2.10, §13; register SA-38 (withdrawn), SA-40.
**Status.** Revision 2 deleted `route_confirmed` **and reintroduced the identical defect as
`route_provenance`.** Tracked as **N-4**, which is closed. This row stays visible as the origin.

### B-4 · Four tools stranded; `closeRun` mis-registered · CLASS C2 · **partial**
**Claim.** `openClarification`, `presentForApproval`, `resumeRun`, `resolveCommand` appeared in §13 and in no
§12.2 surface, so G-11 made them uncallable and no run could reach a gate.
**Evidence.** revision 1 §12.2 gave `validating` the entry "none — the model is not in this phase".
**Affected.** contract §10, §12.2, §13.
**Closure so far.** §12.2 rebuilt from §10; §12.2.1 scopes G-11 to phase-scoped tools; `runMaintenance` given
a surface. **Remaining:** the derivation is still asserted in prose, not generated — the same table can drift
again. Closes fully only under the normative registry (convergence step 2).

### B-5 · `failed` unreachable · `rejected` unmapped · `cancelled` in the approval enum · CLASS C2 · **partial**
**Claim.** §10 had no `→ terminal` rows for most phases, so every terminal failure §8 mandates was illegal
under G-1; `rejected` mapped to no `RUN_OUTCOMES` member; `cancelled` was listed as an approval decision with
no tool.
**Evidence.** `run-envelope.ts:42` `RUN_OUTCOMES` closed at five; `ApprovalRecord.decision` is
`approved | rejected | changes-requested` (`:130`, mirrored `run-envelope.schema.json:69`).
**Affected.** contract §7.7, §8, §9.1, §10, §13.
**Closure so far.** `failRun`, `cancelRun`, `expireRun` added with rows; §9.1.1 maps `rejected → blocked`;
§7.7 removes `cancelled` from the approval enum. **Remaining:** no `drafting → terminal` row, so a terminal
failure class arising in `drafting` cannot be recorded; §9.1's "route capability-gated → blocked" is
unreachable (**N-22**).

### B-6 · SA-2 attributed to the Reviewer · CLASS C5 · **closed**
**Claim.** Revision 1 cited Reviewer's input contract as `BuildEvidenceBundle` / `AuditEvidenceBundle`.
**Evidence.** `manage-ds-components-spec-amendments_v3.md:39` — SA-2 targets `synthesizer_agent_spec.md`;
`manage-ds-components-runtime-diagrams_v3.md:73` — `SY -->|"GapReport"| RV`. Neither bundle type exists in
`src/**`.
**Affected.** contract §18.5; register SA-39.
**Closure.** Both now cite `GapReport`; "Settled" demoted to a stated post-hoc reinforcement of a user ruling.
Independently re-verified.

### B-7 · `component.review` listed in SA-37 · CLASS C3 · **closed**
**Claim.** SA-37 enumerated `component.review` as an authoritative operation ID while SA-39 and contract
§2.7.0 forbid it — an implementer building the registry from SA-37 ships the banned operation.
**Evidence.** register SA-37 vs SA-39, same document.
**Closure.** SA-37 now reads "**There is no `component.review`**", naming the earlier draft's error.

### B-8 · Budget counters absent from the schema · CLASS C3 · **closed**
**Claim.** §5.3/§6.3/§13.1 insisted budgets are read from durable state; no column held them. Repair was
scoped per-failure while the shipped type is a scalar.
**Evidence.** `run-envelope.ts:160` `repair_call_count: number`;
`schemas/shared/run-envelope.schema.json:116–121` `maximum: 1`.
**Affected.** contract §5.3, §6.2, §6.4, §11, §13.1.
**Closure.** §11.1 makes the event log the sole authority and folds all counters; §6.2 "**Per-run, not
per-failure**", corroborated by the schema's `maximum: 1`.

---

## Pass 01 — Serious

### S-1 · `opened_in_round` is model-authored · CLASS C3 · **closed**
**Claim.** A shipped closed schema **requires the model** to author a clarification round number, and it is
absent from `OPERATIONAL_FIELD_NAMES` so `findOperationalLeaks` misses it — the situation §5.3 forbids.
**Evidence.** `schemas/coordinator/coordinator-output.schema.json:68,78` (`minimum 1`, `maximum 3`, required);
`coordinator-judgment-draft.schema.json:25–29` `$ref`s the same `$def`.
**Closure.** §5.3.1 makes it **echo-only**; G-6b refuses a mismatch against the Guard-derived round; the Guard
never reads it as authority. Ceiling of 3 recorded in §5.2. **Gap-supply duplication tracked as N-20.**

### S-2 · Closed schema widened silently · CLASS C6 · **closed** — instance only; class continues as N-5
**Claim.** Adding `run-guard` to `ENFORCEMENT_OWNERS` edits a closed contract **and** a closed schema listed
as Implemented at handoff; neither was registered, while §2.7.1 boasted of not widening `invocation.ts`.
**Evidence.** `src/contracts/failures.ts:60–67`; `schemas/coordinator/coordinator-output.schema.json:159–168`.
**Closure.** contract §11.7 row 1; register SA-43 and §F. **Class not closed — see N-5.**

### S-3 · The unverified qualification cannot travel · CLASS C6 · **partial**
**Claim.** `approved_by_verified` sat in the store table but not on `ApprovalRecord`, and
`renderMachineHandoff` embeds the record verbatim, so a receiving stage sees a name with no flag.
**Evidence.** `src/rendering/render-machine-handoff.ts:32,95`.
**Closure so far.** §7.4.1 places the three flags **on the record**; registered in §11.7 and §F.
**Remaining:** **N-5** (the shared schema forbids the widening) and **N-6** (the renderer still asserts human
approval).

### S-4 · "touches nothing that was built" was false · CLASS C7 · **closed**
**Claim.** Three shipped artifacts name the retired Controller as an enforcement identity.
**Evidence.** `src/resolver/list-by-category.ts:22,53` (`CALLER_CONTROLLER = 'controller'`);
`src/contracts/resolution.ts:170,202` (`ClarificationGap.owner`, `Disclosure.owner` unions);
`src/contracts/run-envelope.ts:6` docstring "Phase 2 Runtime Controller work".
**Closure.** contract §11.7; register §E "**That was false**". **Line-number error tracked as N-16.**

### S-5 · `list_by_category` privilege is a password · CLASS C4 · **closed**
**Claim.** Ownership rests on a caller-supplied string with one value published in the source, while its own
docstring calls this enforcement.
**Evidence.** `src/resolver/list-by-category.ts:53` — `request.caller !== CALLER_CONTROLLER`.
**Closure.** §4.1 and §14.5 state the surface exclusion is the control and the caller check is not; SA-43
corrects SA-18. **Superseded in strength by convergence step 6 (HD-4), which requires a non-forgeable
boundary.**

### S-6 · Composition unowned · `localeCompare` portability · CLASS C2 · **partial**
**Claim.** No tool was stated to run `composeTrustedOutput` or write the `artifact` row, though every approval
binds its output; recomposition is impossible because `composed_at` is inside the hash.
**Evidence.** `src/coordinator/compose-trusted-output.ts:132` (`composed_at` inside the hashed object);
`:109` (`localeCompare(a, b, 'en')`).
**Closure so far.** Ownership assigned — first wrongly to `presentForApproval` (**N-1**), now to `submitDraft`
(§4.4, §4.5). **Remaining:** the collation risk is recorded (§13.3, §18.7) and **unresolved**.

### S-7 · No concurrency rule · CLASS C2 · **closed**
**Claim.** The ruling permits invocation from multiple hosts, so two turns can resume one `run_id`; nothing
took a lease or did compare-and-set.
**Evidence.** revision 1 §11 had no concurrency clause.
**Closure.** §11.6.2 requires CAS on the run's max `seq`; G-13 refuses a losing writer.

### S-8 · Store precondition ungated · CLASS C8 · **closed**
**Claim.** SA-31 states enforcement is vacuous without durable state, then never asks which hosts can provide
it.
**Closure.** **HD-2** named in §18 and SA-44. **Verification of actual host capability is convergence step 6.**

### S-9 · Atomicity · `tool_invocation` keyed on `run_id` · CLASS C2 · **closed**
**Claim.** Nothing made the append and the derived update one transaction; pre-run refusals could not be
recorded because the table keyed on a run that did not exist.
**Closure.** §11.6.1 one transaction; §11.2 makes `run_id` NULLABLE with the reason; §13.2.

### S-10 · D-F cited for the discipline D-F rejected · CLASS C5 · **closed**
**Claim.** §11.1 proposed two accounts plus an equality test and cited D-F, which chose derivation precisely
so the two could not drift.
**Evidence.** `src/coordinator/composition-sequence.ts:33`; `docs/phase1-decision-log.md:176`.
**Closure.** §11.1 deletes the materialized table; §18.4 marks the question CLOSED; the mis-citation is named.

### S-11 · §16.1 banned what the validated renderer prints · CLASS C7 · **closed**
**Claim.** §16.1 forbade run ids and hashes in designer-facing text while the validated approval view prints
both, and §16.2 gave the hash a designer-facing form.
**Evidence.** `src/rendering/render-approval-view.ts:56`, `:198`.
**Closure.** §16.1 rewritten and the error named.

### S-12 · `new` with a `target` silently discarded · CLASS C4 · **closed**
**Claim.** §2.4 required `target` absent for `new`; `resolveInvocation` checks only the other direction and
drops it with no error code.
**Evidence.** `src/contracts/invocation.ts:150–164`; no matching `InvocationErrorCode` at `:55–60`.
**Closure.** G-3b refuses it at the Guard; §2.4 names the silent-discard failure mode.

### S-13 · G-4's `run_id` refusal unenforceable · CLASS C1 · **closed**
**Claim.** A model can emit a valid UUID indistinguishable from a minted one; provenance is undetectable, so
refusal cannot work.
**Evidence.** `src/contracts/invocation.ts:109` — `run_id?: unknown` on `RawInvocation`.
**Closure.** §2.2 and §13 remove `run_id`/`display_id` from `beginRun`'s parameter type — structural, not a
refusal. **Side effects: N-13 (`display_id` unwritable), N-17 (Guard numbers reassigned).**

### S-14 · Five unadmitted authority leaks · CLASS C4 · **closed**
**Claim.** Five clauses were written as requirements while being enforceable only if the model cooperates.
**Closure.** §1.5 introduces the three tiers; §14 lists each — §14.1 (§2.3 verbatim intent), §14.3 (§4.2
drafting), §14.4 (§5.4 re-authoring), §14.6 (all of §16), §14.7 (turn identity). **Exhaustiveness is
contested — see N-9, N-10, N-14.**

---

## Pass 01 — Minor

| ID | Claim | Evidence | Class | Status | Closure |
|---|---|---|---|---|---|
| **M-1** | The approval line was misquoted (third sentence dropped) and called the opening line | `src/rendering/render-approval-view.ts:66` is the full three-sentence string and is the **fifth** rendered line | C5 | **closed** | §7.8 quotes all three sentences and states the position; `docs/phase1-handoff-evidence.md:226` still truncates it and is registered as a pending §F edit |
| **M-2** | `renderingsAgree()` was a tautology and had two enforcement owners | `render-machine-handoff.ts:107–114` recomputes `hashOutput(output)` for all three values | C2 | **partial** | §9.2 gives it one owner (G-10). The tautology is **not** removed — see **N-25** |
| **M-3** | Weakest-child confidence credited to the renderer | `src/contracts/coordinator-output.ts:169–176` `aggregateConfidence`, composition step 8 | C5 | **closed** | §16.5 corrected |
| **M-4** | §16.2 mapped findings onto `AuditReadyOutput`, which has none | `coordinator-output.ts:78–90` carries `audit_brief`, `extraction_coverage` only | C5 | **closed** | §16.2.1 removes the row |
| **M-5** | §4's preamble falsified by two rows of its own table | revision 1 §4 | C3 | **closed** | §4.0 admits both entry forms |
| **M-6** | §11.1 prose and §11.2 table disagreed on where derived state lives | revision 1 §11 | C3 | **closed** | No materialized table exists; both statements removed |
| **M-7** | `latency_by_stage_ms` had no column; `prompt_version` unlisted | `run-envelope.ts:164`, `:151` | C3 | **closed** | §11.2 `stage_latency`; §11.3 lists `prompt_version`. **N-18, N-19 remain** |
| **M-8** | G-11 and G-6 cited clauses that did not support them | revision 1 §12.1 | C5 | **closed** | G-11 → §12.2; G-6a → §5.3; G-6b → §5.3.1 |
| **M-9** | SA-36 ordered after SA-39 in a register keyed by ID | register order | C3 | **closed** | Order is now SA-35 · SA-36 · SA-37 · SA-38 · SA-39 · SA-40–44 |

---

## Pass 02 — Blocking

### N-1 · Composition assigned to a tool that cannot do it · CLASS C2 · **closed**
**Claim.** §4.4 assigned `composeTrustedOutput` to `presentForApproval`, but composition returns the three-way
verdict `submitDraft` declares, and its failure evidence *is* composition output — so `submitDraft` could not
produce its own return. Composing in both places yields two hashes, breaking "exactly once per artifact
version" by the argument that establishes it.
**Evidence.** `src/coordinator/compose-trusted-output.ts:124` returns `CompositionResult`; steps at
`:156–227`; `composed_at` inside the hashed object at `:132`.
**Closure.** §4.4 moves composition to `submitDraft`, which persists the `artifact` row on `ready`; §4.5
reduces `presentForApproval` to read-and-render; §10 and §13 updated. **See also N-Ownership items in step 5.**

### N-2 · A `blocked` artifact could be approved and closed `completed` · CLASS C2 · **closed**
**Claim.** No rule blocked presenting a draft carrying an active blocking gap. Such a draft composes
**successfully** with `next_route: null`, so a run could skip `openClarification` entirely and satisfy all
four §9.1 `completed` conditions — bypassing §5.5 rather than reaching it.
**Evidence.** `src/contracts/resolution.ts:208–215` (`isBlockingGap`, `hasBlockingGap`);
`src/coordinator/compose-trusted-output.ts:182` sets `proposedStatus = 'blocked'` and continues.
**Closure.** **G-19a** refuses `presentForApproval` unless the stored artifact's status is `ready`; **G-19b**
refuses `closeRun completed` when the bound artifact's `next_route` is null; §10 gains
`validating → terminal (blocked)`; §4.6 states the mechanism. Independently re-verified in source.

### N-3 · G-5 pooled the repair budget and bricked the run · CLASS C2 · **closed**
**Claim.** G-5 refused `submitDraft` whenever the run's repair was spent, but §10 re-enters `drafting` three
ways — repair, `answerClarification`, `changes-requested`. After one repair the latter two landed in a phase
whose only forward tool was refused, leaving `cancelRun` as the sole exit. Contradicts §6.6.
**Evidence.** revision 2 G-5 vs §10 rows and §6.6.
**Closure.** G-5 scoped to repair re-entries only; the budget check remains on the `validating → drafting`
row.

### N-4 · `route_provenance` is `route_confirmed` renamed · CLASS C1 · **closed**
**Claim.** `beginRun` accepted `route_provenance` from its caller and `route_verified` was a pure function of
it, so a model could pass `host-command-metadata` and mint its own verification — violating §13.1's own
absolute sentence three lines above the signature, exactly as revision 1 exempted `route_confirmed`.
**Evidence.** revision 2 §13 `beginRun` signature vs §13.1.
**Closure.** §2.10.3 makes `route_provenance` and `route_verified` **Guard-derived from HD-3 metadata read
directly**; §2.10.3.1 derives `run_type` from `operation_id`; G-15 refuses any attempt to supply any of the
three; §13's signature is reduced to `{operation_id, user_intent, target?}`. **Class-level check is
convergence step 3/9 — this closes the instance, not the class.**

---

## Pass 02 — Serious

### N-5 · The `ApprovalRecord` widening breaks a fourth closed schema · CLASS C6 · **open**
**Claim.** Adding `response_source`, `verified`, `authorizing` is rejected by the shared schema, which is
closed. Registered nowhere. S-2's exact class, caught once and missed here.
**Evidence.** `schemas/shared/run-envelope.schema.json:57–80` — `$defs/approvalRecord`,
`"unevaluatedProperties": false`, six required properties (`gate`, `gate_mode`,
`approved_artifact_sha256`, `approved_at`, `approved_by`, `decision`).
**Affected.** `src/contracts/run-envelope.ts:122–131`; the shared schema; contract §11.7; register SA-43, §F.
**Required fix.** Register the widening in **both** places; make all three fields **required**, since an absent
flag is indistinguishable from `false` and §7.4.1's argument is that the qualification must travel.

### N-6 · Shipped handoff code asserts verified human approval · CLASS C6 · **open**
**Claim.** §7.4 forbids describing the record as verified human authorization "not in the machine handoff",
and shipped code does exactly that in three places.
**Evidence.** `src/rendering/render-machine-handoff.ts:5–6` — the docstring says the shared hash makes *"the
human approved the artifact the next stage receives"* a checkable claim; `:30` — *"Present only when a human
has approved"*; `:73` — `'UNAPPROVED. A human approval binding this exact sha256 is required before any
write.'` **Three sites, one more than pass 02 reported.**
**Required fix.** Amend all three to model-relayed, unverified, non-authorizing language; add the file to
§11.7 and register §F.

### N-7 · `runMaintenance` stranded by the derivation rule · CLASS C2 · **partial**
**Claim.** In §13, in no surface, refused by G-11 — and §12.2's unqualified "iff" *guaranteed* the omission,
because §2.11 keeps maintenance out of §10 by design. B-4 repeated for one tool.
**Closure so far.** §12.2 gains a maintenance surface; §12.2.1 scopes G-11 to phase-scoped tools and names
`resolveCommand`, `resumeRun`, `runMaintenance` as non-phase-scoped.
**Remaining.** Still prose-asserted. Closes under the normative registry with a reachability test.

### N-8 · §4's table contradicts §10 on six of eight rows · CLASS C3 · **partial**
**Claim.** §4 omits `cancelRun` from four phases and `openClarification`/`presentForApproval`/`failRun`/
`cancelRun` from `validating`; its `terminal` row omits `recordApproval (rejected)` and `cancelRun`; and it
says `validating` is exited by "`submitDraft`'s verdict", true only for `repairable`.
**Closure so far.** §10 corrected. §4 partially.
**Required fix.** Generate §4's structural columns from the registry, or delete them and let §10 own the
machine — convergence step 2.

### N-9 · Nothing can call `expireRun` · CLASS C4 · **open**
**Claim.** §12.2 marks it Guard-initiated and never model-callable; §13 gives one caller (`resumeRun`); no
code runs outside a host turn and there is no scheduler. So §3.3's "**is closed** `timed-out`" is aspirational.
**Required fix (ruled).** Lazy expiry evaluated on every run access, plus an optional explicit maintenance
sweep. **No claim of autonomous background expiry without a verified scheduler.**

### N-10 · A source refresh can invalidate a paused run that then completes · CLASS C4 · **open**
**Claim.** Invalidation is recorded only as an ID list in `maintenance_operation`; no `run` column, no
`run_event` kind, no Guard rule marks affected runs, and the source hash is checked only once at
`prepareContext`. A run paused in `awaiting-approval` across a refresh can be approved, handed off and closed
`completed` against a `source_sha256` that no longer exists — §7.5 re-verifies the *artifact* hash, not the
source.
**Required fix (ruled).** Persist invalidation as an enforceable event; refuse resume, approval presentation,
handoff construction and completion for any run whose pinned source/index identity is invalidated or
mismatched; designer message says the design-system data changed and the proposal must be regenerated;
**never silently re-pin or reuse an approval against new source data.** Concurrency tests for refresh racing
submit, approval, resume and completion.

### N-11 · `beginRun` takes both `operation_id` and `run_type` · CLASS C3 · **open**
**Claim.** §2.7 maps operation → `RunType` deterministically, so `run_type` is derivable; as written
`component.audit` + `run_type: 'new'` passes, because G-2 checks only validity and nothing compares the pair.
**Evidence.** `src/contracts/invocation.ts:126` `resolveInvocation` knows nothing of operation IDs, so the
check must be the Guard's.
**Status.** §2.10.3.1 and §13 now derive `run_type`. **Left open because G-2 still refuses "an invalid
caller-supplied `run_type`"** and must be restated as refusing an `operation_id` with no valid canonical
mapping (convergence step 5).

### N-12 · `recordApproval{approved_by}` is a caller-supplied trust assertion · CLASS C1 · **open**
**Claim.** Revision 2 fixed the interpretation (§7.4 flags) and left the intake exactly as revision 1 had it,
while §13.1 states its rule without exemption — the unargued-exemption pattern of B-3 and N-4.
**Evidence.** `schemas/shared/run-envelope.schema.json:68` requires `approved_by` with `minLength: 1`, so
dropping it is itself a widening to register.
**Required fix.** Either exempt it explicitly as attribution-only carried beside
`response_source: 'model-relayed'`, or drop it and register the widening.

### N-13 · `display_id` is stored but unwritable · CLASS C2 · **open**
**Claim.** §2.2 removes it from `beginRun`'s type for the same structural reason as `run_id`; nothing mints
it; `beginRun` returns `{run_id, run_type, phase}`. So §2.5 and `resumeRun {run_id | display_id}` describe a
permanently NULL lookup key.
**Evidence.** `src/contracts/invocation.ts:94–106` — `display_id` optional on
`ResolvedCoordinatorInvocation`; `run-envelope.ts:149` on the envelope.
**Required fix.** Have the Guard mint it deterministically and say from what, or delete the column and that
resume path.

### N-14 · §1.5's tiers cannot classify test-enforced clauses · CLASS C4 · **open**
**Claim.** §2.8's static source-scan test, §2.7.0.1's tested non-relationship and §17.3's structural test are
enforced by CI, but §1.5 defines Enforced as "code **refuses the illegal action**" — a failing test refuses a
commit, not an action — while asserting every clause belongs to exactly one tier.
**Required fix.** Add a fourth tier (build-time / test-enforced) and assign those clauses, or widen the
Enforced definition explicitly.

### N-15 · Register §E contradicts SA-41 and SA-42 · CLASS C3 · **partial**
**Claim.** §E asserts "**Both gates**… Gate 1 semantic approval… Hash binding matters *more* here — it is what
makes an approval **survive a turn boundary**", and that corrections are re-validated and **re-approved**.
SA-41 demotes Gate 1; SA-42 makes boundaries unobservable.
**Status.** §E was revised for the "touches nothing" correction only.
**Required fix (ruled).** Rewrite §E so it does not claim Gate 1 is unchanged, does not call an unverified
response "human approval", does not say corrections are re-approved in Phase 2, and does not rely on an
observable turn boundary.

---

## Pass 02 — Minor

| ID | Claim | Evidence | Class | Status | Note |
|---|---|---|---|---|---|
| **N-16** | `run-envelope.ts:9` is the wrong line for the "Phase 2 Runtime Controller work" docstring | It is line **6**; line 9 is the operational-field boundary sentence. **Verified.** Inherited from pass 01's own S-4 mis-citation and propagated into two documents | C5 | **open** | Fix in contract §11.7, SA-43, §F. Prefer symbol + snapshot over bare line numbers (step 9) |
| **N-17** | Guard numbers were silently reassigned | Revision 1's G-4 was the `run_id` refusal; revision 2's G-4 is the leak rule. G-12 was staleness, now append-only | C3 | **open** | Violates §15's own retire-don't-reuse principle. Retire and renumber, or add a mapping table |
| **N-18** | `RunEnvelope.retry_count` has no column, no fold, and is not in §11.3's absent list | `run-envelope.ts:159` required; `schemas/shared/run-envelope.schema.json:115,144` required | C3 | **open** | The contract has no retry concept at all |
| **N-19** | `stage_latency.measured` is inexpressible in the shipped envelope | `run-envelope.ts:164` and schema `:130–133` — `Record<string, number>` | C6 | **open** | Needs a fourth widening or a statement that the flag lives only in the store |
| **N-20** | Clarification gaps supplied twice — in the draft and in `openClarification{gaps[]}` | `compose-trusted-output.ts:182` reads `draft.clarification_gaps`, the authority in code | C3 | **closed** | §13 now `openClarification{run_id}`; gaps read from the draft |
| **N-21** | §2.10.2's "surviving enforceable invariant" has no reachable instance in Phase 2 | `modify`/`audit` capability-gated (G-3a), so only `new` runs exist and its route is unconditional | C7 | **open** | Worth stating, since §2.10 is the repair for a falsified guarantee |
| **N-22** | §9.1 lists "route capability-gated" under `blocked`, but G-3a refuses before a run exists | The refusal lands in `tool_invocation` with NULL `run_id` | C2 | **open** | Strike it from §9.1 |
| **N-23** | §9.1.1's `gate-1-rejected` reason names no storage location | `run` is immutable after `beginRun` and has no outcome/reason column | C3 | **open** | Presumably `run_event.payload_json`; say so |
| **N-24** | §3.3 treats the staleness threshold as operative while §18.3 says it needs a value, and §3.3 does not cite §18.3 | contract §3.3 vs §18.3 | C7 | **open** | Against §10's own "an uncited rule is a rule someone invented" |
| **N-25** | §9.2's remedy does not remove the tautology it names | `render-machine-handoff.ts:107–114` recomputes `hashOutput(output)` for all three values, so "invoke both renderers independently" is `hashOutput(x) === hashOutput(x)` | C2 | **open** | Compare against the *recorded* `approval.approved_artifact_sha256` and the *persisted* handoff's `source_object_sha256`, or re-canonicalize `artifact.canonical_json` against `artifact.artifact_sha256` |
| **N-26** | §5.2 cites one hard ceiling; there are two | `schemas/shared/run-envelope.schema.json:122–127` caps `clarification_round_count` at 3 **independently** of `coordinator-output.schema.json:68`. **Verified** | C3 | **closed** | Both must be amended together; recorded |

---

## Class roll-up — where the recurring damage is

| Class | Findings | open or partial |
|---|---|---|
| **C1** Self-asserted trust | B-3, S-13, N-4, N-12 | N-12 |
| **C2** Stranded reachability | B-4, B-5, S-6, S-7, S-9, M-2, N-1, N-2, N-3, N-7, N-13, N-22, N-25 | B-4, B-5, S-6, M-2, N-7, N-13, N-22, N-25 |
| **C3** Two accounts of one fact | B-7, B-8, S-1, M-5, M-6, M-7, M-9, N-8, N-11, N-15, N-17, N-18, N-20, N-23, N-26 | N-8, N-11, N-15, N-17, N-18, N-23 |
| **C4** Unenforceable requirement | S-5, S-12, S-14, N-9, N-10, N-14 | N-9, N-10, N-14 |
| **C5** Mis-citation | B-6, S-10, M-1, M-3, M-4, M-8, N-16 | N-16 |
| **C6** Undeclared widening | S-2, S-3, N-5, N-6, N-19 | S-3, N-5, N-6, N-19 |
| **C7** Overstated claim | B-1, B-2, S-4, S-11, N-21, N-24 | N-21, N-24 |
| **C8** Unverified host capability | S-8 | — (verification is convergence step 6) |

**C2 and C3 dominate**, with 21 of 57 findings between them, and both are exactly what a single normative
transition registry with generated views removes structurally. That is the argument for convergence step 2
being done before any further prose repair.
