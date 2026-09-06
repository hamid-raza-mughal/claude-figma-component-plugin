# R-1 (Claude Code) HD-2 verification, and functional design-quality observations

This document now carries three distinct kinds of evidence, kept visibly separate because
they prove different things and were previously conflated under one label ("interruption
and resume"):

- **[A. Fresh-engine persistence evidence](#a-fresh-engine-persistence-evidence-same-process)** —
  proves state survives a dropped in-process reference. Same OS process throughout.
- **[B. Genuine cross-process interruption/resume evidence](#b-genuine-cross-process-interruptionresume-evidence)** —
  proves state survives an actual OS process boundary. Two distinct `node` processes,
  verified by distinct OS PIDs.
- **[C. Functional design-quality observations](#c-functional-design-quality-observations)** —
  not HD-2 evidence at all. A realistic component request run through the real bundle,
  evaluating whether the design-system references the Coordinator lands on are
  *semantically* good, not merely valid.

**Correction to the previous version of this document (2026-07-31):** that version described
`tools/verify-r1-hd2.ts`'s two `CoordinatorEngine` instances as demonstrating recovery "matching
a process that stops without a clean shutdown." That phrasing overclaimed: both instances are
constructed inside one `main()`, in one OS process (`tools/verify-r1-hd2.ts:52,63`). Nothing in
that run ever crossed a process boundary. Section A below restates that same run with corrected,
bounded language. Section B is the new, genuine article: two real `node` child processes,
verified by distinct OS PIDs.

**Not claimed by this document, in any section:** Builder activation, any consequential Figma
operation, verified human authorization (HD-1 remains unmet — every approval below is
model-relayed and unverified), or R-2/pilot readiness.

---

## A. Fresh-engine persistence evidence (same-process)

**Tool:** `tools/verify-r1-hd2.ts`. **Configuration:** Claude Code — local process execution,
filesystem write, deterministic tool calls (§1.6.1) — against a writable local directory and the
real curated-source bundle (sha256
`2222a2b8eff4224f76ddad591cf6f46c6e8bb25ec7f96aebbf13941876356627`).

**What this proves:** a durable SQLite-backed run store can be written by one `CoordinatorEngine`
instance, abandoned (no `close()`, no reference retained) without being read again by that same
instance, and correctly resumed by a **second, independently constructed** `CoordinatorEngine`
pointed at the same config — all inside **one OS process**. This is real evidence that state
lives in the file rather than in any single engine instance's memory. It is **not** evidence
about surviving an actual process exit — see Section B for that claim.

### Command

```
ADALFI_ARTIFACT_DIR="<bundle>" node tools/verify-r1-hd2.ts <approved-data-dir>
```

### Raw output

```
R-1 HD-2 verification run — §1.6.6
started_at: 2026-07-31T19:18:35.496Z
approved_data_directory: <scratchpad>/docs-evidence/same-process/approved-data/run-store

--- step 1: write (fresh process) ---
beginRun -> run_id=1fff322e-98de-4d69-8043-67f203350ebf display_id=new-3ZZK4BMR phase=received
prepareContext -> phase=drafting, 5 candidate categories
(engineA reference now dropped — no explicit close() — simulating a process that stops)

--- step 2: interruption + resume (fresh engine instance, same config) ---
resumeRun (fresh engine) -> phase=drafting, pending_action="awaiting a submitted draft"

--- step 3: continue the resumed run to completion ---
submitDraft -> outcome=accepted
presentForApproval -> artifact_sha256=2ec60fd0cac62453…
recordApproval -> outcome=advance
buildHandoff -> next_route=builder
closeRun -> outcome=completed
final resumeRun -> phase=terminal, pending_action="terminal: completed"

finished_at: 2026-07-31T19:18:35.676Z
RESULT: PASS
```

### What "interruption" means here, precisely — and what it does not mean

`engineA` (one `CoordinatorEngine` instance, one `RunStore`, one open `IndexReader`) wrote events
at `seq` 1–3 and was then discarded — no reference retained, no `close()` called. `engineB` is a
**second, independent `CoordinatorEngine` instance, constructed fresh against the same
`Phase1Config`, in the same `main()`, in the same OS process** as `engineA`
(`tools/verify-r1-hd2.ts:52,63`). It opens its own new `RunStore`/`DatabaseSync` handle against the
same file. `engineB.resumeRun` folded the event log written by `engineA` and correctly reported
`drafting` — proving the run's state lived in the file, not in `engineA`'s in-memory fold cache.
`engineB` then carried the same run through to `completed`.

**What this does not prove:** that state survives an actual OS process termination — a crash, a
`kill`, a closed terminal, or (the case that matters for a real Claude Code turn) the interpreter
process actually exiting between one tool call and the next. Two objects in one process's heap,
even with no reference held between them, are not two processes. Section B supplies that evidence.

### The actual event log, read back from the store file after the run

| seq | at | kind | from_phase | to_phase |
|---|---|---|---|---|
| 1 | 2026-07-31T19:18:35.579Z | `run-begun` | — | `received` |
| 2 | 2026-07-31T19:18:35.596Z | `context-preparation-started` | `received` | `preparing` |
| 3 | 2026-07-31T19:18:35.596Z | `context-preparation-succeeded` | `preparing` | `drafting` |
| 4 | 2026-07-31T19:18:35.672Z | `draft-submitted` | `drafting` | `validating` |
| 5 | 2026-07-31T19:18:35.673Z | `approval-presented` | `validating` | `awaiting-approval` |
| 6 | 2026-07-31T19:18:35.674Z | `approval-recorded-approved` | `awaiting-approval` | `handoff-ready` |
| 7 | 2026-07-31T19:18:35.675Z | `handoff-built` | — (marker) | — (marker) |
| 8 | 2026-07-31T19:18:35.676Z | `run-completed` | `handoff-ready` | `terminal` |

Events 1–3 were written by `engineA`; events 4–8 were written by `engineB`, against the state
`engineB` read back from the file — not from anything carried over in memory. All eight events
were written by the same OS process.

### The store-identity.json witness (§11.0.7), written at initialization

```json
{
  "store_uuid": "0ed5bbd4-01bd-4115-b32d-e2d0a9dad5b7",
  "created_at": "2026-07-31T19:18:35.497Z",
  "store_schema_version": "1.0.0"
}
```

---

## B. Genuine cross-process interruption/resume evidence

**Tool:** `tools/verify-r1-hd2-cross-process.ts`, orchestrating
`tools/two-process/process-a.ts` and `tools/two-process/process-b.ts`. **Configuration:** same as
Section A — Claude Code, local process execution, against the same real curated-source bundle.

**What this proves:** Process A (one real `node` OS process) creates a run, prepares context,
prints its `run_id`, and exits. A **second, independently launched `node` OS process** — Process
B, spawned via `node:child_process`, receiving *only* the `run_id` and the shared `ADALFI_*`
config env vars, never an object reference, a candidate list, or anything else held in Process
A's memory — resumes the run solely from the persisted SQLite store, verifies the phase and
event sequence it finds there, independently re-derives a design-system candidate from the
shared content-addressed index (not received from Process A), and completes the run to a
terminal outcome. Distinct OS process IDs are captured and compared as the load-bearing proof.

### Command

```
ADALFI_ARTIFACT_DIR="<bundle>" node tools/verify-r1-hd2-cross-process.ts <approved-data-dir>
```

### Raw output

```
R-1 HD-2 genuine cross-process acceptance run — §1.6.6 (corrected evidence boundary)
orchestrator_pid: 70621
started_at: 2026-07-31T19:18:53.574Z
approved_data_directory: <scratchpad>/docs-evidence/cross-process/approved-data/run-store

--- process A: separate `node` child process, creates + prepares, exits without completing ---
{"pid":70623,"started_at":"2026-07-31T19:18:53.762Z","exited_at":"2026-07-31T19:18:53.823Z","run_id":"dbcb0da7-c51a-4447-b961-8d83850edbde","display_id":"new-VF5GV9Y5","phase_after_prepare":"drafting","candidate_category_count":5}
orchestrator observed: process A os_pid=70623, wall-clock 2026-07-31T19:18:53.575Z .. 2026-07-31T19:18:53.832Z

--- process B: separate `node` child process, ONLY run_id + shared store paths passed in ---
(handed to process B: run_id="dbcb0da7-c51a-4447-b961-8d83850edbde" and the same three ADALFI_* env vars — nothing else)
{"pid":70624,"started_at":"2026-07-31T19:18:53.989Z","exited_at":"2026-07-31T19:18:54.096Z","run_id":"dbcb0da7-c51a-4447-b961-8d83850edbde","resumed_phase":"drafting","resumed_pending_action":"awaiting a submitted draft","persisted_sequence_after_resume":["run-begun","context-preparation-started","context-preparation-succeeded"],"independently_derived_candidate_id":"c_363fdcd04be216427a7d602e","artifact_sha256":"3308f81bd139d9b14710c3cd9f075ff6806f378eb241175a4c1fd1b5fc0e4af5","approval_outcome":"advance","next_route":"builder","close_outcome":"completed","final_phase":"terminal","final_pending_action":"terminal: completed","final_event_history":[{"seq":1,...},...,{"seq":8,...}],"result":"PASS"}
orchestrator observed: process B os_pid=70624, wall-clock 2026-07-31T19:18:53.832Z .. 2026-07-31T19:18:54.105Z

--- cross-process identity check ---
process A OS pid: 70623
process B OS pid: 70624
distinct OS processes: true
process B resumed phase: drafting (expected "drafting")
persisted sequence process B read on resume: run-begun -> context-preparation-started -> context-preparation-succeeded

finished_at: 2026-07-31T19:18:54.106Z
RESULT: PASS
```

(The `final_event_history` array is elided above for width; the full sequence matches the table
below exactly — see `docs-evidence/cross-process/raw-output.txt` produced by re-running the
command for the untruncated JSON.)

### The actual event log, read back from the store file by process B

| seq | at | kind | from_phase | to_phase |
|---|---|---|---|---|
| 1 | 2026-07-31T19:18:53.807Z | `run-begun` | — | `received` |
| 2 | 2026-07-31T19:18:53.822Z | `context-preparation-started` | `received` | `preparing` |
| 3 | 2026-07-31T19:18:53.822Z | `context-preparation-succeeded` | `preparing` | `drafting` |
| 4 | 2026-07-31T19:18:54.091Z | `draft-submitted` | `drafting` | `validating` |
| 5 | 2026-07-31T19:18:54.093Z | `approval-presented` | `validating` | `awaiting-approval` |
| 6 | 2026-07-31T19:18:54.093Z | `approval-recorded-approved` | `awaiting-approval` | `handoff-ready` |
| 7 | 2026-07-31T19:18:54.094Z | `handoff-built` | — (marker) | — (marker) |
| 8 | 2026-07-31T19:18:54.095Z | `run-completed` | `handoff-ready` | `terminal` |

Events 1–3 were written by Process A (OS pid `70623`); events 4–8 were written by Process B (OS
pid `70624`) — **a distinct OS process**, launched after Process A had already exited, reading
this exact sequence back from the SQLite file before appending to it.

### The store-identity.json witness (§11.0.7), written at initialization

```json
{
  "store_uuid": "83a0798a-1ed9-4e4a-9c58-ae2f7de32359",
  "created_at": "2026-07-31T19:18:53.763Z",
  "store_schema_version": "1.0.0"
}
```

### No state passed between processes except the run identifier and shared store location

Process A's stdout carries exactly: its own `pid`, timestamps, `run_id`, `display_id`, the
resulting phase, and a candidate-category *count* (a number, not the candidates themselves —
`tools/two-process/process-a.ts`). Process B receives that `run_id` as `argv[2]` and the same
three `ADALFI_*` env vars Process A had (curated source, derived index, approved-data directory) —
never a candidate list, an engine object, or the draft Process A might have gone on to submit.
Process B independently re-derives its own design-system candidate via `listByCategory` against
the shared content-addressed index (`tools/two-process/process-b.ts`) — the same deterministic
query `prepareContext` itself runs, re-executed from scratch, not received from Process A.

### Regression coverage

`tests/adversarial/phase2-cross-process.test.ts` spawns this same Process A / Process B pair
(against a synthetic fixture, not the external bundle, so it runs unconditionally with the rest
of the suite) and asserts, with real failing assertions:

- Process B's resumed phase equals `"drafting"` — not merely printed, checked.
- Process B's persisted event sequence on resume equals exactly
  `["run-begun", "context-preparation-started", "context-preparation-succeeded"]`.
- The full final event history equals the expected eight-kind sequence in order.
- Process A and Process B report distinct OS PIDs.
- Process B refuses (non-zero exit) when handed a `run_id` nothing ever wrote to the store.
- Process B refuses when a third actor (a separate `node` invocation, `tests/tools/cancel-run-cli.ts`)
  cancels the run between Process A's exit and Process B's resume — proving the phase check has
  teeth rather than trusting a belief formed before the mutation.

---

## C. Functional design-quality observations

**Tool:** `tools/functional-quality-demo.ts`. **Not HD-2 evidence** — this section asks whether the
Coordinator's *design-system reference selections* are good, not whether the run mechanism is
durable. **This is the central caution the section exists to state plainly: a run validating,
approving, and completing is not evidence that the design-system references it bound are
semantically appropriate.** The two are independent facts, and this repository's test suite —
correctly — only asserts the first.

### The request

A real, meaningful component: a **Primary Action Button** — size (`sm`/`md`/`lg`) and interaction
state (`default`/`hover`/`pressed`/`disabled`) variants, a primary-brand fill, bold call-to-action
label typography, and rounded corners, run against the real curated bundle.

### Candidates considered — and the architectural reason they are not intent-aware

For a `new` run, no semantic elements exist yet at `prepareContext` time, so there is nothing for
the deterministic query planner to plan a narrow, ranked query from. `engine.ts` (WP6, documented
at `src/tools/engine.ts:21-30`, decision **PD-7**) instead calls `listByCategory` — the Guard's own
capped *broadening* escape hatch — across five fixed generic categories. **The same five
candidates per category come back for this request as would come back for any other `new`-run
request** — nothing about "Primary Action Button" or any of its stated bindings narrows the
query. Every candidate returned this way is explicitly tagged `confidence: "low"`,
`ranking_reasons: ["broadened-retrieval"]` (`src/resolver/list-by-category.ts:87-90`) — correct
and honestly reported at generation time.

| category | candidates (path = value) |
|---|---|
| color | `alphas/dark/containers/primaryContainer/opacity_50`, `brand/Dark Green 1`, `sys/dark/surfaces/on_surface`, `ref/m2/cyan/cyan_60`, `ref/m2/teal/teal_90` |
| typography | `cta/xs/bold`=10, `title/reg/bold`=20, `subhead/reg/regular`=14, `byline/sm/bold`=9, `byline/sm/regular`=9 |
| spacing | `aux/xl`=18, `lg-scale/xxs`=56, `lg-scale/xs`=64, `lg-scale/sm`=72, `lg-scale/base`=80 |
| effect | `Dropdown shadows/Grid Header Effect` (only entry in the whole bundle) |
| corner-radius | `radius/round-shape/reg/xxxs`=10 … `radius/round-shape/reg/reg`=20 |

> **Re-observed 2026-09-06** against the re-pinned curated export (MB-17). Colour and
> typography are unchanged. Spacing and corner-radius are not: the 2026-07-28 run returned
> `negative/sm`=-1 … `negative/xl`=-4 for spacing and `radius/round-shape/xxxs`=2 …
> `radius/round-shape/reg`=12 for corner-radius, and **all five of those radius paths have
> since been retired**. The rows above are what `prepareContext` returns today; the
> superseded values are kept in this sentence rather than deleted, because the point of
> §R1 is what the Guard offered on a given day.

### Selected references, evaluated for semantic fit — not just validity

| binding | candidate | verdict | why |
|---|---|---|---|
| fill (root) | `brand/Dark Green 1` | **Uncertain, accepted provisionally** | The only offered color plausibly denoting a brand-primary. Nothing confirms it *is* the primary token rather than one of several greens. |
| text_style (label) | `cta/xs/bold` | **Appropriate** | Named "cta" — call-to-action — exactly this element's role. The strongest, most defensible match offered. |
| corner_radius (root) | `radius/round-shape/reg/xxxs`=10 | **Reasonable, not provable** | The smallest offered radius; nothing distinguishes it from the next step up as *the* button radius. (2026-07-28: `radius/round-shape/sm`=10, retired since.) |
| padding (label↔edge) | any of the 5 spacing candidates | **Weak / inappropriate** | Every option is either an unrelated auxiliary token or a page-layout value far too large for text-to-edge padding — an 80pt inset is a section gutter, not button padding. (2026-07-28: the same verdict for a different reason — the offered values were *negative*.) |
| box_shadow (root, optional) | `Dropdown shadows/Grid Header Effect` | **Weak / inappropriate** | The bundle's only effect token is a dropdown/grid-header shadow — an unrelated component's elevation, not a button's. |

### Path 1 — forced completion (binds the weak candidates anyway)

Submitting a draft that binds **all five** properties, including the two judged weak above,
**validates, is approved, and completes**:

```
submitDraft -> outcome=accepted
...
Aggregate confidence: medium
  (the weakest individual resolution, not an average)
Approving binds this exact artifact: sha256 d8b22cf56fb700166a78e1cf9bb64958df2ec795c0fc425fa8c67c483e5a7ee7
...
recordApproval -> outcome=advance
buildHandoff -> next_route=builder
closeRun -> outcome=completed
```

**This is the finding the caution above is about, made concrete:** the pipeline validated,
approved, and completed a button whose padding and shadow bindings are, on inspection, not
sensible design decisions. The human-facing approval view gave no signal of this — see the
blocking issue below.

### Path 2 — judgment applied (blocks rather than forces the weak bindings)

Submitting a second draft for the same request — binding only the three defensible
properties (fill, typography, corner-radius) and raising a **blocking** clarification gap for
padding/shadow rather than picking something weak just to finish:

```
submitDraft -> outcome=accepted
phase after submitDraft: validating (expected "validating" with a blocked composition)
openClarification -> phase=awaiting-clarification, round=1
```

No artifact hash, no approval view, and no handoff exist for this run — correctly: nothing ready
was produced. **That absence is itself the evidence that a weak selection was flagged, not
forced through.**

A non-blocking gap was tried first and rejected as an option: the composed `'ready'` output for a
`new` run (`src/coordinator/compose-trusted-output.ts:265-278`) carries no field a non-blocking
`clarification_gaps` entry survives into — it is simply dropped. "Flag it but still finish,
visibly" is therefore not currently a real option in this engine; only "finish silently" (Path 1)
or "actually stop" (Path 2) are.

### Blocking issue found: aggregate confidence in the approval view is a hardcoded default, not a real signal

`src/coordinator/compose-trusted-output.ts:246-249` computes `aggregate_confidence` from
`input.perResolutionConfidence`, falling back to `'medium'` for every resolution when that map is
absent. **`CoordinatorEngine.submitDraft` (`src/tools/engine.ts`, the `composeTrustedOutput({...})`
call around lines 559-572) never passes `perResolutionConfidence`.** The composer itself is
correctly tested with real confidence values wired in
(`tests/adversarial/adversarial-suite.test.ts:217`) — this is a live-engine integration gap, not a
defect in Phase 1's tested composition logic, and unlike PD-7 it is not called out anywhere in the
codebase as a known, deliberate, revisit-later tradeoff.

**Effect:** every `new`-run approval view reports an aggregate confidence that is disconnected
from the real, low confidence every offered candidate actually carries at generation time. Path
1 above reproduces this directly: five broadened, `confidence: "low"` candidates were bound,
two of them (by this document's own evaluation) semantically wrong, and the approval view a
human would read reported `"Aggregate confidence: medium"` — a fabricated middle value, not a
reflection of what was actually resolved. **This materially undermines the honesty the approval
view exists to provide** (`src/rendering/render-approval-view.ts`'s own header comment: "Both
renderers bind `source_object_sha256`... a divergence would make the approval refer to neither" —
the same standard of honesty does not currently extend to confidence).

### What this section shows, and what it does not

**Shows:** (1) for a `new` run, candidate generation is architecturally uninformed by the stated
intent (PD-7) — a known, documented, deliberate interim state, not a bug; (2) the confidence a
candidate actually carries at generation time is silently discarded before it can reach the
human-facing approval view — an undocumented wiring gap, reported above as a blocking issue; (3)
there is currently no "complete, but flagged" path for a `new` run — only silent completion or an
actual block; (4) the resolver is not uniformly poor — the `cta/xs/bold` typography match is
genuinely strong — the problem is specifically the absence of intent-aware narrowing for new
components, not universally bad data.

**Does not show:** resolver quality on `modify`/`audit` runs, which do have a real target and can
plan narrower, ranked queries (`src/tools/engine.ts:28-30` notes this as the documented path
forward); real human design review (every verdict above is this tool's own reasoning, presented
for the user's independent judgment, not a substitute for it); or any Figma/Builder execution.

---

## Disposition

Per §1.6.4 rule 2, this is recorded per verified configuration, not as a bare product name:

> **Claude Code (R-1)** — local process execution, filesystem write, deterministic tool calls,
> against a writable local directory — **HD-2: verified 2026-07-31 (Section A, same-process) and
> 2026-07-31 (Section B, genuine cross-process)**. **HD-1 and HD-3 remain unmet on this
> configuration** — no claim of verified human authorization or authoritative command metadata is
> made by either run, and none is implied by them.

> **Functional design quality (Section C)** — not part of the HD-2/HD-3 matrix. Open item: the
> approval view's aggregate-confidence field is currently disconnected from real per-candidate
> confidence for every `new` run (see "Blocking issue found" above). Recommended before this
> engine is relied on for real component authoring: either wire `perResolutionConfidence` through
> `submitDraft`, or make the approval view state plainly that no confidence signal is currently
> available, rather than showing a value that looks meaningful and is not.

This document is additive evidence. It does not itself edit
`docs/host-turn-workflow-contract.md`'s §1.6.5 support matrix — that is normative contract text,
and this session's mandate keeps contract prose frozen except where a failing implementation test
exposes a specific contradiction (none did here). Whether and how to fold this evidence into the
contract's own matrix, and whether/how to fix the confidence-wiring gap, are the user's call.
