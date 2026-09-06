# Master Implementation Plan — DS Component Builder Agent

**Written:** 2026-09-06 · **For:** an autonomous Claude Code session working continuously
**Repository:** `~/GIT/claude-plugins/claude-figma-component-plugin`
**Starting head:** `8a1919b` on branch `builder-phase1-representation-contract`

---

## 0 · Orientation — read this paragraph twice

This repository already contains a **complete, tested, deterministic engine** (673 tests with the
artifact bundle) for the Coordinator stage of the Manage DS Components pipeline. What it does **not**
contain is anything the human owner can actually run. There is no plugin manifest, no command, no
Figma adapter, and no Builder stage. The engine is a library nobody can invoke.

**That is the entire problem this plan solves.** The owner cannot review architecture documents into
correctness; he needs to install a plugin, type a command, watch a component get built, and write down
what is wrong. Every work package below is ordered by one question: *does this get him closer to
typing a command and seeing a result?*

**Your prime directive: do not stop to ask for approval, confirmation, or a decision.** The owner has
explicitly ruled that approval requests before a runnable artifact exists are wasted time. Section 1
tells you exactly what to do instead when you would otherwise ask.

---

## 1 · Rules of engagement — non-negotiable

### 1.1 Never stop to ask

When you encounter a question, ambiguity, a missing input, or a choice between designs:

1. Resolve it from the **source-of-truth precedence order** in §1.2.
2. If that does not settle it, **choose the smallest safe option** — the one that adds the least
   surface, claims the least, and is cheapest to reverse.
3. **Record it** as an `MB-*` entry in `docs/builder-master-decision-log.md` with three fields: the
   ruling, why it is the smallest safe choice, and its revisit trigger.
4. **Keep building.**

Do not open a clarification round with the human. Do not write "awaiting confirmation" into a
document and move to something else. Do not end your turn with a question. The only acceptable
reason to halt is §1.7.

### 1.2 Source-of-truth precedence

Highest authority first. A lower source never overrides a higher one.

1. **Tracked decision logs in this repository** — `docs/phase1-decision-log.md` (D-A…D-G),
   `docs/phase2-decision-log.md` (PD-1…PD-9), `docs/builder-phase1-decision-log.md` (BP-1…BP-10),
   and `docs/builder-master-decision-log.md` (MB-*, which you create).
2. **Tracked normative contracts and code** — `docs/host-turn-workflow-contract.md` (revision 4,
   **locked**), `src/**`, `schemas/**`, `tests/**`.
3. **Tracked as-built documents** — `docs/phase1-as-built-blueprint.md`, `docs/phase2-as-built.md`,
   `docs/phase2-r1-verification.md`.
4. **This plan.**
5. **The research package** `plugin_explore_phase/` — evidence only, never a dependency (BP-1).
6. **The OneDrive planning folder** (`.../Techlogix UX Studio/Claude/AI Agentic Architect/`) —
   **frozen at 2026-07-31 and superseded.** Never cite it as current status. Its
   `manage-ds-components-spec-amendments_v4.md` is headed "PROPOSED"; that is a stale generation.
   **Revision 4 is locked** — `docs/phase2-decision-log.md` PD-1 records it. A filename or header
   containing FINAL, LOCKED or PROPOSED is not evidence of status; the decision log is.

### 1.3 Hard prohibitions

- **Never modify any file under `plugin_explore_phase/`.** It is checksum-coherent research evidence
  (BP-1, BP-7). Its twelve known defects (D-1…D-12 in `docs/builder-phase1-decision-log.md`) are
  corrected **only** in the production promotion, each preserved as a snapshot fixture whose expected
  outcome is failure.
- **Never commit a real Figma identifier** — file key, node id, variable-collection id,
  component-property id, or artifact hash over real bytes (BP-5). Sanitized fixtures recompute hashes
  over the sanitized bytes. The real-to-placeholder mapping is never committed.
- **Never introduce a direct Anthropic API call, an API-key requirement, or a second Claude
  invocation.** The active host turn is the only model invocation — this is a standing user ruling.
  Enforcement is *by refusal at a tool boundary*, never by code owning a model loop.
- **Never lower a gate to make it pass.** `sourceOnlyExpectedSkips` in `tools/run-suite.ts` stays
  exactly `7`. No `.skip`, no `.todo`, no deleted assertion, no widened type to silence a checker.
- **Never write a runtime import from `src/**` into `plugin_explore_phase/**`** (BP-2).

### 1.4 Naming discipline — this repository has two "Phase 1"s

Coordinator Phase 1 (the resolver/composer engine) and Coordinator Phase 2 (the runtime) are both
complete. **Builder Phase 1 is a third phase that merely shares the number 1.** Never write "Phase 1"
unqualified. Reserved prefixes:

| Concern | Use | Already taken |
|---|---|---|
| Decisions made under this plan | `MB-*` | `BP-*`, `PD-*`, `D-A…D-G` |
| Representation invariants | `REP-*` | `INV-*`, `G-*`, `FD-*`, `SA-*`, `CV-*` |
| Documents from this plan | `builder-master-*` | `phase1-*`, `phase2-*`, `builder-phase1-*` |

### 1.5 Every work package ends the same way

No work package is complete until all five hold:

```
npm run typecheck     # exit 0, no diagnostics
npm run lint          # exit 0, no findings
npm run build         # exit 0
npm run test:source   # 0 fail, exactly 7 skips, test count >= previous floor
git commit            # one commit, message naming the WP and its rulings
```

Run `git` **from the host shell only**. A git command issued from a mounted sandbox leaves an
unremovable `.git/index.lock` in this repository — including read-only commands like `git status`.
This is reproduced and documented.

Raise the floor in `tools/run-suite.ts` as the suite grows. A work package that adds code and no
tests is not complete.

### 1.6 Two disciplines this repository has already paid for — apply both

- **An absence gets a test, not a sentence.** `tests/unit/portability.test.ts` states the rule
  directly: "An absence is exactly the kind of claim that rots silently, so it gets a test rather
  than a sentence in a document." Every "X never happens" claim you make needs an executable check.
- **A load-bearing reference must be structured and resolvable, never prose.** This is the lesson of
  D-1…D-4: the research package passes every executable check it has — schema valid, both contracts
  at zero semantic violations, 52/52 fixtures, 105 test cases, checksums over 185 files, table-drift
  clean — while carrying seven stale load-bearing references, because they live inside sentences and
  the retired-vocabulary checker compares whole strings. **Anything logic depends on gets a typed,
  validated, existence-checked target. Free text goes in a field no logic reads.**

### 1.7 The only acceptable halt

Stop and report **only** if all three are true: (a) the blocker is external to this repository,
(b) no other track in §4 can make progress, and (c) you have already recorded the attempt. The one
realistic candidate is Figma write authorization for the sandbox file (Track C). If that blocks,
**switch tracks and keep building** — Tracks A, B and D are all independently progressable, and
Track D can be built and tested against a fake write plane.

Running out of context is not a halt. Write your state into
`docs/builder-master-progress.md` (append-only: WP id, what landed, gate output, what is next),
commit, and continue in a fresh context from that file.

---

## 2 · Exact starting state — verify before you write anything

```
branch  builder-phase1-representation-contract
head    8a1919b  "Builder Phase 1 WP0: baseline, decision log, research/production boundary"
parent  a81f7db  (branch phase2-acceptance-evidence, pushed)
main    a57309b  (phase2-acceptance-evidence is +1 and unmerged)
```

**Reproduce this baseline first and record the output verbatim in your progress file:**

```
npm run typecheck   # exit 0
npm run lint        # exit 0
npm run test:source # tests 605 · pass 598 · fail 0 · skipped 7 · todo 0
```

The strict gate (`npm run test:strict` / `npm run verify`) additionally requires the external
artifact bundle via `ADALFI_ARTIFACT_DIR`. If it is available, use it and report 673. If not, run
`verify:source` and say so — do not claim the strict gate passed.

**The dirty tree is intentional. Preserve it exactly.**

```
 M .gitignore
?? .claude/
?? plugin_explore_phase/      # 236 files, 24 MB, 0 tracked files
```

WP0 left all three as found (BP-1). Do not stage, clean, commit or `.gitignore`-away any of them.

**What exists:** 62 TypeScript modules under `src/` across `config contracts coordinator guard
ingestion judgment observability ports registry rendering resolver runtimes store tools validation`;
36 test files; `schemas/coordinator/` and `schemas/shared/`; 11 tools under `tools/`.

**What does not exist — verified 2026-09-06:** no `src/representation/`, no `schemas/representation/`,
no `tests/representation/`, no `test:evidence` script, no `plugin_explore_phase` pattern in
`eslint.config.js`, **no plugin manifest, no commands directory, no Figma client anywhere in the
repository**, and no Builder stage.

---

## 3 · Definition of done — the two milestones that matter

Everything in §4 serves one of these. Nothing else is done tonight.

### M1 — The Coordinator is runnable (the feedback unblocker)

The owner installs this repository as a plugin in Claude Code, types `/create-component` with a
component request, and drives a real run through `received → preparing → drafting → validating →
awaiting-approval → handoff-ready → terminal`, seeing the rendered approval view and the built
handoff. **No Figma access and no Builder stage are required for M1** — the Coordinator stage is
already complete in code; it has no skin.

**M1 is the single highest-value deliverable in this plan. Build it first, before Track B.** It
converts an unreviewable library into something the owner can generate a defect list against, which
is the only thing that unblocks his feedback.

### M2 — The Builder is runnable

`/create-component` continues past `handoff-ready` into an actual Figma sandbox write: the Builder
stage authors a build, deterministic code extracts what was built, post-build structural validation
runs against the approved semantic elements, and a `BuilderResult` plus `nodeMap` is recorded.

### Explicitly not part of done

Do not build, and do not block on: **HD-1** (a verified human-approval channel — every
`ApprovalRecord` stays `response_source: 'model-relayed'`, `verified: false`, `authorizing: false`,
enforced structurally and by G-9a/G-9b); **HD-3** (authoritative host command metadata — every route
stays `route_provenance: 'model-relayed'`); **R-2** (the Desktop/Cowork runtime adapter — stays
`verification pending`, not "unsupported"); the **Synthesizer** and **Reviewer** stages; the live
`modify` and `audit` routes; plugin publishing or marketplace packaging; component-library
publishing. Recording `next_route` without following it is correct and stays that way.

---

## 4 · Work packages

Tracks A→E in order. Within a track, work packages are sequential. If a track blocks per §1.7,
move to the next track and return.

---

### TRACK A — Make it runnable (M1)

The engine's public surface is the 15 Guard-mediated tools of `docs/host-turn-workflow-contract.md`
§13, and the run lifecycle is §3/§4/§10. Track A wraps them in a plugin the host can load. Read §2
(command layer), §4 (required tool calls per phase), §13 (tool interfaces) and §16 (designer-facing
surface) before starting.

#### A1 · Plugin manifest and command registry binding

**Scope.** Create the plugin skin: `.claude-plugin/plugin.json`, and the command definitions for the
three public routes plus the two maintenance operations.

**Bind commands to stable operation IDs, never to command strings.** The contract is explicit
(§2.6–§2.12, SA-37/38/39): public labels are not identities. Guard, state, telemetry, validation and
tests bind to `component.create | component.modify | component.audit` and to `RunType`; a registry
maps names and aliases → operation ID, resolved once at run creation; `invoked_as` is
provenance-only. The mapping already exists in the contract's table:

| Operation ID | Kind | RunType | Command |
|---|---|---|---|
| `component.create` | route | `new` | `/create-component` |
| `component.modify` | route | `modify` | `/modify-component` |
| `component.audit` | route | `audit` | `/audit-component`, alias `/review-component` |
| `source.refresh` | maintenance | none | provisional |
| `source.validate` | maintenance | none | provisional |

Only `component.create` needs to be operationally live at M1. `modify` and `audit` are registered
and **must refuse with a named capability-gate error**, not fail obscurely — they are gated on the
Figma retrieval spike (Track C), and `new` is not.

**Acceptance.** A test asserts every registered command resolves to a canonical operation ID; a test
asserts an unregistered command string is refused rather than inferred; a test asserts `modify` and
`audit` refuse with the capability-gate error code while `create` does not.

#### A2 · The orchestration skill — the host turn's instructions

**Scope.** The skill/command instructions that the host turn follows to drive one run. This is where
"the model is the orchestrator" lives (standing ruling): there is no dispatcher process, so the
turn's instructions are the sequencing.

Derive the required call sequence **directly from §4's per-phase table** — do not invent one:

| Phase | Entered by | Model's job | Exits via |
|---|---|---|---|
| `received` | `beginRun` | none | `prepareContext` / `failRun` |
| `preparing` | `prepareContext` | none — deterministic | its return / `failRun` |
| `drafting` | `prepareContext` returning ok | **authors the draft** | `submitDraft` |
| `validating` | `submitDraft`, internally | none | `submitDraft`'s verdict |
| `awaiting-clarification` | `openClarification` | authored the gaps | `answerClarification` / `closeRun` |
| `awaiting-approval` | `presentForApproval` | none | `recordApproval` / `cancelRun` |
| `handoff-ready` | `recordApproval` → advance | none | `buildHandoff` → `closeRun` |
| `terminal` | `closeRun` / `failRun` / `expireRun` | none | — |

The instructions must make the turn's only authoring act the draft (and clarification gaps), and must
route every other step through a tool. **The Guard refuses illegal transitions — the instructions
must never work around a refusal**, only surface it.

**Acceptance.** A test walks the documented happy path through the real tools and asserts the phase
sequence matches the table exactly; a test asserts that skipping `presentForApproval` and calling
`buildHandoff` is refused by the Guard with its named error.

#### A3 · Run continuity across turns

**Scope.** Gate 1 is a human approval, which necessarily ends a turn, and the Builder needs a
different tool set — so a run legitimately spans turns and **durable run state is the only
continuity**. The store exists (Phase 2 WP3). A2's instructions must resume from it, not from
conversational memory.

Wire and test: resume by `display_id` (`{route}-{base32}`, minted from `run_id`); the 72h lazily
evaluated staleness rule; the witness-file store-identity check for fresh-vs-lost; `resumeRun`'s
refusal paths. All four are §19 dispositions of revision 4 — implement them as written, do not
redesign them.

**Acceptance.** A test starts a run, discards the in-memory engine, constructs a second independent
engine instance from the store alone, and completes the run — the pattern
`tools/verify-r1-hd2-cross-process.ts` already establishes with two real OS processes. Reuse that
harness rather than writing a weaker same-process version.

#### A4 · Install path and the owner's smoke run

**Scope.** Make installation and a first run reproducible by a non-developer in under five minutes.
Write `docs/builder-master-owner-testing-guide.md` containing: the exact install command, where
`ADALFI_ARTIFACT_DIR` must point and what happens without it, the exact first command to type, the
expected output at each pause point, and the defect-capture template from §6.

Then **execute a real end-to-end `new` run yourself** and record it verbatim in
`docs/builder-master-m1-verification.md` — the real command, the real rendered approval view, the
real handoff, the real terminal record. Not a description of what would happen. If it fails, fix it
and re-run; M1 is not complete on a passing unit suite alone.

**Acceptance.** M1's definition in §3 is literally satisfied and evidenced by that document.
**Commit, then start the first audit cycle (§5) before Track B.**

---

### TRACK B — Builder Phase 1: productionize the representation contract

WP0 (`8a1919b`) recorded the decisions; nothing is built. Execute BP-1…BP-10 exactly as written in
`docs/builder-phase1-decision-log.md` — they are locked rulings, not proposals to re-derive.

#### B1 · The promoted contract and its schema

Create `schemas/representation/representation-contract.schema.json` with
`$id: "urn:component-representation:schema:representation-contract:0.4.1-draft"` (BP-8), exported as a
pinned constant exactly as `src/coordinator/compose-trusted-output.ts:51–52` does for the existing
schemas. It registers unchanged with the existing `SchemaRegistry` in
`src/validation/schema-validator.ts`.

Version is **`0.4.1-draft`** (BP-3) — not `0.4.0-draft`, whose bytes the research package pins by
checksum across 185 files; and not `0.4.0` or `1.0.0`, because the schema's own root `allOf` makes
`^1\.0\.0$` *require* `readinessStatus: ready_for_production`, `approvalStatus.overall: approved` and
`blockers maxItems: 0`, while the two research contracts carry 9 and 11 blockers with empty
`ownerConfirmations`. A non-draft version would encode a false approval claim in the version string.

Carry the eleven v0.4 changes (C-1…C-11 in the research CHANGELOG) into the production document, and
**correct** the promotion defects: three stale rule/blocker targets become structured targets, three
orphaned rule ids are resolved, four new rules are added. Prototype and motion behaviour stay out of
scope for 0.4.x.

#### B2 · The `REP-*` invariant registry

One row per invariant, each naming **exactly one** `EnforcementOwner` (BP-6), mirroring `INV-15`'s
rationale: "an invariant owned by 'the schema and also the validator' is in practice owned by
neither." `ENFORCEMENT_OWNERS` in `src/contracts/failures.ts:60–68` already carries the three owners
this needs — `schema`, `semantic-validator`, `reference-validator`. Do not add a fourth.

**Acceptance — bidirectional, and this is the point of the work package.** A test asserts every
declared `REP-*` has at least one positive **and** one negative fixture, **and** that every
fixture-asserted rule id is declared. The research package demonstrates both failure directions
concretely (D-5): three fixture-asserted ids (`CV-4`, `CV-9`, `CV-19`) are not declared, while `CV-3`
is declared with zero negative fixture. A one-way check cannot see either.

#### B3 · Structured, resolvable rule targets

Every rule, blocker and finding in the production contract carries a **typed target validated for
existence and kind-compatibility**. This is the direct remedy for D-1/D-2/D-3/D-7, all of which are
load-bearing references that survived a green suite because they lived in prose.

Concretely: a rule whose `detectionCondition` names a representation must reference it by a resolvable
id, and the validator must reject a reference to a representation of the wrong kind — D-3 is exactly
this (a matrix-cell rule targeting `LR-1`, which is `strategy: "list"` with no `allocation` key, while
the matrix is `LR-2`). A blocker citing an artifact must resolve that artifact on disk — D-7 is a
blocker citing a file that does not exist. Free text moves into a field no logic reads.

#### B4 · Sanitized empirical fixtures

Promote the Button and Pill experiments into `tests/representation/fixtures/empirical/` as
deterministically pseudonymized contracts, evidence artifacts and probes, with SHA-256 values
**recomputed over the sanitized bytes** so hash validation stays real without carrying a real hash
(BP-5). The promotion tool writes the mapping only into `$REPRESENTATION_EVIDENCE_DIR` — a path
outside the repository tree — and **refuses an output path inside the repository**.

Record relative source paths and aggregate hashes only in
`docs/builder-phase1-research-provenance.md`: no identifier values, no mapping, and no counts that
could act as a fingerprint. **Do not promote screenshots at all** — the research package's own
`knownLimitations` states they "establish visual evidence only and back no structural claim", so
nothing depends on them and they are the largest client-identifying payload in the corpus.

#### B5 · Defects as executable regressions

Each of D-1…D-11 becomes a snapshot fixture whose **expected outcome is failure** (BP-7), proving the
production validator catches what the research tooling could not. Include D-6 specifically — a probe
byte-identical to the contract it was supposed to differ from — as a test that a probe must differ
from its subject. And D-11 — a document declaring both "IMPLEMENTED and LOCKED" and "PROPOSED. Not
implemented." on lines 1 and 8 — as a document self-consistency check.

Fix **D-12** while here: `SPEC_SCHEMA_VERSION = '2.0.0'` is declared twice, exported at
`src/coordinator/compose-trusted-output.ts:53` and module-private at `src/tools/engine.ts:72`, with no
test asserting they agree. One declaration, one export, one agreement test.

#### B6 · The enforced boundary and the gated command

Both absences from BP-2 and BP-9, each enforced two ways:

- ESLint `no-restricted-imports` banning `**/plugin_explore_phase/**`, **with the existing
  `tools/**` / `tests/**` override at `eslint.config.js:32–37` narrowed** so the pattern stays active
  there too (today that override disables the rule wholesale).
- ESLint plus a static scan banning deep imports into `src/representation/{contracts,validation,
  evidence,selection}/**` from outside `src/representation/`. `src/representation/index.ts` is the
  only entry point. `package.json` declares no `exports` field and TypeScript imposes no
  encapsulation, so without both mechanisms the barrel is a naming convention the first deep import
  defeats.
- A static source scan over `src/`, `schemas/`, `tests/`, `tools/` and `docs/`, shaped like
  `tests/registry/command-string-scan.test.ts`.

Add `"test:evidence": "node --test --test-reporter=spec \"tests/representation/evidence-gated/*.evidence.ts\""`.
The `*.evidence.ts` suffix is **not** matched by the default glob, so gated tests never run in `npm
test`, `test:source` or `test:strict`, and **`sourceOnlyExpectedSkips` stays exactly `7`** (BP-10).
The script must fail with an explicit message when `REPRESENTATION_EVIDENCE_DIR` is unset rather than
passing empty. Every Track B acceptance item must be satisfiable from the sanitized tracked fixtures
alone — the gated command is additional assurance, never the basis of a gate.

---

### TRACK C — The Figma plane

#### C1 · Implement the read port

`src/ports/observed-tree-read-port.ts` already declares the interface — `capture(targetUrl)` returning
a reference and hash and **never content**, and `excerpt(treeRef, locators)` returning bounded
excerpts. It is read-only by construction: there is no write method to omit because none is declared.
Implement it against the available Figma read capability; **do not add a write method to this port**
(Track C2 is a separate write plane).

Honour the data boundary (locked, SA-26): raw curated JSON is readable by the ingestion service only;
the Coordinator receives bounded candidates plus a schema card and **never** an instance of this port;
the Synthesizer receives independently extracted evidence and may request only bounded verification;
**the Builder is the only writer, sandbox target only.**

#### C2 · Verify the four Figma dependencies — with falsifiers attached

`src/contracts/observed-tree.ts` names them. Test each and record the result in
`docs/builder-master-figma-spike.md`:

| Id | Claim | Bearing | If falsified |
|---|---|---|---|
| **FD-1** | Node identifiers are stable between the build call and the re-derivation call | **contract** | `nodeMap`, post-build validation and every finding locator break — **architecture amendment, not an adapter fix** |
| **FD-2** | The connector exposes bound style and variable keys, not only computed values | **contract** | Token-fidelity grading against the pinned snapshot breaks; the audit route loses its premise |
| FD-3 | A component's full subtree is retrievable in a bounded number of calls | adapter | The excerpt selector becomes mandatory rather than an optimisation |
| FD-4 | Per-run target fetch is within auth and rate limits | adapter | Fetch strategy and caching change |

**There is existing evidence that FD-1 and FD-2 hold.** The 2026-08-16 Pill experiment resolved a live
file key, node id and node kind, and read bound variables and collections through the Figma read
plane — read-only, no write issued. Treat that as a strong prior to confirm, not as a substitute for
the spike. If FD-1 or FD-2 **is** falsified, stop Track C, record it as an architecture amendment
candidate in `MB-*`, and proceed with Tracks B and D — `new` is not gated by this spike.

#### C3 · The sandbox write plane

A **separate** port for writes, sandbox target only, with the sandbox file identity supplied by
configuration and never defaulted. Follow the `derivedDir`-default prohibition already recorded in the
contract's §F against `src/config/phase1-config.ts:20–33` (SA-45/HD-2): a write target must be
explicitly configured; a silent default is prohibited.

**Build a fake implementation of this port first**, so Track D is fully testable without Figma
credentials and without touching a real file. A test asserts the real write plane is never constructed
in the test suite.

---

### TRACK D — The Builder stage (M2)

Read `Specs/builder_agent_spec.md` in the OneDrive folder for the Builder's seven dials, **as amended**
by SA-4, SA-19, SA-22, SA-26 and SA-27 — and remember §1.2: where the spec and a tracked decision
disagree, the repository wins.

#### D1 · Builder inputs, closed at the contract

The Builder receives the approved contract with **exact records inside it as resolved triples, never
via a query interface** (SA-19). Curated JSON is **not** a Builder input. Type this as a closed
contract object; a test asserts the Builder module imports no resolver, no index, and no query
surface.

#### D2 · The build-intake tool

The seam inverts, exactly as it did for the Coordinator's draft: there is no `adapter.call() → build`.
The host turn authors the build actions, then submits them to deterministic code that **accepts or
refuses with named error codes**. Enforcement is by refusal at the tool boundary. Mirror the shape of
`submitDraft` in `src/tools/engine.ts` rather than inventing a second pattern.

**SA-4 is load-bearing:** the Builder returns a **structured blocker** to the controller mid-run and
**must not self-resolve a semantic gap**. Resumption requires revalidation **and Gate 1 re-approval of
the changed contract** — otherwise a mid-run fix mutates approved intent and voids the
`ApprovalRecord` hash binding. A test asserts a self-resolved gap is refused.

#### D3 · Post-build extraction and the nodeMap

Deterministic code — not the model — re-derives what was actually built and produces `BuilderResult`
plus `nodeMap`. This is where FD-1 becomes load-bearing: re-derivation must find the same nodes the
build call created.

#### D4 · Post-build structural validation

Implement SA-27 exactly, and note what it does **not** require:

- every approved semantic element maps to a built node;
- every created node appears in `BuilderResult` or `ImplementationManifest`;
- implementation-supporting frames and wrappers are allowed **when declared and justified**;
- undeclared or unrelated nodes **fail**;
- **there is no one-to-one semantic-element/node requirement.** Do not write one.

Grading follows DR-1 (locked): deterministic pass/fail for reference fidelity, structural conformance,
accessibility AA and audit evidence integrity; anchored 1–5 rubrics with written anchors for the
subjective dimensions; any deterministic fail or `blocking` finding overrides everything; accept at ≥3
on every rubric line. **No scalar score is emitted** — the 0–100 weighted sum was removed because its
determinism was illusory when it ran on LLM-assigned severities. Do not reintroduce it.

#### D5 · Wire the Builder stage into the run lifecycle

Extend the transition registry and the Guard for the `builder` and `post-build` stages. `run_event.kind`
is **generated 1:1 from the transition registry**, not hand-maintained (PD-3) — extend the registry and
let the kinds follow. The Guard's caller identity stays the single literal `'run-guard'` everywhere
(PD-4). Add no guard number that reuses an existing one; `G-20c` and `G-21` are taken.

---

### TRACK E — End to end

#### E1 · The live `new` route

Satisfy SA-22 literally: `new` becomes operationally available only once the Run Guard, the Builder,
the sandbox write plane **and their integration tests** all exist. Write the integration test that
drives `/create-component` from command resolution through a real sandbox write to a terminal
`completed` record, across turns, resuming from the durable store.

#### E2 · The owner's M2 verification run

Execute it for real against the sandbox file and record it verbatim in
`docs/builder-master-m2-verification.md`, in the style of `docs/phase2-r1-verification.md`: real
command, real write, real extraction, real validation report, real terminal record. Update the owner
testing guide with the M2 commands. **Then run the third audit cycle.**

---

## 4A · The channel — how the two sessions work together without the owner relaying

Two Claude sessions work this repository at once, and they talk to each other through **one shared
append-only file: `AGENT-CHANNEL.md` at the repository root.** The owner is not a message bus and
must never be asked to copy anything between sessions.

| Party | Handle | Role | Can commit? |
|---|---|---|---|
| Claude Code on the owner's Mac | `EXEC` | Builds. Executes this plan. | **Yes** |
| Cowork session linked to the same Mac | `REVIEW` | Audits the committed tree, runs the suite, files findings. | No — `git` from its sandbox leaves an unremovable `.git/index.lock` |

`REVIEW` reads this repository directly over the device bridge, so it needs nothing relayed to it:
it reads your commits, runs `npm run test:source` itself, and appends findings to the channel. It
wakes on a timer, so expect its replies within roughly 20 minutes, not instantly.

### Your obligations as EXEC

- **Read `AGENT-CHANNEL.md` at the start of every work package and immediately after every audit
  cycle.** Append a `STATUS` entry when a work package lands, with the verbatim gate output.
- **Append, never edit or delete another party's entry.** Newest at the bottom. Real UTC timestamps
  from `date -u` — never invented, never copied from an earlier entry.
- **Answer every open item addressed to you** — fix it with a test that fails before and passes
  after, or reject it **citing the artifact you checked, never prose**. Then post an `ANSWER` entry.
- **Never wait for a reply.** If nothing new is addressed to you, keep building. An unanswered
  question is not a blocker: choose the smallest safe option, record it as an `MB-*` ruling, say so
  in your next entry, and continue.
- ⚠️ **`AGENT-CHANNEL.md` and `CLAUDE.md` are git-ignored by owner decision and must never be
  committed** — not added, not force-added, not included in a work-package commit. The consequence:
  the thread has **no git history and no way to restore it**, so **never run `git clean -fd` or
  `git stash -u` in this repository** — both delete untracked files, and both of these are
  untracked. `REVIEW` mirrors the channel off-machine on each poll as a backstop, but that mirror
  lags by up to twenty minutes.
- Keep entries decision-bearing. Evidence lives in the repo — a test, a fixture, a doc; the channel
  carries the pointer, not the payload.

### Push after every work package

`REVIEW` cannot run `git` against the mounted copy of this repository, but **its own container can
reach `origin` over the network and clone or fetch there**, where git works normally and the lock
hazard does not exist (verified 2026-09-06: `git ls-remote` resolves `main` at `a57309b` and
`phase2-acceptance-evidence` at `a81f7db`). So:

**After each work package's gate passes and you commit, push the branch** —
`git push -u origin builder-phase1-representation-contract` — and name the pushed SHA in your
`STATUS` entry. That moves `REVIEW` from reading a dirty working tree to reviewing real commits and
diffs, which is a materially better audit. Never push `.claude/` or anything under
`plugin_explore_phase/` (BP-1).

**Note on confidentiality:** the remote resolves without authentication, so treat it as public. That
makes BP-5 load-bearing rather than cautious — no real Figma file key, node id, variable id,
property identifier, or hash over real bytes may reach a commit, and the real-to-placeholder mapping
stays outside the repository. If any of that has already been committed in history, say so in a
`FINDING` entry rather than quietly rewriting history.

The entry format and status vocabulary are defined at the top of `AGENT-CHANNEL.md` itself. Use them
exactly; `REVIEW` parses the thread by them.

### What this replaces

An earlier draft of this plan used two files and a `docs/builder-master-progress.md`. **The channel
supersedes both.** Keep writing `docs/builder-master-progress.md` only as your own durable
context-recovery file (§1.7) — the channel is for the conversation, the progress file is for picking
up after a context reset.

---

## 5 · The three audit cycles — mandatory

Run an audit cycle at each of these points. Do not skip one because the suite is green — a green suite
over a defective package is precisely the condition D-1…D-12 documents.

| Cycle | Runs after | Focus |
|---|---|---|
| **1** | Track A / M1 | The runnable surface: command binding, phase sequencing, cross-turn continuity, refusal paths |
| **2** | Track D | Builder inputs, intake refusals, extraction, structural validation, the data boundary |
| **3** | Track E / M2 | The whole system end to end, plus every claim made in every document written tonight |

### How to run one

1. **Fan out adversarial reviewers** — separate subagents, one per dimension, each instructed to find
   defects rather than confirm correctness. Dimensions: contract-vs-code agreement · refusal-path
   completeness · absence claims without tests · load-bearing references in prose (the D-4 class) ·
   trust fields the code asserts about itself · rules whose own tooling cannot detect their violation ·
   two accounts of one fact · fixture defects masquerading as code defects · leakage of raw source or
   client identifiers.
2. **Verify every finding adversarially before acting on it.** This repository has already learned
   that reading documents produces wrong findings and building against the artifact produces right
   ones: three prior findings were wrong from reading docs alone, and a believed-missing artifact
   existed and was settled by one grep. Confirm each finding against the artifact, not the
   description.
3. **Fix confirmed findings.** Each fix gets a test that fails before it and passes after.
4. **Re-run the full gate** (§1.5) and record the cycle in `docs/builder-master-audit-cycle-N.md`:
   every finding, its verdict (CONFIRMED / PLAUSIBLE / REJECTED), what changed, and the test that now
   covers it. **Report rejected findings too** — a cycle that reports only confirmations is not
   evidence of a clean system.

### Known defect classes in this codebase's history — hunt these specifically

- **Self-asserted trust fields** — a record claiming its own verification.
- **Rules that strand their own tools** — a guard refusing a parameter another clause requires.
- **Two accounts of one fact** — the same value declared in two places with no agreement test
  (D-12 is a live instance; `tests/contracts/schema-agreement.test.ts:1–9` calls this "the project's
  known failure mode").
- **Repairs that reach some sections and not others** — three of these were found in the normative
  contract itself and classified C3.
- **Defects in your own tests and fixtures.** During Coordinator Phase 1 construction, **nine of
  eleven test failures were defects in the tests or fixtures, not in the code under test** — a
  key-order test that used `JSON.stringify`'s array replacer (which *filters*, not reorders) and so
  passed for the wrong reason; hand-written candidate ids that correctly failed `IDENTITY_MISMATCH`;
  a fabricated-path guard flagging a legitimate provenance note. When a test fails, the test is a
  suspect. And a suite that never fails while being built is not checking anything.

---

## 6 · What the owner will test, and how he records defects

He is a design owner, not a developer — he will judge this by what happens when he types a command.
The testing guide (A4) must therefore be command-by-command, with expected output shown, and must not
assume he will read code.

**Defect-capture template** — put this in the testing guide:

```
DEFECT n
Command typed:
What I expected:
What happened:
Screenshot / output:
Severity (blocks the run / wrong result / cosmetic):
```

When his defect list arrives, treat it as the **highest-authority input in the repository** — above
every document and every ruling in this plan. It is observed behaviour of the real system, which is
the one thing none of these documents can be.

---

## 7 · Reading order for the executing session

1. This plan, in full.
2. `docs/builder-phase1-decision-log.md` — BP-1…BP-10 and D-1…D-12. Locked.
3. `docs/host-turn-workflow-contract.md` — revision 4. §2, §3, §4, §10, §11, §12, §13, §16, §19.
4. `docs/phase2-as-built.md` — what the runtime already does, and its five explicit non-claims.
5. `docs/phase2-decision-log.md` — PD-1…PD-9.
6. `docs/phase1-as-built-blueprint.md` — the deterministic engine.
7. `docs/phase2-r1-verification.md` — the verification style to imitate, including its §C open issue.
8. `docs/phase2-handover-to-claude-code.md` — the format this plan follows; its status is historical.

## 8 · Commands

```
npm run typecheck                     # tsc --noEmit
npm run lint                          # eslint .
npm run build                         # tsc --project tsconfig.build.json
npm run test:source                   # suite gate, source-only, 7 known skips
npm run verify:source                 # typecheck + lint + build + test:source
ADALFI_ARTIFACT_DIR=<bundle> npm run verify   # the strict gate, 673 tests
npm run test:evidence                 # after B6; needs REPRESENTATION_EVIDENCE_DIR
```

`git` from the host shell only — never from a mounted sandbox in this repository.

## 9 · Known open items you will not close, and must not silently claim

Carry these forward untouched, and do not let a document imply otherwise:

- **HD-1** — approval is attributable but **not authenticatable** in a plugin runtime; `approved_by` is
  host-asserted, kept but exempted and unreadable by any decision (G-17 extended).
- **HD-3** — no runtime supplies authoritative host command metadata, so `deriveRouteProvenance` never
  has a reason to derive anything but `model-relayed`.
- **`token_metrics` and a trustworthy `model_id` are permanently unmeasurable**, not deferred — they
  cannot be observed from inside a tool in a host turn. Any document still calling this "awaiting the
  model adapter" is wrong about the reason. `latency_by_stage_ms` is partially populatable
  (deterministic stages yes, the drafting turn no); `tool_invocations` fully.
- **R-2 (Desktop/Cowork)** — `verification pending`.
- **The approval view's aggregate-confidence field is a hardcoded default**, disconnected from each
  candidate's real and often low confidence (`docs/phase2-r1-verification.md` §C). This is a real
  functional defect and a good early fix — it is exactly the kind of thing the owner will see first.
- **`runMaintenance`'s `stage_latency`, `clarification` and `failure` tables** exist in
  `src/store/schema.ts` and are not populated; `run_event` payloads carry the same information today.
- **The interaction-state applicability table** in `docs/interaction-state-taxonomy.md` is
  `draft — awaiting design confirmation`. Coverage is advisory (D-D, SA-23), so a draft table cannot
  cause a wrong pass or fail.
- **§18 question 5** — whether `/review-component` should be promoted from an audit alias to its own
  route. Gated on measuring whether review and audit ever produce different output shapes.
