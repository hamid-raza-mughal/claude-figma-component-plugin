# Host-Mediated Workflow Contract — Phase 2 Pass 1

**Date:** 2026-07-31 · **Revision 4**, closing three internal conflicts and dispositioning nine open
questions that blocked executable behaviour.
Revision 3 (2026-07-31) incorporated the HD-2 ruling (SA-45 / v4 §D3). Revision 2 (2026-07-30) incorporated
all findings of `docs/host-turn-contract-review-01.md` and the rulings on B-1, B-2 and B-3.
**Authority:** proposed `manage-ds-components-spec-amendments_v4.md` **revision 3**, **pending relay review**.

**What changed in revision 4, and what deliberately did not.** This revision is **documentation only**. It
executes **no** §F widening and commits **no** code: v4's own Sequencing section requires the contract to be
rewritten *before any code is committed against it* if review rejects the replacement invariant, so the four
widenings registered in §11.7 stay pending the lock. What revision 4 does is remove the reasons a reader
could not act on this document once the lock lands.

*Three internal conflicts, each a case of a repair reaching some sections and not others:*

1. **§11.2's `artifact` row named `presentForApproval` as the writer** while §4.4, §4.5, §10 and §13 all name
   `submitDraft` — and the row cited §4.4, the clause contradicting it. N-1's fix reached four places and
   missed the durable-state table. Class **C3**, committed in the table nearest the schema an implementer
   would build from.
2. **G-2 refused `beginRun` "without a valid `run_type`"** while §2.10.3.1 derives `run_type` and G-15 refuses
   *supplying* it. G-2 validated a parameter its neighbour forbids. This is N-11's open remainder, promoted
   from a cross-document gap to a contradiction internal to one document.
3. **§11.7 row 4 read "not yet — needs a v4 §F row"** when the row exists. v4 §F carries
   `src/config/phase1-config.ts:20–33` with the `derivedDir`-default prohibition, cited to SA-45 / HD-2; the
   register was saved after this contract's revision 3, so the status column went stale within the hour.
   Class **C3**, inside the table whose purpose is to prevent C3.

*Nine dispositions,* recorded in **§19** with the chosen rule, why it is the smallest safe choice, and its
revisit trigger — and written into the clauses that rely on them, so no rule is stated only in the register.
§18's questions 3, 7 and 9 close; N-9, N-10, N-12, N-13, N-18, N-19 and N-25 gain ruled dispositions. One
Guard rule is added (**G-21**) and one extended (**G-17**). **No existing Guard number is reused or
reassigned** — N-17's objection applies to this revision too.

**What changed in revision 3.** Revision 2 named **HD-2** — engine code against a writable local filesystem —
as an open dependency and then asked which permitted hosts could satisfy it, without a permitted set to ask
about. SA-45 supplies one. Three consequences are written in: **§1.6** names the two initial supported
runtimes by *capability*, with the per-configuration recording rule; **§1.4** is tightened from bare
host-agnosticism to *one engine, two host integrations*; and **§11.0 + G-20** turn HD-2 from a documented
assumption into a refusal, which is what revision 2 was missing. Revision 2 blocked Builder on HD-1 (G-9c)
while leaving the dependency that makes every other rule real entirely unguarded.

**What changed in revision 2.** Three guarantees revision 1 claimed are not obtainable in this runtime and
have been demoted rather than re-engineered: Gate 1 is **observe-only and non-authorizing** (§7); turn
boundaries are **unobservable** (§3); and decision D3's mechanism is **falsified and amended, not preserved**
(§2.10). Five blocking repairs and the serious/minor set are applied throughout. §14 is new and is the
honest core of that revision: every clause that cannot be enforced is now listed as such instead of being
written as a requirement.

---

## §1 · Scope, authority, and the three enforcement tiers

Manage DS Components is a Claude-native plugin. **The active host turn is the only model invocation.** A skill
or command orchestrates the workflow within that turn and calls deterministic tools for resolution,
validation, state enforcement and handoff construction. No direct API call, no API key, no second Claude
invocation.

**§1.1 — The authority rule. This contract is specification, not enforcement.** It confers no authority.
Consequential transitions are authorized only by deterministic code, through the Run Guard.

**§1.2** Anything asserted only in prose carries no authority and no evidentiary weight. The Guard's recorded
state is the only account of what happened.

**§1.3** The Guard bounds what a run *can* do, not what it *must* do. Refusal cannot compel invocation: a turn
that never calls the Guard cannot be refused by it.

**§1.4 One engine, two host integrations** (SA-28, confirmed by SA-45). The Guard and store are engine; skill
and command are the host layer above. The **Guard, the durable store, the transition registry (§10) and the
test suite are shared and identical** across every supported runtime in §1.6 — the runtimes differ only in how
the engine is reached and how a writable directory comes to be approved. **A second Guard, a second store, a
second transition registry, or a divergent test path is a design defect, not a host adaptation**, and the
structural test is that removing either host integration leaves the engine and its suite intact.

### §1.5 The three tiers — every clause in this document belongs to exactly one

| Tier | Meaning | Where |
|---|---|---|
| **Enforced** | Deterministic code refuses the illegal action | §12, each rule citing its clause |
| **Recorded** | Code captures a fact it **cannot verify**, and marks it unverified | route provenance §2.10.3, approval response source §7.4 |
| **Advisory** | Workflow guidance with **no enforcement point** | §14 — listed exhaustively |

**§1.5.1** Revision 1's central defect was writing advisory clauses in the language of requirements. A
control that exists only as instruction text is not a control. Where this document says *must*, tier 1 or 2
applies; advisory clauses say *should* and are cross-listed in §14.

### §1.6 Supported runtimes — named by capability, not by product (SA-45 / v4 §D3)

**§1.6.1 The permitted-host set is two configurations.** HD-2 (§18) is the capability that defines them: the
engine must run against a **writable durable store**. Because §2.10's replacement invariant makes the Guard the
sole authority for legal state transitions, and SA-31 states that without durable state enforcement is vacuous,
a host that cannot satisfy HD-2 **cannot run this product at all** — not a degraded mode, not a read-only mode.
The enforcement layer is absent, so nothing above it can be trusted.

| ID | Configuration | Capability basis | Audience |
|---|---|---|---|
| **R-1** | **Claude Code** | Local process execution, filesystem write, deterministic tool calls | Development, automated verification, technical operation |
| **R-2** | **Claude Desktop / Cowork** with the plugin's local MCP server running **and** an explicitly approved writable data directory | Local plugin MCP execution + approved persistent storage | The designer-facing pilot |

**§1.6.2 Not claimed, and not to be claimed:** an ordinary Claude web or mobile chat; a cloud-only Claude
Project; any host where the local MCP server or the durable store is unavailable. The withdrawn clause — "a new
or existing Claude chat, Claude Project, Claude Code, or another supported Claude host" — described where a
plugin can be **installed** and was read as where the Guard can **enforce**. Those are not the same set. The
rest of the v4 opening ruling, including §1's host-turn sentence, stands unchanged.

**§1.6.3 One configuration is held out of the initial claim.** A web or mobile session *may* qualify **only**
when it is demonstrably connected through an active Claude Desktop instance to the **same** local MCP server and
the **same** durable store. That is a later verified host configuration, recorded once HD-1…HD-3 are
demonstrated on it end to end. It is not a hedge that lets the broad claim back in.

**§1.6.4 Two wording rules for this document and every Phase 2 artifact.** Tier honestly: these are
**documentation discipline, not engine controls**, and are cross-listed as advisory in §14.9 — with one
exception. The *literal* banned phrase is mechanically checkable, so §1.6.4a is **tier 1**: a repository
assertion fails if the string "desktop hosts with a sandbox" appears anywhere outside this clause and §14.9.
Judging whether a *paraphrase* smuggles the same claim back in is human review, and stays advisory.

1. **Never "desktop hosts with a sandbox."** State the capability: *Claude Desktop/Cowork with local plugin MCP
   execution and approved persistent storage.* "Sandbox" names an isolation property and is **silent on
   durability**, the only property HD-2 requires — so the phrase would let a non-durable host pass a written
   check. Note that "sandbox" has two other established senses in this repository, neither affected: the Figma
   **write-target** sense (SA-26/27, `render-machine-handoff.ts:56`, §7.2) and the **execution-locality** sense
   in `phase1-decision-log.md:35–36`. Neither is a host-capability claim; do not let them merge.
2. **Record host support per verified configuration, never by product name.** "Claude Desktop is supported" is
   not a row this contract can carry. "Claude Desktop + local MCP + approved writable directory — HD-1/2/3
   status, verified `<date>` by `<evidence>`" is. This applies to negative claims turning positive: the
   not-claimed lines in `README.md:27`, `phase1-as-built-blueprint.md:279` and `phase1-handoff-evidence.md:294`
   read "Cowork-compatible / Cowork-verified", which is the banned axis. They are safe while they deny; **when
   any of them flips positive it flips as an R-2 row with an HD status, a date and evidence** — never as a
   product name. Those three files are Phase-1-validated artifacts (v4 §F) and are **not** edited by this
   revision.

**§1.6.5 The support matrix — the instrument, not a result.** Rows are configurations, columns are the HD
dependencies, cells carry status **plus** the evidence that established it. As of this document's writing,
nothing below was verified; **one cell has since been filled with a run** — see the evidence-update note
immediately below the table, which names it precisely rather than editing the historical claim in place:

| | **HD-1** approval event | **HD-2** durable store | **HD-3** command metadata |
|---|---|---|---|
| **R-1** Claude Code | Not demonstrated — blocks Builder activation (§7.6.1, G-9c) | Satisfiable by construction; **verification run still required** | Not demonstrated — every route is `model-relayed` (§2.10.3) |
| **R-2** Desktop/Cowork + local MCP + approved dir | Not demonstrated — same block | Conditional on the approved directory; **verification run required** | Not demonstrated — same |
| *(later)* Web/mobile via active Desktop → same MCP + store | Not claimed | Not claimed | Not claimed |

**§1.6.5's evidence-update note, 2026-07-31 (Claude Code implementation session, not a revision-4 amendment).**
**R-1 × HD-2 is verified**, dated, with evidence: a real `beginRun`/`prepareContext` write, a real
interruption (the writing engine instance discarded without a clean shutdown), and a real resume by a second,
independent engine instance that read the run's state from the store file alone and carried it to `completed`
— `docs/phase2-r1-verification.md`, `tools/verify-r1-hd2.ts`. **Nothing else in this matrix changes**: R-1's
HD-1 and HD-3 cells are unchanged and still "Not demonstrated"; every R-2 cell is unchanged; the deferred
web-via-Desktop row is unchanged. This run carries no claim of Builder activation, any consequential Figma
operation, verified human authorization, or pilot/production readiness — see `docs/phase2-as-built.md`'s own
not-claimed list.

**§1.6.6 "Satisfiable by construction" is not "verified."** Until a run **writes state, is interrupted, and
resumes from that state** on a given configuration, HD-2 is *assumed* on it. Three such runs were owed — R-1,
R-2, and the deferred web-via-Desktop configuration. **R-1's landed 2026-07-31** (`docs/phase2-r1-verification.md`);
**two remain owed — R-2 and the deferred web-via-Desktop configuration.** Fill the cell with the run, not with
the argument. This clause is **tier 2, Recorded**: the matrix captures a fact the engine cannot verify about
itself, and G-20 (§12.1) is the separate tier-1 control that refuses when the store is actually absent.

**§1.6.7 The adoption cost is stated, not discovered.** R-2's reach is bounded by *will install a plugin and
approve a writable directory*. That is the price of having any enforcement at all, and it belongs in
stakeholder-facing material rather than in a later surprise.

---

## §2 · Command layer and invocation

**§2.1 Route is recorded explicitly and is never inferred by the Guard.** `run_type` is required
(`contracts/invocation.ts`). What has changed from revision 1 is the *claim about provenance* — see §2.10.

**§2.2 `run_id` is minted by `beginRun`.** Structurally, not by refusal: `beginRun`'s parameter type **omits
`run_id` and `display_id`**, so a caller cannot supply one. Revision 1 stated this as a Guard refusal (G-4),
which was unenforceable — `RawInvocation.run_id?: unknown` exists (`invocation.ts:109`) and a model can emit a
valid UUID indistinguishable from a minted one.

**§2.2.1 `display_id` is minted by the Guard, deterministically, from `run_id`** (§19 D-6, ruling N-13). Form:
`{run_type}-{Crockford base32 of the first 40 bits of run_id}` — e.g. `new-7F3K2Q1B`. Returned by `beginRun`
alongside `run_id`, stored on the `run` row under a UNIQUE constraint, and re-minted on the astronomically
unlikely collision.

Two properties are the reason for this form rather than a counter. It is **derived from a value already
minted**, so it introduces no second authority and no per-day sequence to race under CAS (§11.6.2) — the
defect a `{route}-{date}-{n}` scheme would have. And it is **short enough for a designer to read back aloud**,
which is the only reason §2.5's resume-by-`display_id` path exists at all. N-13's alternative was to delete
the column and that resume path; it is rejected because deleting a working affordance to avoid writing one
derivation is the wrong trade — a designer will not recite a UUID, so the path would be lost in practice
rather than replaced.

Revision 3's defect was narrower than it looked: it removed `display_id` from `beginRun`'s parameter type for
the correct §2.2 reason and then never said what mints it, leaving §2.5 and `resumeRun {run_id | display_id}`
describing a permanently NULL lookup key.

**§2.3** `user_intent` is untrusted data and **should** be passed verbatim. **Advisory — §14.1.** No
deterministic code sees the raw user message, so a tidied intent is undetectable.

**§2.4 Capability gate.** `modify` and `audit` require `target` and are unavailable pending FD-1…FD-4. `new`
requires `target` absent — **enforced by the Guard** (G-3b), because `resolveInvocation` checks only the
other direction and then *silently drops* `target` for `new` (`invocation.ts:150–164`) with no error code.
Silent discard is the invisible-edit failure mode §2.3 objects to.

**§2.5 Resumption** re-enters an existing run by `run_id` or `display_id`. Never mints a new id.

### §2.6 Many public entry points, one set of internal capabilities

No mandatory single entry point. Every public command resolves to an internal operation and reuses the same
route module, resolver, validation, Guard, approval binding and downstream tools. **Duplicated pipelines are
forbidden** — two pipelines for one route is two places for the gate to be wrong, and only one gets tested.

### §2.7 Public labels are not identities

Guard, durable state, telemetry, validation and tests depend on operation IDs and `RunType` — never on a
slash-command string.

| Operation ID | Kind | `RunType` | Provisional public name |
|---|---|---|---|
| `component.create` | route | `new` | `/create-component` |
| `component.modify` | route | `modify` | `/modify-component` |
| `component.audit` | route | `audit` | `/audit-component`, **alias** `/review-component` |
| `source.refresh` | maintenance | none | provisional |
| `source.validate` | maintenance | none | provisional |

**§2.7.0 There is no `component.review` operation.** `/review-component` resolves to `component.audit`,
keeping `RUN_TYPES` closed at three. Alias over fourth route because promotion is additive while retiring a
shipped route is not; §18.5 records the promotion criterion.

**§2.7.0.1 `/review-component` is unrelated to the `reviewer` `StageName` or the Reviewer agent.** They share
a word only. Phase 1 already paid for one overloaded name (`RunEnvelope.state` vs `ClarificationGap.state`,
which cost a path-scoped exemption), so the non-relationship is documented and tested rather than inferred.

**§2.7.1** Two levels: public name → operation ID → existing `RunType`. `RUN_TYPES` stays `new | modify |
audit` and `src/contracts/invocation.ts` is unchanged. **This claim is narrow and does not extend to other
Phase 1 contracts** — three are widened by this design, and all three are registered in v4 §F (see §11.7).

### §2.8 The registry is data, not branches

One or more public names and aliases → one operation ID. Resolved once at run creation; the **operation ID is
persisted** and the public string is provenance only. Renaming is a registry edit. A static source-scan test
asserts nothing in enforcement branches on a command string (the SA-28 absence-test pattern). An unknown or
ambiguous name is refused before a run exists.

### §2.9 Direct route commands bypass inference and nothing else

Not readiness checks, capability gating, deterministic validation, transition enforcement, approval
requirements, or artifact-hash binding.

### §2.10 Decision D3 is amended, not preserved

**§2.10.1 D3's stated mechanism is falsified in this runtime.** D3 reads: *"an absent or invalid route blocks
**before any model invocation**, so a misrouted run cannot exist"* (`invocation.ts:6–10`). In a host-mediated
runtime **the model invocation has already happened before any tool runs.** This is the same argument SA-29
uses against "sole dispatcher" — deterministic code sits below the model in the call stack — and revision 1
applied that test to the Controller while exempting D3. Claiming D3 was "preserved" preserved its wording and
not its mechanism.

**§2.10.2 The surviving enforceable invariant.** Once a valid `RunType` is recorded, **the Guard permits only
transitions legal for that route; an `audit` run can never reach Builder.** This is real, and partly
type-level already: `AuditReadyOutput.next_route` is the literal `'synthesizer'`
(`coordinator-output.ts:82`) and the composer writes the literal rather than reading the draft
(`compose-trusted-output.ts:300`).

**§2.10.3 Route provenance is DERIVED by the Guard, never supplied.** `route_confirmed` is deleted, and
**revision 2's first attempt at this clause reintroduced the same defect under the name
`route_provenance`** — a caller-supplied value from which `route_verified` was computed, which lets a model
pass `host-command-metadata` and mint its own verification. The fix is the structural one already applied to
`run_id` in §2.2, three lines away in the same table, and not applied here: **provenance is not a parameter.**

The Guard reads HD-3 host metadata directly and derives both fields:

| Derived `route_provenance` | `route_verified` | Derived when |
|---|---|---|
| `host-command-metadata` | `true` | The Guard itself observes authoritative HD-3 metadata for the invoked command |
| `model-relayed` | `false` | Default. Everything else, including every direct route command on a host without HD-3 |

**§2.10.3.1** `run_type` is likewise **derived** from `operation_id` via the §2.7 registry, not passed
alongside it. Accepting both would be two accounts of one fact, and `component.audit` paired with
`run_type: 'new'` would pass a validity check that never compares them.

**§2.10.4** Where HD-3 is available, a direct route command **may determine the route**. Absent it, command
provenance is model-relayed and unverified — and that is the assumed case until a host is shown to satisfy
HD-3 (§18.6).

**§2.10.5** For the general command, route proposal and conversational confirmation are **UX safeguards, not
deterministic proof of human authorship**. **Advisory — §14.2.**

### §2.11 Maintenance operations do not enter the authoring pipeline

Bounded deterministic operations execute only their own workflow: no authoring run, no stage phase, no gate.
Eight phases, two gates and a repair budget are machinery a JSON refresh never asked for. They get their own
record (§11.5). A refresh that changes `source_sha256` **must** name the runs it invalidates rather than
re-pinning them, which would move the ground truth under a recorded approval.

**§2.11.1 Invalidation is an enforceable event, not a list** (§19 D-5, ruling N-10). A `source.refresh` that
changes `source_sha256` appends a `source-invalidated` `run_event` to **every non-terminal run pinned to the
old hash**, inside the same transaction as its own `maintenance_operation` row. Each append obeys the per-run
CAS (§11.6.2) — invalidation is an append like any other, not a privileged write.

**§2.11.2 What an invalidated run may then do — G-21.** The Guard refuses `resumeRun`, `presentForApproval`,
`recordApproval`, `buildHandoff` and `closeRun completed` for any run carrying a `source-invalidated` event.
The only remaining exits are `closeRun blocked` (reason `source-invalidated`) and `cancelRun`. **Nothing is
ever silently re-pinned, and no approval is ever reused against new source data.**

**Why refusal rather than an in-place regenerate.** Revision 3 recorded invalidation only as an ID list in
`maintenance_operation` — no `run` column, no event kind, no Guard rule — while checking the source hash
exactly once, at `prepareContext`. So a run paused in `awaiting-approval` across a refresh could be approved,
handed off and closed `completed` against a `source_sha256` that no longer exists, because §7.5 re-verifies the
*artifact* hash and says nothing about the source. Permitting a re-draft in place would repair that, but it
needs round and budget semantics for "the source changed underneath you" that no clause defines and no
designer asked for. Refusing forward motion needs no new vocabulary, and the designer-facing form (§16.2) says
the design-system data changed and the proposal must be regenerated — which is a new run, and honest about it.

### §2.12 Every public name is provisional

Working labels only. Post-users renaming goes through alias and deprecation, never abrupt removal.

---

## §3 · Phases and pause points

**§3.1 Tools cannot observe host-turn boundaries.** Revision 1 was built on a rule that a turn ends where a
human is needed, and asserted a two-turn minimum, an "abandoned turn", and hash re-verification "because the
turn ended." **All of that is removed.** Deterministic code inside a host turn cannot know that a turn
started or ended, that a call arrived in a new turn, or that a human message occurred between two calls.

**§3.2 The workflow pauses awaiting external input.** `awaiting-clarification` and `awaiting-approval` are
**pause phases**: the run stops and waits for input that must arrive from outside. How many turns that spans
is unobservable and is not modelled.

**§3.3 Staleness is derived from recorded activity timestamps** — elapsed wall-clock since the run's last
recorded `run_event.at`. That is the only available signal. A run left in any non-terminal phase past the
threshold is closed `timed-out` (§8.4).

**§3.3.1 The threshold is 72 hours** (§19 D-1, closing §18.3). A governance-valve default, configurable, and
**one value for both §1.6 runtimes** because they share one store (§11.2.1). Derived from the binding
constraint §18.3 names — R-2's overnight case: Friday 17:00 to Monday 09:00 is 64 hours, so 72 covers a
weekend with margin. The asymmetry that sets the direction: in Phase 2 nothing is ever built, so an
over-eager expiry costs a designer a redraft, while an over-patient one costs a confusing resume list. Both
are cheap, so the more conservative value wins on the smaller argument. **§3.3 no longer treats the threshold
as operative while §18.3 calls it unvalued** — N-24's objection.

**§3.3.2 Staleness is evaluated lazily, on access — never on a schedule** (§19 D-4, ruling N-9). Every tool
that resolves a run evaluates staleness **before** doing its own work; a stale run is transitioned by
`expireRun` and the requested tool is then refused against a terminal run. An operator-invoked
`runMaintenance` sweep may expire many at once. **No autonomous background expiry is claimed or implied**: no
code here runs outside a host turn and there is no scheduler, so §3.3's "is closed `timed-out`" means *is
closed at the next touch*, not *is closed at the threshold*. The practical consequence is worth stating
plainly — a run cannot expire out from under a designer mid-thought, because nothing looks at it while they
think.

**§3.4 Turn identifiers are added only if an authoritative host interface supplies them — HD-3.** Nothing is
minted locally: a locally invented turn id would be a self-reported fact of exactly the kind §2.10.3 deletes.

**§3.5** Phase 2 implements the `coordinator` stage only. `builder`, `post-build`, `synthesizer` and
`reviewer` are unimplemented; `next_route` is recorded, not followed. **Builder activation and all
consequential Figma operations are additionally blocked on HD-1** (§7.6).

---

## §4 · Required tool calls per phase

**§4.0** A phase is entered either by a tool call or by the **Guard-recorded return** of one. Both are
deterministic events; neither can be entered by narration. (Revision 1's preamble claimed every phase was
entered *by a tool call* and was falsified by two rows of its own table.)

| Phase | Entered by | Model's work | Exited by |
|---|---|---|---|
| `received` | `beginRun` | none | `prepareContext` / `failRun` |
| `preparing` | `prepareContext` | none — deterministic | its return / `failRun` |
| `drafting` | `prepareContext` returning ok | **authors the draft** | `submitDraft` |
| `validating` | `submitDraft`, internally | none | `submitDraft`'s verdict |
| `awaiting-clarification` | `openClarification` | authored the gaps | `answerClarification` / `closeRun` |
| `awaiting-approval` | `presentForApproval` | none | `recordApproval` / `cancelRun` |
| `handoff-ready` | `recordApproval` → advance | none | `buildHandoff` → `closeRun` |
| `terminal` | `closeRun` / `failRun` / `expireRun` | none | — |

**§4.1** `preparing` is wholly deterministic; the model chooses nothing. `prepareContext` loads or reuses the
index, plans the query, runs `resolveBatch`, generates the schema card, selects the route module, assembles the
model input and runs the leakage assertion. It returns bounded candidates, schema card and route module.
`list_by_category` is **excluded from every phase surface** (§12.2) — that exclusion, not the caller-identity
string, is what enforces it (§14.5).

**§4.2** `drafting` **should** contain no tool calls. **Advisory — §14.3**: `submitDraft` must be reachable
from `drafting`, and the Guard cannot tell whether the model read the assembled context first.

**§4.3** `submitDraft` is the seam. The model submits; deterministic code judges. Validation is not a
model-initiated step, because a step the model can skip is not a gate.

**§4.4 `submitDraft` owns composition and persists the artifact.** It runs `composeTrustedOutput`
(`COMPOSITION_STEPS`, ten steps) and, on a `ready` result, writes the `artifact` row with its canonical JSON.

**Why here and not in `presentForApproval`**, which is where revision 2 first put it: `composeTrustedOutput`
returns `CompositionResult` — the three-way verdict — and its failure evidence *is* composition output
(step 1 draft schema, step 2 `validateSemantics`, steps 4–7 `validateReferences`,
`compose-trusted-output.ts:156–227`). So `submitDraft` cannot produce its own declared return without
composing. Putting composition in both places would compose twice, and `composed_at` is inside the hashed
object (`:132`), so the second composition yields a **different hash** — breaking the "exactly once per
artifact version" property by the same argument that establishes it.

**§4.5** `presentForApproval` therefore **reads the stored artifact and renders it**. It composes nothing and
computes no hash.

**§4.6 A `blocked` composition never reaches the gate.** `hasBlockingGap()` sets `proposedStatus = 'blocked'`
and composition still returns **ok** with a `BlockedOutput` carrying `next_route: null`
(`compose-trusted-output.ts:182`, `resolution.ts:213`). Revision 2 had no rule against presenting that
artifact, so a run could skip `openClarification` entirely, approve a blocked output and close `completed` —
satisfying all four §9.1 conditions while bypassing §5.5 rather than reaching it. Enforced now by **G-19a**
and **G-19b**.

---

## §5 · Clarification

**§5.1** Gaps are authored by the model as `ClarificationGap` items, each with its own semantic `state`
(`active | resolved | reopened`) — the single path-scoped exemption in the operational-leak detector.

**§5.2 Round budget: 2.** A governance-valve default. **Hard ceiling 3**, not by choice:
`ClarificationGap.opened_in_round` carries `"maximum": 3` in a shipped closed schema
(`coordinator-output.schema.json:68,78`). Any budget above 3 requires a schema amendment.

**§5.3 The budget is derived by the Guard from the event log** (§11.1). Never accepted from a caller: a model
that could report its own round count could reset it.

**§5.3.1 `opened_in_round` is echo-only.** The shipped draft schema **requires the model to author it**
(`coordinator-judgment-draft.schema.json:25–29` `$ref`s the same `$def`), and it is absent from
`OPERATIONAL_FIELD_NAMES`, so `findOperationalLeaks` does not catch it. The Guard therefore **validates it
equals the Guard-derived round and refuses on mismatch (G-6b), and never reads it as authority.** Without this
rule the design would hold two accounts of one fact — the defect §11.1 exists to prevent.

**§5.4** A clarification answer is new untrusted input; the draft **should** be re-authored in full rather
than patched. **Advisory — §14.4**: the Guard receives a draft and cannot distinguish a re-authored one from a
patched one. What *is* enforced: the resulting artifact is re-composed, re-hashed, and every prior approval
for the old hash is void (§7.5).

**§5.5** Budget exhausted with gaps still active → `blocked`, gaps surfaced. Blocked is a legitimate result,
never reported as a failure.

---

## §6 · Repair

**§6.1** Only `validation-failure` is repairable (`FAILURE_IS_REPAIRABLE`, `failures.ts:46–54`).

**§6.2 Exactly one repair call per run.** **Per-run, not per-failure** — revision 1 scoped it per-failure,
which `RunEnvelope.repair_call_count` cannot express: it is a scalar (`run-envelope.ts:160`). Aligning to the
shipped type beats widening it, and it matches P1-FINAL §15.5's "the repair budget is one call" (an external
reference; this document's §15 is retired and empty precisely so this cannot be misread).

**§6.3** The repair input is `FailureEvidence[]` — stable codes and JSON Pointers, never prose.
`findOperationalLeaks` returns all leaks rather than the first so one repair can address them together.

**§6.4** Repair is derived from the event log, not self-reported. Nothing in a submission declares its attempt
number.

**§6.5** Budget exhausted → `failRun` closes the run `failed`, retaining evidence from both attempts.

**§6.6** Clarification and repair budgets never pool. A semantic gap is not a validation error, and spending a
repair on a gap hides the gap.

---

## §7 · Gate 1 — observe-only and non-authorizing

**§7.1 In Phase 2, Gate 1 is observe-only and non-authorizing.** It is **not** a human-authorization control.
Revision 1 called it "the only gate Phase 2 reaches", which overstated it: `recordApproval` receives its
decision from its caller, which in a host turn is the model, so a turn can present and approve back-to-back
with no human involved and produce a record indistinguishable from a real one.

**§7.2** `gate_mode` stays `observe-only-validation` for all of Phase 2. No Builder, no sandbox, no write
plane exists, so nothing here can authorise anything.

**§7.3 The system may present an approval proposal and record a response for UX evaluation.** That is the
purpose it legitimately serves in Phase 2.

**§7.4 The record must never be described as verified human authorization** — not in storage, not in the
approval view, not in the machine handoff. It carries, explicitly:

```
response_source: 'model-relayed'
verified:        false
authorizing:     false
```

**§7.4.1** These fields live **on the approval record**, not beside it, because the qualification has to
travel: `renderMachineHandoff` embeds the record verbatim (`render-machine-handoff.ts:32,95`), so a receiving
stage would otherwise see a name and a decision with no flag. This widens the closed `ApprovalRecord` type
(`run-envelope.ts:122–131`) and is registered in v4 §F.

**§7.4.2 `approved_by` is retained, and explicitly exempted as unverified attribution — tier 2, Recorded**
(§19 D-7, ruling N-12). It is a **caller-supplied string that vouches for nobody**. It is meaningful only read
alongside `response_source: 'model-relayed'`, `verified: false`, `authorizing: false`, and it is never evidence
of who responded.

What makes the exemption safe rather than a hole: **no Guard, transition, budget, approval-binding or
completion decision may read `approved_by`** — enforced by the same static source-scan as `invoked_as`, and
G-17 is extended to cover it. A value that cannot influence any decision cannot be used to mint authority,
which is the whole of the C1 exposure. The designer-facing form (§16.2) is *"your recorded response, attributed
to X — unverified"*, never *"approved by X"*.

**Why keep it.** N-12 offered two ways out: exempt it, or drop it and register the widening.
`schemas/shared/run-envelope.schema.json:68` requires `approved_by` with `minLength: 1`, so dropping it is a
**fifth** closed-schema widening bought for nothing — the field's danger is that it is *read as authority*, not
that it exists, and the scan test removes that directly. Renaming the parameter while persisting to
`approved_by` was also considered and rejected: two names for one fact is the C3 defect this contract keeps
paying for.

**Revision 3's actual defect** was neither of those. It fixed the *interpretation* (§7.4's three flags) and
left the intake exactly as revision 1 had it, while §13.1 states its no-caller-claims rule without exemption —
the unargued-exemption pattern of B-3 and N-4, committed a third time. An exemption is legitimate; an
unstated one is not.

**§7.5 Hash binding survives, and it is worth keeping — but it proves a different thing.** An approval records
`approved_artifact_sha256`; the Guard re-verifies it before advancing and again on resume, because the artifact
may have changed while the run was paused. **Binding is not authorization**: it establishes *which artifact* a
recorded response refers to, and nothing about who produced the response. Any change to the artifact voids
every prior approval for it — clarification answers, repairs, and `changes-requested` all change it.

**§7.6 A nonce or hash-prefix challenge is rejected as an authorization control.** A nonce that travels through
Claude's context is **replayable by Claude and proves no human involvement.** Revision 1's §18.1 proposed one;
it was security theatre. A real control requires the challenge to be delivered and returned through a channel
unavailable to Claude, with deterministic code receiving authoritative evidence of the human action — **HD-1**.

**§7.6.1 Builder activation and all consequential Figma operations remain blocked** until HD-1 is implemented
and tested, or a separate trusted human-operated approval interface exists. This is a gate of the same weight
as FD-1…FD-2, and revision 1 did not have it.

**§7.7** Decisions are `approved | rejected | changes-requested`, matching `ApprovalRecord.decision`.
Cancellation is **not** an approval decision — it is `cancelRun` (revision 1 wrongly listed `cancelled` in the
approval enum).

**§7.8** The approval view's line, quoted in full because revision 1 truncated it while forbidding its
softening: **`NOTHING HAS BEEN BUILT. No Figma artifact exists. You are approving intent only.`**
(`render-approval-view.ts:66`). It is stated **plainly and early** — the fifth line, after run id, route and
snapshot — not the opening line. Under §7.1 and §7.4 it must not be softened, and its third sentence does the
most work of the three.

---

## §8 · Failure behaviour

| Class | Terminal | Guard action |
|---|---|---|
| `invalid-input` | yes | refuse at the boundary; `failRun` → `failed`; name the field |
| `hard-dependency-failure` | yes | `failRun` → `failed` |
| `optional-enrichment-failure` | no | proceed and **disclose** — record a `Disclosure`, never drop it |
| `partial-audit-extraction` | no | proceed with recorded `ExtractionCoverage` (SA-8) |
| `timeout` | yes | `expireRun` → `timed-out` (§8.4) |
| `validation-failure` | no | one repair (§6.2), then `failRun` → `failed` |
| `cancellation` | yes | `cancelRun` → `cancelled`. **Not a defect, never reported as one** |

**§8.4 What `timeout` can mean.** Two reachable cases: a deterministic tool exceeding its own deadline, and a
run whose last recorded activity is older than the 72-hour staleness threshold (§3.3.1), **observed on access
rather than on a schedule** (§3.3.2). **A hung drafting step is not detectable** — code can time out a tool,
not the model's thinking (SA-34), and per §3.1 it cannot even observe that the turn is still open.

**§8.5** Every failure carries `enforced_by`, so each invariant has one accountable owner. This requires the
new `run-guard` owner — see §11.7.

---

## §9 · Completion

**§9.1** A run is complete only when the Guard has recorded a terminal outcome. A model's closing statement is
not completion (§1.3).

| Outcome | Conditions |
|---|---|
| `completed` | hash-verified recorded approval · handoff built · `renderingsAgree()` true · terminal recorded. **Carries no claim of human authorization** (§7.4) |
| `blocked` | clarification budget exhausted with gaps active · **or** a `rejected` gate response · **or** the run's pinned source was invalidated by a refresh (§2.11.2, reason `source-invalidated`) |
| `failed` | a terminal failure class · **or** repair budget exhausted |
| `cancelled` | explicit `cancelRun` |
| `timed-out` | tool deadline exceeded · **or** staleness threshold passed |

**§9.1.1 `rejected` maps to `blocked`.** `RUN_OUTCOMES` is closed at five (`run-envelope.ts:42`) and revision 1
left rejection with no outcome at all. `blocked` is chosen over `cancelled` because it already means a
legitimate stop that is not a defect, and it preserves the distinction between *evaluated and declined* and
*abandoned without a decision*. A governance-valve default: recorded once, with the reason stored as
`gate-1-rejected`.

**§9.2** `renderingsAgree()` is checked **once**, by G-10 at `closeRun`, and `buildHandoff` does not also
enforce it — §8.5 permits one owner per invariant and revision 1 gave it two. Phase 1 described the helper as
"for a future controller to call before dispatch"; relocating the call to pre-`completed` is a change of use,
not something that quote endorses.

**§9.2.1 G-10 compares four independently sourced values** (§19 D-9, ruling N-25). Revision 3 said "invoke both
renderers independently" and did not remove the tautology it had just named: `render-machine-handoff.ts:107–114`
recomputes `hashOutput(output)` for all three values, so the comparison is `hashOutput(x) === hashOutput(x)` and
passes for **any** `x`, including a corrupted one. Invoking two renderers over one in-memory object does not fix
that, because the object is the thing not in question.

At `closeRun completed`, all four must be equal:

| # | Value | Where it comes from |
|---|---|---|
| 1 | `approval.approved_artifact_sha256` | the `approval` row, written at `recordApproval` |
| 2 | `artifact.artifact_sha256` | the `artifact` row, written at `submitDraft` (§4.4) |
| 3 | a hash **re-derived** by re-parsing and re-canonicalizing `artifact.canonical_json` **from storage** | recomputed, not read |
| 4 | `source_object_sha256` on the persisted handoff | the `handoff-built` `run_event` payload (§11.2) |

**Value 3 is the one that does work.** It goes through the stored bytes rather than the live object, so it
catches storage corruption and any canonicalization drift — including a divergence of the kind §13.3 records.
**1 vs 2** independently catches an approval bound to a superseded artifact version, which no rehash of a
single object can see. The check is therefore over *persisted, independently derived evidence*, which is what
§9.1's `completed` row has always claimed and could not previously support.

**Why the handoff is persisted in `run_event` rather than in its own table.** §11.1 makes the log the sole
authority and folds all state from it; a `handoff` table would be a second place for the same fact to live, and
§11.1 deleted the materialized `run_state` table for exactly that reason. Value 4 is read from the
`handoff-built` event's payload.

**§9.3** No terminal outcome may claim a live route, a Figma artifact, a token measurement, or **a verified
human approval**. The Phase 1 §20 not-claimed list remains in force and is extended by the last item.

---

# Part 2 — Derivations

## §10 · State machine

`coordinator` stage only. **Every row has a named tool or a Guard-recorded return**; every tool appears in
§12.2's surface for its `From` phase. Revision 1 stranded four tools and made `failed` unreachable.

| From | To | Trigger | Guard check | Clause |
|---|---|---|---|---|
| — | `received` | `beginRun` | `run_type` derived from `operation_id`, not capability-gated; `run_id` minted; provenance **derived** | §2.1 §2.2 §2.4 §2.10.3 |
| `received` | `preparing` | `prepareContext` | source hash + index version current | §4.1 |
| `received` | `terminal` | `failRun` | `invalid-input` \| `hard-dependency-failure` | §8 |
| `preparing` | `drafting` | its return, Guard-recorded | leakage assertion passed | §4.0 §4.1 |
| `preparing` | `terminal` | `failRun` | terminal failure class | §8 |
| `drafting` | `validating` | `submitDraft` | composes; on `ready` writes the `artifact` row | §4.3 §4.4 |
| `validating` | `drafting` | verdict `repairable`, Guard-recorded | `repair_call_count` = 0 for the run | §6.2 §6.4 |
| `validating` | `awaiting-clarification` | `openClarification` | round < 2; `opened_in_round` echo matches | §5.2 §5.3.1 |
| `validating` | `awaiting-approval` | `presentForApproval` | **stored artifact's status is `ready`**; reads, does not compose | §4.5 §4.6 §7.5 |
| `validating` | `terminal` | `closeRun` | composed status `blocked` and no clarification budget → `blocked` | §4.6 §5.5 |
| `validating` | `terminal` | `failRun` | repair exhausted, or terminal class | §6.5 §8 |
| `awaiting-clarification` | `drafting` | `answerClarification` | round incremented; approvals voided | §5.4 §7.5 |
| `awaiting-clarification` | `terminal` | `closeRun` | budget exhausted → `blocked` | §5.5 |
| `awaiting-approval` | `handoff-ready` | `recordApproval` approved | hash matches current artifact | §7.5 |
| `awaiting-approval` | `drafting` | `recordApproval` changes-requested | approvals voided | §7.5 §7.7 |
| `awaiting-approval` | `terminal` | `recordApproval` rejected | → `blocked` | §9.1.1 |
| `handoff-ready` | `terminal` | `buildHandoff` then `closeRun` | `renderingsAgree()` true | §9.2 |
| any non-terminal | `terminal` | `cancelRun` | → `cancelled` | §8 |
| any non-terminal | `terminal` | `expireRun` | last event older than 72h → `timed-out`. **Evaluated lazily on access**, never scheduled | §3.3.1 §3.3.2 §8.4 |
| any non-terminal | `terminal` | `closeRun blocked` | run carries `source-invalidated`; forward motion refused by G-21 | §2.11.1 §2.11.2 §9.1 |

**§10.1** Every transition not in this table is refused. An allowlist, not a denylist.

## §11 · Durable state

**§11.0 Store precondition — HD-2 enforced, not assumed.** Numbered zero because it precedes every clause
below: none of them means anything on a host where the store cannot be written. Revision 2 named HD-2 and left
it unguarded, which is the same defect SA-31 describes — enforcement asserted in prose over a store that may not
exist.

- **§11.0.1 The engine performs a store preflight before any run-bearing tool executes**, at the first
  `resolveCommand`, `beginRun` or `resumeRun` of a session. The preflight establishes, by doing rather than by
  configuration lookup: the approved data directory resolves; the run-store database opens; a write commits; the
  write is readable after reopen. A configuration value naming a directory is **not** evidence that the
  directory is writable.
- **§11.0.2 On preflight failure the engine refuses the run — G-20a.** It does not proceed in a reduced mode,
  does not buffer events in memory, and does not emit an approval, artifact or handoff. The refusal names the
  unmet capability as **HD-2** and the configuration as one of §1.6's rows, so the failure is diagnosable as
  *this host cannot run the product* rather than as a transient error.
- **§11.0.3 A store that becomes unwritable mid-run terminates the run — G-20b.** A failed append is not
  retried into memory. Because §11.1 makes the log the sole authority, a run whose log stopped advancing has no
  state, and any output composed after that point would be unbacked.
- **§11.0.4 The failure class is `hard-dependency-failure`** — already terminal and non-repairable
  (`src/contracts/failures.ts:33–54`). **No new failure class is added and `FAILURE_CLASSES` is not widened.** A
  repair call cannot conjure a filesystem, and the existing class encodes exactly that policy.
- **§11.0.5 The preflight is engine, shared by both §1.6 runtimes.** Per §1.4 there is one implementation; R-1
  and R-2 differ only in how the directory came to be approved, which the preflight does not inspect.
- **§11.0.6 The preflight is not the HD-2 verification run.** It proves the store is writable now; §1.6.6
  requires a write, an interruption and a resume. Passing the preflight must never be recorded as HD-2 verified.
- **§11.0.7 A fresh store and a lost store are distinguished by a witness outside the database** (§19 D-2,
  closing §18.9). At initialization the engine writes `store-identity.json` into the approved directory beside
  the database — `store_uuid`, `created_at`, `store_schema_version`. It is a **witness only**: never read for
  run state, never an authority, and §11.1's log remains the sole account of what happened.

  | Database | Witness | Classification | Action |
  |---|---|---|---|
  | absent | absent | **fresh** — the normal R-2 first run | initialize both, record, proceed |
  | absent | **present** | **lost** — a store existed here and is gone | **refuse**, G-20a, naming HD-2 and the §1.6 row |
  | present | absent | **foreign or partially restored** | **refuse**, G-20a |
  | present | present, `store_uuid` matches | **established** | proceed |

  Both of §18.9's cases pass §11.0.1's write test, which is why the write test alone cannot separate them —
  a writable empty directory is exactly what a first run and a wiped store both look like. The witness is the
  smallest thing that makes the second case loud.

  **Residual risk, accepted and recorded:** if the directory is wiped *entirely*, both artifacts vanish and the
  store reads as fresh. No local mechanism can distinguish that from a genuine first run — it needs an anchor
  outside the directory, which HD-2 does not provide. The exposure is bounded because a resume attempt against a
  known `run_id` or `display_id` then fails loudly rather than silently returning nothing: the run is absent, not
  reset. **Revisit at the R-2 verification run**, whose interruption-and-resume step is precisely where a fresh
  store and a lost one are hardest to tell apart.

**§11.1 The append-only event log is the sole authority; all current state is derived by folding it.** There is
**no materialized `run_state` table.** Revision 1 proposed one plus a test asserting it equals the fold, and
cited decision D-F as precedent — but **D-F chose derivation precisely so the two could not drift**
(`composition-sequence.ts:33`, `phase1-decision-log.md:176`). Citing it for the opposite discipline was the
error; §18.4 already suspected it. Budgets, phase and outcome are all folded.

**§11.2** Separate SQLite file from the derived index — one database holding both would create a second
authority in a file whose purpose is to be disposable and rebuildable.

**§11.2.1 The two locations are separate configuration, because they are separate durability classes.**
`Phase1Config` currently carries `derivedDir` only (`src/config/phase1-config.ts:24`) — the disposable,
rebuildable index. The run store is authoritative and must not be rebuildable, and on R-2 its location **is the
explicitly approved writable directory** that defines the configuration (§1.6). Phase 2 therefore adds a
distinct required field for the approved data directory, resolved by the same typed-config-or-injected-port
discipline as every other location (SA-28). **Defaulting it to `derivedDir` is prohibited**: it would place the
sole authority inside the one directory the system is entitled to delete and rebuild.

| Table | Holds | Notes |
|---|---|---|
| `run` | `run_id` PK, `display_id`, `operation_id`, `run_type`, `route_provenance`, `route_verified`, `user_intent`, `target_ref`, `requested_at`, `source_sha256`, `index_version`, `spec_schema_version`, `invoked_as` | immutable after `beginRun`. `route_provenance`/`route_verified` are stored **separately from `run_type`** (§2.10.3). `invoked_as` is provenance only, never read by the Guard |
| `run_event` | `seq` PK, `run_id`, `at`, `kind`, `from_phase`, `to_phase`, `payload_json` | **append-only, sole authority.** No UPDATE, no DELETE. Two kinds are load-bearing beyond phase transitions: **`source-invalidated`** (§2.11.1, enforced by G-21) and **`handoff-built`**, whose payload carries the persisted machine handoff read by §9.2.1's value 4 |
| `artifact` | `run_id`, `artifact_sha256`, `composed_at`, `superseded_at`, `canonical_json` | written once per version by **`submitDraft`**, on a `ready` composition (§4.4). History retained: a voided artifact must stay readable to explain a void approval. **Revision 3 said `presentForApproval` here** while citing §4.4, which assigns it to `submitDraft` — N-1's repair reached §4.4, §4.5, §10 and §13 and missed this row. `presentForApproval` writes nothing (§4.5) |
| `approval` | `run_id`, `gate`, `gate_mode`, `approved_artifact_sha256`, `decision`, `approved_at`, `approved_by`, `response_source`, `verified`, `authorizing` | last three always `'model-relayed'`, `false`, `false` in Phase 2 (§7.4) |
| `clarification` | `run_id`, `round`, `gap_id`, `state`, `question`, `answer`, `answered_at` | round is Guard-derived; the model's `opened_in_round` is echo-only (§5.3.1) |
| `failure` | `run_id`, `at`, `failure_class`, `terminal`, `repairable`, `evidence_json`, `enforced_by`, `attempt` | `attempt` distinguishes original from repair |
| `stage_latency` | `run_id`, `stage`, `ms`, `measured` | `measured = false` for the drafting stage, which is unmeasurable (§11.4) |
| `tool_invocation` | `op_seq` PK, `run_id` **NULLABLE**, `tool`, `invoked_at`, `duration_ms`, `ok`, `error_code` | nullable because `resolveCommand` and refused `beginRun` calls occur **before a run exists**; keying on `run_id` would make exactly the refusals §13.2 exists to record unrecordable |

**§11.3 Deliberately absent:** token columns and `model_id` — *unavailable in the initial host-mediated
runtime; populate only from authoritative host-provided usage data. Do not estimate* (SA-33). Also absent and
now stated: `prompt_version`, `turn_id` (§3.4, pending HD-3).

**§11.3.1 `retry_count` has no column and is folded as the constant 0** (§19 D-8, ruling N-18). **Phase 2 has
no retry mechanism.** A repair is not a retry — §6.6 forbids the two budgets pooling, and repair is counted by
`repair_call_count`; there is no other re-attempt in §10. `RunEnvelope.retry_count` is required by the shipped
type and schema (`run-envelope.ts:159`; `run-envelope.schema.json:115,144`), so absence is not available the way
it is for `token_metrics`.

**And the distinction from `token_metrics` is the point, not a loophole.** A zero there would be a fabricated
*measurement* of a mechanism that exists and is unobservable — which is why SA-33 keeps it absent. Zero here is
a **true count of a mechanism that does not exist**. Recording it as 0 with the reason stated is honest;
recording it as 0 silently would be how a reader later concludes retries were attempted and none occurred.
**Revisit trigger:** any Phase 2+ re-attempt path that is not a repair, which would then need a column and a
fold.

**§11.4** `stage_latency.measured` is explicit rather than implied by absence. An incomplete total presented as
a total reads as a fast run.

**§11.4.1 The `measured` flag lives only in the store; the envelope projection omits unmeasured stages**
(§19 D-8, ruling N-19). `RunEnvelope.latency_by_stage_ms` is `Record<string, number> | undefined`
(`run-envelope.ts:164`; schema `:130–133`) and cannot carry a per-stage boolean. Rather than buy a fifth closed
widening for a flag, the projection **omits any stage whose latency is unmeasured** — so the drafting stage is
simply not present, and absence carries the meaning exactly as it already does for `token_metrics` in the same
type.

**One rule makes this safe: nothing may sum `latency_by_stage_ms`.** §11.4's objection is to an incomplete total
presented as a total; a projection that never produces a total cannot commit it. The store's `stage_latency`
table keeps `measured` for anything that needs the full picture. **Revisit trigger:** a consumer that genuinely
needs a run total, which would then earn the widening rather than infer one.

**§11.5 Maintenance operations get their own record, not a run** (§2.11).

| Table | Holds |
|---|---|
| `maintenance_operation` | `op_seq` PK, `operation_id`, `invoked_as`, `started_at`, `finished_at`, `ok`, `outcome_json`, `source_sha256_before`, `source_sha256_after`, `invalidated_run_ids_json` |

**§11.6 Atomicity and concurrency.**

- **§11.6.1** Every Guard action is **one transaction**: the `run_event` append and any dependent write commit
  together or not at all. With no derived table (§11.1) there is nothing to leave stale, which is the second
  reason to prefer the fold.
- **§11.6.2 Optimistic concurrency is required.** The v4 ruling permits invocation from multiple hosts, so two
  turns can resume one `run_id`. Every append is conditional on the `seq` the Guard read (compare-and-set on
  the run's max `seq`); a losing writer is refused and must re-read. Revision 1 had no concurrency rule at
  all. **SA-45 makes this concrete rather than hypothetical:** R-1 and R-2 are both supported and both write the
  same store, so the live case is a designer resuming in Cowork a run a developer began in Claude Code — one
  store, two host integrations, per §1.4. The CAS rule is what makes that safe, and it is a reason the store
  location is shared configuration (§11.2.1) rather than per-host.

**§11.7 Closed Phase 1 contracts widened by this design.** Revision 1 claimed Phase 1 was "touched nothing that
was built", which was false, and boasted about not widening `invocation.ts` while widening others silently.
**Three are registered in v4 §F; the fourth is added by revision 3 and needs a §F row** — recorded here rather
than left to be discovered, since that is the failure mode this table exists to prevent.

| Widening | Files | Registered |
|---|---|---|
| `ENFORCEMENT_OWNERS` + `run-guard` | `src/contracts/failures.ts:60–67` **and** the hard-coded enum in `schemas/coordinator/coordinator-output.schema.json:159–168` — a closed schema listed as Implemented at handoff | v4 §F |
| `ApprovalRecord` + `response_source`, `verified`, `authorizing` | `src/contracts/run-envelope.ts:122–131` (§7.4.1) | v4 §F |
| `'controller'` retargeted to the Guard | `src/resolver/list-by-category.ts:22,53` (`CALLER_CONTROLLER`); `src/contracts/resolution.ts:170,202` (`ClarificationGap.owner`, `Disclosure.owner` unions); `src/contracts/run-envelope.ts:9` docstring | v4 §F |
| Approved-data-directory field, distinct from `derivedDir` (§11.2.1) | `src/config/phase1-config.ts:20–33` — `Phase1Config` **and** `Phase1ConfigInput`, both closed and shipped; `resolvePhase1Config`'s validation and its `ConfigError` field set widen with them | v4 §F |

**§11.7.2 The fourth row's status, corrected.** Revision 3 marked it *"not yet — needs a v4 §F row."* The row
exists: v4 §F carries `src/config/phase1-config.ts:20–33` and its configuration tests, with the
`derivedDir`-default prohibition and the SA-45 / HD-2 citation. The register was saved after revision 3, so
this column was stale rather than wrong at the time — which is the ordinary way a status field becomes a
second account of one fact. **All four widenings are now registered and all four remain unexecuted**, pending
the v4 lock; §F is the authority for their status and this table cites it rather than restating it.

**§11.7.1** `FAILURE_CLASSES` is deliberately **absent** from this table. G-20 reuses
`hard-dependency-failure` (§11.0.4), so HD-2 enforcement widens no failure contract.

## §12 · Guard rules and tool surfaces

**§12.1** New enforcement owner **`run-guard`** — none of the existing six owns a transition, a budget or an
approval binding, and attributing these to `human-gate` would invert the distinction §1.2 exists to draw.

| Rule | Refusal | Clause |
|---|---|---|
| **G-1** | any transition absent from §10 | §10.1 |
| **G-2** | `beginRun` whose `operation_id` has **no canonical mapping in the §2.7 registry** — the route-bearing refusal, restated. Revision 3 read "without a valid `run_type`", validating a parameter G-15 forbids and §2.10.3.1 derives; a caller can no longer supply a `run_type` for G-2 to find invalid, so the only reachable defect is an unmappable operation (N-11) | §2.7 §2.10.3.1 |
| **G-3a** | `beginRun` for `modify`/`audit` while capability-gated, naming the gate | §2.4 |
| **G-3b** | `beginRun` for `new` carrying a `target` | §2.4 |
| **G-4** | any operational field in a draft (`findOperationalLeaks`) | §1.2 |
| **G-5** | `submitDraft` **when this `drafting` entry was itself a repair entry** and the run's one repair is spent | §6.2 §6.5 §6.6 |
| **G-6a** | `openClarification` when the round budget is spent | §5.3 |
| **G-6b** | `openClarification` whose `opened_in_round` ≠ the Guard-derived round | §5.3.1 |
| **G-7** | advancing past the gate without a recorded response whose hash equals the current artifact | §7.5 |
| **G-8** | a recorded response presented after the artifact changed | §7.5 |
| **G-9a** | `gate_mode: authorising` anywhere in Phase 2 | §7.2 |
| **G-9b** | any approval row with `verified` or `authorizing` true in Phase 2 | §7.4 |
| **G-9c** | Builder activation or any consequential Figma operation while HD-1 is unmet | §7.6.1 |
| **G-10** | `closeRun completed` when an independent re-render disagrees | §9.2 |
| **G-11** | a tool call from a phase whose surface (§12.2) does not include it | §12.2 |
| **G-12** | any write to `run_event` other than an append | §11.1 |
| **G-13** | an append whose CAS on the run's max `seq` fails | §11.6.2 |
| **G-14** | an unknown or ambiguous public command name, before a run exists | §2.8 |
| **G-15** | any attempt to **supply** `route_provenance`, `route_verified` or `run_type` as a parameter — all three are Guard-derived and absent from `beginRun`'s type | §2.10.3 §2.10.3.1 |
| **G-19a** | `presentForApproval` when the stored artifact's status is not `ready` | §4.6 |
| **G-19b** | `closeRun completed` when the bound artifact's `next_route` is null | §4.6 §9.1 |
| **G-16** | a maintenance operation entering a stage phase or a gate | §2.11 |
| **G-17** | any Guard, transition, schema, budget, approval-binding or completion decision reading `invoked_as` **or `approved_by`** — both are provenance/attribution only. Extended in revision 4 to cover `approved_by`, which is the control that makes §7.4.2's exemption safe rather than a hole | §2.7 §2.8 §7.4.2 |
| **G-18** | an alias producing a run configuration differing from its canonical name in anything but `invoked_as` | §2.7.0 |
| **G-20a** | **any run-bearing tool when the store preflight fails** — the approved directory does not resolve, the database will not open, or a committed write is not readable after reopen. Refusal names **HD-2** and the §1.6 configuration | §11.0.1 §11.0.2 |
| **G-20b** | **continuing a run after an append fails** — the run terminates as `hard-dependency-failure`; no in-memory buffering, no output composed past the last committed `seq` | §11.0.3 §11.0.4 |
| **G-20c** | **any run-bearing tool when the store classifies as `lost` or `foreign`** — a witness without a database, or a database without its witness. Refusal names HD-2 and the §1.6 configuration, as G-20a does | §11.0.7 |
| **G-21** | `resumeRun`, `presentForApproval`, `recordApproval`, `buildHandoff` or `closeRun completed` for a run carrying a `source-invalidated` event. Only `closeRun blocked` and `cancelRun` remain reachable; the source is never silently re-pinned | §2.11.1 §2.11.2 |

**§12.1.1 Why G-20 is a Guard rule and not a startup assertion.** G-9c blocks Builder on HD-1, and revision 2
left HD-2 — the dependency **all** enforcement rests on, including G-9c's own record — with no rule at all. A
host lacking a writable store would have run every rule above and produced records that SA-31's sentence says
mean nothing. G-20 is also the only rule that can refuse **before a run exists**, which is why §12.2 lists the
pre-run surface: the preflight gates `resolveCommand`, `beginRun` and `resumeRun` alike.

**§12.2 Tool surface by phase** — derived mechanically from §10: a tool appears here iff §10 lists it as a
trigger from that phase. A security boundary, not ergonomics (SA-16e), assembled from route and phase by
deterministic code. **This table is generated, not hand-maintained** —
`node tools/generate-tool-surface-table.ts` prints it from `src/registry/transitions.ts`, and
`node tools/generate-tool-surface-table.ts --check docs/host-turn-workflow-contract.md` fails if this block
and the registry ever disagree again.

<!-- BEGIN GENERATED §12.2 TABLE (tools/generate-tool-surface-table.ts) -->
| Phase | Tools registered |
|---|---|
| *(pre-run)* | `resolveCommand`, `beginRun`, `resumeRun` |
| `received` | `prepareContext`, `closeRun`, `failRun`, `cancelRun` |
| `preparing` | `closeRun`, `failRun`, `cancelRun` |
| `drafting` | `submitDraft`, `closeRun`, `cancelRun` |
| `awaiting-clarification` | `answerClarification`, `closeRun`, `cancelRun` |
| `validating` | `openClarification`, `presentForApproval`, `closeRun`, `failRun`, `cancelRun` |
| `awaiting-approval` | `recordApproval`, `closeRun`, `cancelRun` |
| `handoff-ready` | `buildHandoff`, `closeRun`, `cancelRun` |
| *(maintenance, no run)* | `runMaintenance` — §2.11; deliberately outside the phase model |
| *(any, Guard-initiated)* | `expireRun` — never model-callable |
<!-- END GENERATED §12.2 TABLE -->

**§12.2's evidence-update note, 2026-07-31 (Claude Code implementation session, not a revision-4 amendment).**
This table now shows `closeRun` reachable from `received`, `preparing` and `awaiting-approval`, which the
version fixed at revision 4's writing did not. Nothing about §10 changed to produce this — **row 20**
(`closeRun blocked` on a `source-invalidated` event, one of the two rows revision 4 itself added) has always
read `From: any non-terminal`, and G-21's prose has always said `closeRun blocked` and `cancelRun` are "the
only remaining exits" for an invalidated run, naming no phase restriction. The printed table simply was
never regenerated after that row was added, so it silently under-stated what §10 already specified. Recorded
in full, including why this reading is safe and not merely convenient, in
`docs/phase2-decision-log.md` PD-6. §12.2.1's own derivation rule — "every phase-scoped tool appears here iff
§10 lists it as a trigger from that phase" — is what makes this an evidence correction rather than a new
ruling: applying a rule already stated here to a row already stated here.

**§12.2.1** The derivation rule is: **every phase-scoped tool** appears here iff §10 lists it as a trigger
from that phase. `resolveCommand`, `beginRun`, `resumeRun` and `runMaintenance` are **not** phase-scoped —
they exist before or outside a run — so G-11 applies only to phase-scoped tools. `beginRun` belongs in this
set for the same reason the other three do even though revision 2's original wording did not name it: its
own §10 row has no `From` phase at all (§2.2's "—"). Revision 2 stated the rule as an unqualified "iff" and
thereby stranded `runMaintenance` in exactly the way §12.2 was rebuilt to fix: §2.11 keeps maintenance out of
§10 by design, so the rule guaranteed the omission.

`list_by_category`, the raw curated source and every Figma tool are absent from **every** surface (SA-17,
SA-18, SA-26).

## §13 · Tool interfaces

| Tool | In → out | Refuses |
|---|---|---|
| `resolveCommand` | `{public_name}` → `{operation_id, kind}` | G-14 |
| `beginRun` | `{operation_id, user_intent, target?}` — **nothing else.** No `run_id`, `display_id`, `route_confirmed`, `route_provenance`, `route_verified` or `run_type`: each is minted or derived → `{run_id, display_id, run_type, phase}` — `display_id` **minted from `run_id`** per §2.2.1, so §2.5's resume path has a key that exists | G-2, G-3a, G-3b, G-15 |
| `prepareContext` | `{run_id}` → `{candidates, schema_card, route_module, assembled_bytes}` | stale index; leakage-assertion failure |
| `submitDraft` | `{run_id, draft}` → `accepted \| repairable(evidence[]) \| terminal(evidence[])`. **Composes and, on `ready`, persists the artifact** (§4.4) | G-4, G-5 |
| `openClarification` | `{run_id}` — gaps are read from the submitted draft, not re-supplied → `{round, phase}` | G-6a, G-6b |
| `answerClarification` | `{run_id, round, answers[]}` → `{phase}` | wrong round; voids approvals |
| `presentForApproval` | `{run_id}` → `{artifact_sha256, approval_view}`. **Reads the stored artifact; composes nothing** (§4.5) | G-9a, G-19a |
| `recordApproval` | `{run_id, decision, approved_by}` → `advance \| redraft \| terminal` | G-7, G-8, G-9b |
| `buildHandoff` | `{run_id}` → `{machine_handoff, next_route}` | — (agreement is G-10's, §9.2) |
| `closeRun` | `{run_id, outcome}` → `{outcome}` | G-10; unreachable outcome |
| `failRun` | `{run_id, failure_class, evidence[]}` → `{outcome: failed}` | non-terminal class |
| `cancelRun` | `{run_id}` → `{outcome: cancelled}` | already terminal |
| `expireRun` | `{run_id}` → `{outcome: timed-out}` | not stale; **Guard-initiated only, evaluated lazily on access** (§3.3.2) — never scheduled |
| `resumeRun` | `{run_id \| display_id}` → `{phase, pending_action}` | stale → `expireRun` first, then refused against a terminal run; G-20a/c; G-21 |
| `runMaintenance` | `{operation_id, args}` → `{ok, outcome, invalidated_run_ids[]}`. `source.refresh` appends `source-invalidated` to every affected run (§2.11.1) | G-16 |

**§13.1** Every tool takes `run_id` and **derives** budgets and phase from the event log. No tool accepts a
count, a phase, an attempt number, or an assertion about its own trustworthiness from its caller. **One stated
exemption: `recordApproval{approved_by}`**, which is unverified attribution and is read by no decision anywhere
— §7.4.2, enforced by G-17. It is listed here because revision 3 stated this rule without exemption while
carrying one, which is the unargued-exemption pattern of B-3 and N-4.

**§13.2** Every tool writes a `tool_invocation` row whether it succeeds or refuses — including the pre-run
tools, which is why `run_id` is nullable (§11.2). A refusal that leaves no trace is indistinguishable from a
call never made.

**§13.3 Portability — RESOLVED: pin a code-unit sort** (§19 D-3, closing §18.7). `canonical()` orders keys with
`localeCompare(a, b, 'en')` (`compose-trusted-output.ts:109`). On a small-ICU Node build the collation can
differ, so §7.5's re-verify could fail across environments for a byte-identical artifact — and §9.2.1's value 3
re-derives a hash from stored bytes, which makes ordering a correctness property rather than a cosmetic one.

**The ruling: replace it with code-unit ordering** (`a < b ? -1 : a > b ? 1 : 0`). Environment-independent by
definition, with no runtime capability to detect and no ICU build to require.

**Measured, not assumed.** The change was checked against every recorded artifact before being chosen: across
all **98 objects** in the ten canonical fixtures — **113 distinct keys, 69 of them carrying underscores** — the
two orderings produce **identical** key order. **Zero hash movement, zero fixture rehash.** The two collations
*can* disagree in principle, on a key pair where one has `_` (U+005F) where the other has a letter; the current
key vocabulary contains no such pair.

That the difference is reachable but not instantiated is why the change carries a **regression test asserting
the two orders agree over the full key vocabulary** — so a future key that would diverge fails loudly at the
moment it is introduced, rather than silently rehashing every artifact composed after it.

**Why not require full ICU.** It makes the engine depend on a runtime build flag, which §1.4's one-engine rule
makes worse rather than better, and it can only be *tested for*, never enforced — §1.5.1's definition of a
control that is not one. Settled once in the engine and tested there, never per host (§18.7's own note).

## §14 · Advisory clauses — stated as guidance, with no enforcement point

Revision 1's largest defect was writing these as requirements. Each is desirable, none is enforceable, and
listing them is the only honest treatment.

- **§14.1 (§2.3)** `user_intent` verbatim. No deterministic code sees the raw user message, so a tidied intent
  is undetectable. The purest instance of §1.2 stated as a "must" in revision 1.
- **§14.2 (§2.10.5)** Route proposal and conversational confirmation. UX safeguards; not proof of human
  authorship.
- **§14.3 (§4.2)** No tool calls during `drafting`, and reading the assembled context before drafting.
  `submitDraft` must be reachable from `drafting`, and the Guard cannot see what was read.
- **§14.4 (§5.4)** Re-authoring rather than patching a draft. The Guard sees only the submitted draft. What is
  enforced instead: recomposition, rehash, approval void.
- **§14.5 (§4.1)** `list_by_category`'s caller check. `list-by-category.ts:53` refuses on
  `request.caller !== 'controller'` — a caller-supplied string with one value published in the source. It is a
  password, not a control. **The §12.2 surface exclusion is what enforces this**; SA-18 and revision 1 both
  leaned on the caller check as if it were enforcement.
- **§14.6 (all of §16)** The entire designer-facing surface, including §16.6's "an alias must name the
  operation it ran". Model-executed prose. Rendered by the model, not by the Guard.
- **§14.7 (§3.2)** Which host turn any call belongs to. Unobservable per §3.1.

- **§14.9 (§1.6.4)** The two host-wording rules, **except** the literal-phrase assertion in §1.6.4a, which is
  enforced. That a future artifact avoids product-name support claims and does not reintroduce the
  isolation-for-durability substitution under different words is review discipline: no deterministic check can
  read a paraphrase's intent. Listed here rather than written as a requirement, which is what §1.5.1 exists to
  prevent — and noted because a wording rule is the easiest kind of clause to mistake for a control.
- **§14.10 (§1.6.5)** The support matrix itself. The engine cannot verify a host's identity, so a row asserting
  *R-2, HD-2 verified* is a human-supplied record; §1.6.6's discipline — fill the cell with the run — is the only
  thing keeping it honest. G-20 (§12.1) is the enforced counterpart and refuses on the actual absence, which is
  the part that does not depend on anyone recording anything.

**§14.8** Anything discovered to belong here later is moved here, not quietly upgraded. The list growing is
information; the list staying artificially short is not.

---

## §15 · Retired

Deliberately empty. The open-questions section was §15 in the first draft and moved to §18. **The number is
not reused**, so a citation written against the earlier draft fails to resolve rather than resolving to
unrelated content. It also keeps the external reference **P1-FINAL §15.5** (§6.2) unambiguous.

---

## §16 · Designer-facing surface

**§16.1** Internal mechanism stays out of normal designer-facing messages: **phase names, budget counters,
Guard rule codes, operation IDs, event sequence numbers**. Revision 1 also banned run ids and artifact
hashes — wrongly, because the Phase-1-validated approval view prints `Run ${run_id}`
(`render-approval-view.ts:56`) and the binding hash (line 198), and §16.2 gives the hash a designer-facing
form. A rule that forbids what the validated renderer already does would require editing a validated
artifact to satisfy a document.

**§16.2** Every internal term has a designer-facing form; no designer-facing message introduces an internal
term that has none.

| Internal | Designer-facing |
|---|---|
| `operation_id`, `RunType`, route module | the selected operation |
| `user_intent` | the request |
| `ClarificationGap` | a question about the request |
| composed trusted output + approval view | the proposal |
| `ApprovalRecord` + `response_source` | your recorded response, what it applies to, **and that it is unverified** |
| `ApprovalRecord.approved_by` | *"attributed to X — unverified"*; **never** "approved by X" (§7.4.2) |
| `source-invalidated` event, G-21 | the design-system data changed, so this proposal must be regenerated |
| `display_id` | the run's short reference, the one you can read back (§2.2.1) |
| terminal outcome + machine handoff | the result |
| `stage_phase`, `run_event`, budgets, Guard codes | *not surfaced* |

**§16.2.1** Revision 1 mapped "`AuditReadyOutput`, findings with owner tags → the findings". **Removed:**
`AuditReadyOutput` (`coordinator-output.ts:78–90`) carries `audit_brief` and `extraction_coverage` and **no
findings** — findings are Synthesizer output and out of Phase 2 scope (§3.5). The row promised a concept
Phase 2 cannot produce.

**§16.3** Guard refusals reach the designer as what happened and what to do next; the machine-readable code is
recorded, not displayed.

**§16.4 Surfaced plainly, not hidden as mechanism:** the approval line in full (§7.8), the observe-only nature
of the gate, and — new in revision 2 — **that a recorded approval is not verified human authorization**
(§7.4). These are the most likely misreadings of the product, and a clean surface is not worth concealing
them.

**§16.5** Aggregate confidence is the **weakest child, not an average** — implemented in
`aggregateConfidence` (`coordinator-output.ts:169–176`) at composition step 8, **not** in the renderer, which
only prints it. Revision 1 credited the renderer; if it were the renderer's, it would be independently
derivable and therefore divergable.

**§16.6** Where two public names resolve to one operation, the response names the operation it ran regardless
of which name was typed. **Advisory — §14.6.**

---

## §17 · Extensibility

**§17.1** Adding a command should cost one registry row, or one well-bounded new capability.

**§17.2** A new command that forces edits to §10, §12.1 or §11 is not a command but a new *kind* of work, and
needs its own design pass.

**§17.3** The structural test: because the registry is data and nothing branches on a command string, the set
of public commands can change without changing enforcement. If that stops being true, the command layer has
leaked into the engine.

**§17.4** A genuinely new *route* is not a command-layer addition: it needs a `RunType`, a route module, a
ready-output type, a mode-asymmetry entry and schema work (§18.5).

---

## §18 · Open questions, and named external dependencies

### Named dependencies — the FD-1…FD-4 pattern, extended

| ID | Dependency | Blocks |
|---|---|---|
| **HD-1** | A verified host-provided human-approval event, or a separate trusted human-operated approval interface | Builder activation, all consequential Figma operations, any claim of human authorization (§7.6) |
| **HD-2** | A host able to run engine code against a writable local filesystem | The durable store — and therefore **all** Guard enforcement, which SA-31 states is vacuous without it. **ANSWERED by SA-45** — see below |
| **HD-3** | Authoritative host metadata for the invoked public command, and optionally turn identity | `route_verified: true` (§2.10.3); any turn-scoped reasoning (§3.4) |

**HD-2 is the one revision 1 missed entirely.** SA-31 makes the store a precondition without asking which
permitted hosts can provide one; on a host that cannot, enforcement is vacuous by SA-31's own sentence.

**HD-2 — ANSWERED by SA-45 (v4 §D3), 2026-07-31, and now enforced.** Revision 2 asked which *permitted hosts*
could satisfy HD-2 while no permitted set existed. It does now: **§1.6** names R-1 and R-2 by capability, and the
broad host claim is withdrawn. What the answer changes here:

| Aspect | Revision 2 | Revision 3 |
|---|---|---|
| Permitted-host set | Undefined; "another supported Claude host" | Two named configurations, §1.6.1 |
| HD-2 status | Open, unguarded | **Ruled and enforced** — G-20a/b, §11.0 |
| Store location | Implied, no config field | Distinct required field, `derivedDir` default prohibited (§11.2.1) |
| Multi-host concurrency | Hypothetical | Live: R-1 and R-2 on one store (§11.6.2) |
| Recording support | By product name | Per verified configuration, with evidence (§1.6.4 rule 2) |

**What remains open on HD-2 is verification, not the ruling.** Three runs were owed — R-1, R-2, and the deferred
web-via-Desktop configuration — each a write, an interruption and a resume from durable state (§1.6.6).
**R-1's landed 2026-07-31** (`docs/phase2-r1-verification.md`, evidence-update note at §1.6.5); **R-2 and the
deferred web-via-Desktop configuration remain owed.** Until each lands, its matrix cell is a claim. **HD-1 and
HD-3 are unaffected and remain open on both runtimes**, so §7.6.1's block on Builder activation and the
`model-relayed` default for every route (§2.10.3) both stand.

**A note the sweep produced.** The repository was checked on 2026-07-31 for the two §1.6.4 wording rules, since
v4's own sweep covered the spec set only. Rule 1: **clean** — eleven uses of "sandbox", none a host-capability
claim (nine Figma write-target, two execution-locality; see §1.6.4). Rule 2: **four** product-name host lines,
**all in the negative** and all left in place per v4 §F, with §1.6.4 rule 2 governing what happens when they flip.
No `src/`, `tests/` or `schemas/` file required an edit for either rule.

### Open questions

Cited elsewhere as §18.*n*.

1. **§7.6 / HD-1 — what evidence would count.** A host-emitted approval event with a signature or an
   out-of-band channel are the candidates. Until one exists, Phase 2 records responses and claims nothing.
2. **§5.2 — clarification budget of 2**, a valve default, hard-capped at 3 by a shipped schema.
3. **CLOSED by §3.3.1 / §19 D-1 — staleness threshold: 72 hours.** One value for both runtimes, which share one
   store. R-2's overnight case was the binding constraint and 72h covers a weekend (Fri 17:00 → Mon 09:00 is
   64h) with margin. Direction set by the asymmetry: nothing is built in Phase 2, so an over-eager expiry costs
   a redraft and an over-patient one costs a confusing resume list. §3.3.2's lazy evaluation removes the worst
   case — a run cannot expire while a designer is thinking, because nothing looks at it.
4. **CLOSED by §11.1** — whether a materialized `run_state` should exist. It should not; the fold is the
   authority and D-F's discipline was derivation.
5. **`/review-component` → audit route as the provisional default.** Promotion to its own route stays open,
   on one criterion: promote only if review and audit differ in their **output**, not their name. Design
   critique — hierarchy, usability, interaction quality — is a different judgment module producing different
   findings than design-system conformance, and would need `RunType` + route module + `ReviewReadyOutput` +
   mode-asymmetry entry + schema work (SA-12). If both produce conformance findings it is one capability with
   two names. **Correction to revision 1:** its structural argument cited Reviewer's input as
   `BuildEvidenceBundle`/`AuditEvidenceBundle`, but SA-2 targets the **Synthesizer**
   (`spec-amendments_v3.md:39`) and `runtime-diagrams_v3.md:73` routes `SY -->|"GapReport"| RV`. The Reviewer
   receives a `GapReport`; neither bundle exists in code. The conclusion survives — a `GapReport` is also not
   constructible from a bare component reference — but revision 1 mis-cited its evidence and promoted a
   post-hoc reinforcement of a user ruling to "Settled".
6. **§2.10.4 — can R-1 or R-2 supply HD-3.** **Rescoped by §1.6:** the question is no longer "which hosts" in the
   abstract but whether **Claude Code** and **Desktop/Cowork + local MCP** each expose authoritative metadata for
   the invoked public command. Two configurations to test, not an open field. Determines whether any direct route
   command carries verified provenance or whether every Phase 2 route is `model-relayed`. Answer it per
   configuration with evidence (§1.6.4 rule 2) — an affirmative on R-1 says nothing about R-2.
7. **CLOSED by §13.3 / §19 D-3 — pin a code-unit sort.** Full-ICU is rejected: it makes the engine depend on a
   runtime build flag, which §1.4 makes worse, and it can only be tested for, never enforced. **Measured before
   choosing:** across all 98 objects in the ten canonical fixtures (113 distinct keys, 69 with underscores) the
   two orderings agree exactly — zero hash movement, zero fixture rehash. A regression test locks the
   equivalence so a future divergent key fails at introduction. Settled once in the engine, per this question's
   own §1.4 note.
8. **CLOSED by §1.6 / SA-45** — which hosts are supported, and on what basis. Two configurations, named by
   capability; the broad install-set claim is withdrawn (§1.6.2). What remained was three HD-2 verification
   runs (§1.6.6), evidence owed against a settled ruling rather than an open question — **R-1's landed
   2026-07-31** (§1.6.5's evidence-update note); R-2 and the deferred web-via-Desktop configuration remain
   owed.
9. **CLOSED by §11.0.7 / §19 D-2 — a witness outside the database.** `store-identity.json` is written beside the
   database at initialization and read only to classify the directory: neither present → fresh; witness without
   database → **lost**, refused by G-20c; database without witness → **foreign**, refused. The witness is never
   an authority for run state; §11.1's log remains the sole account. **Residual risk accepted:** a wholly wiped
   directory reads as fresh, which no local mechanism can detect — bounded because a resume against a known
   `run_id`/`display_id` then fails loudly rather than returning an empty run. Revisit at the R-2 verification
   run, per this question's own observation.

---

## §19 · Disposition register — the nine rulings of revision 4

**Why this section exists.** Nine questions blocked executable behaviour: an implementer could not write the
code without inventing an answer, and an invented answer is exactly how this project acquired seventeen open
findings. Each row below is a **decision, not a preference** — recorded once here, written into the clause that
relies on it, and **not re-raised on this design**. The governance valve: the Architect defended a default, the
user ruled, the decision is recorded, and it closes.

**These are dispositions, not repairs.** No row widens a contract, changes a Phase 1 artifact, or commits code.
Where a ruling implies code (D-3's sort, D-6's minting, D-9's comparison), the code is owed under the v4 lock,
not written here.

| ID | Question | Ruling | Why this is the smallest safe choice | Revisit trigger |
|---|---|---|---|---|
| **D-1** | Staleness threshold (§18.3, N-24) | **72 hours** since last `run_event.at`; one value, both runtimes · §3.3.1 | Covers the binding R-2 weekend case (64h) with margin. Nothing is built in Phase 2, so expiry costs a redraft — the conservative value is cheap, and lazy evaluation (D-4) removes the mid-thought failure | A legitimate resume beyond 72h observed in the R-2 pilot |
| **D-2** | Fresh store vs lost store (§18.9) | `store-identity.json` **witness** beside the database; four-way classification; G-20c refuses `lost` and `foreign` · §11.0.7 | Both cases pass §11.0.1's write test, so the write test cannot separate them. A witness is the least that makes the dangerous case loud, and it is never read for run state — the log stays sole authority | The R-2 verification run, where a fresh and a lost store are hardest to distinguish |
| **D-3** | `localeCompare` portability (§18.7, S-6) | **Code-unit ordering.** Measured hash-neutral across all 98 fixture objects / 113 keys · §13.3 | Environment-independent by definition; no ICU build to require and none to detect. Full-ICU can only be tested, never enforced, and §1.4 forbids two hosts disagreeing on sort order | The equivalence regression test failing — i.e. a newly introduced key on which the two orders diverge |
| **D-4** | Expiry initiation (N-9) | **Lazy on access** + optional `runMaintenance` sweep. No autonomous background expiry claimed · §3.3.2 | No scheduler exists and no code runs outside a host turn; claiming otherwise would be a C4 requirement with no enforcement point | A verified scheduler capability, which would be a new named host dependency |
| **D-5** | Source-refresh invalidation (N-10) | `source-invalidated` **event** per affected run; **G-21** refuses resume, presentation, approval, handoff and completion. Exits: `closeRun blocked`, `cancelRun`. **Never re-pin** · §2.11.1–2 | Refusing forward motion needs no new vocabulary. An in-place regenerate needs round/budget semantics for "the source moved" that no clause defines and no designer requested | Designer friction high enough to justify designing a regenerate-in-place path properly |
| **D-6** | Guard-minted `display_id` (N-13) | `{run_type}-{Crockford base32 of run_id's first 40 bits}`; UNIQUE, re-mint on collision; returned by `beginRun` · §2.2.1 | Derived from an already-minted value, so no counter, no CAS race, no second authority. Deleting the column instead would remove the only run reference a designer can say out loud | A collision (the truncation is too short), or designers reporting the form unusable |
| **D-7** | Caller-supplied `approved_by` (N-12) | **Keep, explicitly exempted as unverified attribution.** G-17 extended so no decision may read it; designer form is "attributed to X — unverified" · §7.4.2 | Dropping it buys a fifth closed-schema widening for nothing. The danger is the value being *read as authority*, and the scan test removes that directly. Renaming while persisting to `approved_by` would be two names for one fact | HD-1 landing, which replaces the claim with verified identity and retires the exemption |
| **D-8** | `retry_count` and latency (N-18, N-19) | `retry_count` folded as **constant 0**, Phase 2 has no retry mechanism. `measured` lives **only** in `stage_latency`; the envelope **omits** unmeasured stages and **nothing may sum** `latency_by_stage_ms` · §11.3.1, §11.4.1 | Both are required by shipped types, so absence is unavailable for `retry_count`. A true count of a nonexistent mechanism is not SA-33's fabricated measurement — and stating the distinction is what keeps it honest. Omission for latency reuses the precedent already in the same type | A non-repair re-attempt path (needs a column); a consumer needing a latency total (earns the widening) |
| **D-9** | Independent completion verification (N-25) | G-10 compares **four independently sourced values**, including a hash **re-derived from `artifact.canonical_json` read back from storage** · §9.2.1 | Value 3 goes through stored bytes rather than the live object, so it can fail — which the previous `hashOutput(x) === hashOutput(x)` could not. Values 1 vs 2 additionally catch an approval bound to a superseded version | — |

**§19.1 What revision 4 did not disposition.** Left open on purpose, because each needs a ruling this revision
was not given: **HD-1** and **HD-3** (§18.1, §18.6) and the three HD-2 verification runs (§1.6.6); **N-14**'s
fourth tier for test-enforced clauses; **N-15**'s §E rewrite; **N-16**, **N-17**, **N-21**, **N-22**, **N-23**;
and every §11.7 widening, which waits on the v4 lock. **B-4** and **B-5** close structurally under the normative
transition registry, not by prose — which is why the ledger's own closing sentence puts that step before further
prose repair, and why revision 4 deliberately stops here.
