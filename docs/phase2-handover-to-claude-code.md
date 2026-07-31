# Phase 2 Handover — for Claude Code

**Written:** 2026-07-31, at the close of the Phase 1 post-review checkpoint.
**Read this before touching anything.** It exists so you do not redesign a locked architecture from generic
assumptions. The normative implementation contract is `docs/host-turn-workflow-contract.md` **revision 4**.

---

## 0 · The one-paragraph orientation

This repository is the deterministic engine for **Manage DS Components**, a design-system component agent that
resolves AdalFi design tokens, has a model author *semantic intent only*, and hands off to a Figma builder under
human approval. **Phase 1 is built and verified.** Phase 2 is the **Coordinator runtime**: command registry,
state machine, Guard, durable append-only store. The governing design discipline lives in the parent project
"AI Agentic Architect" (`CLAUDE.md`), and its most load-bearing rule here is: *the model is demoted to semantic
authoring, and every fact code can verify moves into code.*

**Why the architecture looks like this.** The predecessor design put a ~250,000-token token JSON into model
context and asked the model to resolve references. Two of fourteen resolutions in the canonical example were
wrong — a fabricated token path at High confidence, and a text style claimed at 14px that is 12px — and both
passed pre-gate validation, a human gate and eval grading, because none of those execute. Every structural
choice in this repo descends from that.

---

## 1 · Exact starting state

| | |
|---|---|
| Repo | `/Users/apple/GIT/claude-plugins/claude-figma-component-plugin` |
| Branch | `main`, HEAD `f04a459` *(docs: persist Phase 2 adversarial review ledger)* |
| Node | floor `>=22.18`; verified on `v22.22.3`. Uses built-in `node:sqlite` and `node:test`; TypeScript runs via native type stripping — no build step for tests |
| Artifact bundle | **outside** this repo. `ADALFI_ARTIFACT_DIR=/Users/apple/Library/CloudStorage/OneDrive-Techlogix/Techlogix UX Studio/Claude/AI Agentic Architect/Agentic_Pipelines/Manage_DS_Components` |
| Curated source | `<bundle>/Agentic/adalfi-design-curated-tokens.json` · 876,098 bytes · sha256 `2222a2b8eff4224f76ddad591cf6f46c6e8bb25ec7f96aebbf13941876356627` |

### The dirty tree is intentional. Preserve it.

Eight modified, six untracked. **Do not discard, revert or overwrite any of it.** It is the Phase 1
post-review work plus contract revision 4.

```
 M README.md
 M docs/host-turn-workflow-contract.md          <- revision 4 (this session)
 M docs/phase1-as-built-blueprint.md
 M docs/phase1-decision-log.md                  <- +D-E, D-F, D-G
 M docs/phase1-handoff-evidence.md
 M package.json                                 <- preflight, test:strict, test:source, verify, verify:source
 M src/coordinator/compose-trusted-output.ts     <- docstring only: "11-step" -> steps 1-10
 M tests/unit/composition-and-rendering.test.ts
?? .github/workflows/ci.yml
?? src/coordinator/composition-sequence.ts
?? tests/unit/verification-gate.test.ts
?? tools/artifact-bundle.ts
?? tools/preflight-artifacts.ts
?? tools/run-suite.ts
```

### Verification status — passing at the strongest available level

Re-run and confirmed after the revision 4 edits:

```
ADALFI_ARTIFACT_DIR="<bundle>" npm run verify
# preflight PASS (bundle present, sha256 matches baseline)
# typecheck PASS · lint PASS · build PASS
# 447 tests · 447 pass · 0 fail · 0 skipped · 0 todo · 0 cancelled
```

Source-only path independently: **363 tests, exactly 7 bundle-gated skips, PASS.**

**There is no weaker-evidence caveat to carry.** The Phase 1 gate passed with its evidence.

---

## 2 · Your first task: the checkpoint commit

It was deliberately **not** made from the Cowork session. Decision **D-B**
(`docs/phase1-decision-log.md:30–38`) requires git to run from the host / Claude Code.

**A lock is probably waiting for you.** `.git/index.lock` was created by read-only `git status` calls from the
mounted session, which cannot unlink it. Clear it first:

```bash
rm -f .git/index.lock
```

Then verify before committing, and commit as one or two changes — your call on whether revision 4 rides along:

```bash
ADALFI_ARTIFACT_DIR="<bundle>" npm run verify   # must be 447/0/0
git add -A
git commit -F - <<'MSG'
Phase 1 post-review checkpoint: mandatory verify gate, §16.1 step binding, source-only CI

D-E · verify requires the artifact bundle; preflight + TAP-driven suite gate
D-F · §16.1 is eleven steps, the composer implements ten; split made executable
D-G · CI runs verify:source only and states what it did not verify

Contract revision 4: three internal conflicts closed, nine open questions
dispositioned in a new §19. Documentation only — no §F widening executed.

Gate: 447 tests, 0 failures, 0 skipped, 0 model calls
Bundle sha256 2222a2b8eff4…
MSG
```

**Do not push unless explicitly asked.**

---

## 3 · THE BLOCKER — read this before writing any Phase 2 code

**Phase 2 implementation is gated on the `v4` amendment lock, and v4 is pending relay review.**

`manage-ds-components-spec-amendments_v4.md` (in the bundle root) §F Sequencing states that if review rejects
the replacement invariant, the contract is rewritten *"before any code is committed against it."* Every
widening Phase 2 needs is a §F row, and **§F rows are blocked on the lock**.

Verified in source — none of the four is applied:

| Widening | Current code state | Needed by |
|---|---|---|
| `ENFORCEMENT_OWNERS` + `run-guard` | still six owners, `failures.ts:60–67` | §8.5 `enforced_by` |
| `ApprovalRecord` + `response_source`, `verified`, `authorizing` | still six fields, `run-envelope.ts:122–131` | G-9b, §7.4 |
| `'controller'` retargeted to the Guard | `list-by-category.ts:22,53`; `resolution.ts:170,202` | §11.7 row 3 |
| Approved-data-directory field, distinct from `derivedDir` | `Phase1Config` has `derivedDir` only | **G-20, the entire store** |

**No Phase 2 work package avoids them** — the durable store itself needs the config field. If the user has not
said "v4 is locked," stop and ask. Do not proceed on the assumption that a pending amendment is a lock.

### Also still open, and must stay blocking

- **HD-1** — no verified human-approval event exists. **G-9c must continue to block Builder activation and every
  consequential Figma operation.** Approval responses in Phase 2 are model-relayed, unverified, non-authorizing
  records. Never describe one otherwise.
- **HD-3** — no authoritative host command metadata. Every route is `model-relayed`, `route_verified: false`.
- **Three HD-2 verification runs owed** (R-1, R-2, deferred web-via-Desktop). Each is a write, an interruption
  and a resume from durable state. *Passing the store preflight is not one of them* (§11.0.6).

---

## 4 · What revision 4 changed, so you build against the right text

**Three internal conflicts closed** — all class C3, a repair reaching some sections and not others:

1. §11.2's `artifact` row named `presentForApproval` as writer while §4.4/§4.5/§10/§13 name **`submitDraft`**.
   Now `submitDraft`. Composition happens **once**, at `submitDraft`, on a `ready` result;
   `presentForApproval` reads and renders and **writes nothing**.
2. **G-2** refused `beginRun` "without a valid `run_type`" — a parameter G-15 forbids and §2.10.3.1 derives.
   Restated: refuses an `operation_id` with **no canonical §2.7 registry mapping**.
3. §11.7 row 4's status claimed the v4 §F row was missing. **It exists.** Corrected, with §11.7.2 explaining
   the staleness.

**Nine dispositions, in the new §19 register** — each also written into the clause relying on it. Build to
these; they are closed decisions, not proposals:

| ID | Ruling | Clause |
|---|---|---|
| D-1 | Staleness **72 hours** since last `run_event.at`; one value both runtimes | §3.3.1 |
| D-2 | `store-identity.json` **witness** beside the DB; four-way fresh/lost/foreign/established; **G-20c** | §11.0.7 |
| D-3 | **Code-unit sort** replaces `localeCompare`. Measured hash-neutral across all 98 fixture objects / 113 keys | §13.3 |
| D-4 | Expiry **lazy on access** + optional maintenance sweep. **No background expiry claimed** | §3.3.2 |
| D-5 | `source-invalidated` event per affected run; **G-21** refuses resume/present/approve/handoff/complete. Never re-pin | §2.11.1–2 |
| D-6 | `display_id` minted by the Guard: `{run_type}-{Crockford base32 of run_id's first 40 bits}` | §2.2.1 |
| D-7 | `approved_by` kept, exempted as unverified attribution; **G-17 extended** so no decision may read it | §7.4.2 |
| D-8 | `retry_count` folded **constant 0**; latency `measured` store-only, envelope omits unmeasured stages, **nothing may sum** | §11.3.1, §11.4.1 |
| D-9 | G-10 compares **four independently sourced** values incl. a hash **re-derived from stored bytes** | §9.2.1 |

§18 questions 3, 7 and 9 now read CLOSED. **Guard numbering: G-20c and G-21 added; nothing reused or
reassigned** — N-17's objection applies to you too.

---

## 5 · Recommended work-package order

**Note the deviation from the user's original brief:** steps 2 and 3 are **swapped** — registry and Guard
*before* the store. The store's event kinds are shaped by the transition vocabulary, so building it first
designs them twice. This also happens to be where ledger findings B-4, N-7 and N-8 close **structurally**
rather than by prose, which the review ledger's own closing sentence argues should come before further prose
repair. If the user prefers their original order, follow them and say what it costs.

| WP | Scope | Gate |
|---|---|---|
| **0** | Execute the four §F widenings + schema mirrors *(requires the v4 lock)* | schema-agreement tests prove TS/JSON Schema still agree; 447 floor unbroken |
| **1** | Phase 2 contracts, registered widenings, config (approved data dir, **`derivedDir` default prohibited**), executable defaults | every widening registered; closed-schema discipline held |
| **2** | **Normative transition registry + Guard.** Derive Guard reachability, tool surfaces and the §4/§10/§12.2 tables from it | every §10 row reachable; no stranded tool; no orphan phase |
| **3** | Durable store: schema, append/fold, preflight, atomicity, CAS, resume | interruption/resume; CAS-loser refused; no continuation after append failure |
| **4** | Command registry, alias resolution, deterministic provenance, `display_id` minting | static scan: nothing in enforcement branches on a command string |
| **5** | Controller tool interfaces, phase-scoped exposure | G-11 authority-leak tests |
| **6** | Phase 1 engine integration; the single host-mediated drafting boundary | `list_by_category`, raw JSON, Figma tools, credentials absent from **every** surface |
| **7** | Clarification, repair, approval-response, handoff, terminal flows, G-21 | a `blocked` artifact cannot be approved or completed |
| **8** | Adversarial + lifecycle suite | tampering, replay, concurrency, expiry, refresh-races-approval |
| **9** | Claude Code (R-1) runtime adapter | R-1 HD-2 verification run **recorded as a run, not an argument** |
| **10** | Desktop/Cowork local-MCP adapter, only where the environment permits | R-2 verification run; record support per exact configuration |
| **11** | As-built docs, evidence ledger, Phase 2 decision log, Phase 3 handoff | — |

### WP0 acceptance tests

1. §11.2's `artifact` row names `submitDraft`; a consistency test asserts §4.4, §10, §11.2 and §13 agree on the writer.
2. G-2 refuses an `operation_id` with no canonical mapping; a test asserts G-2 and G-15 do not both treat `run_type` as a parameter.
3. `ENFORCEMENT_OWNERS` includes `run-guard`; `coordinator-output.schema.json:159–168` enum matches the TS union.
4. `ApprovalRecord` carries the three flags as **required**; `run-envelope.schema.json`'s `unevaluatedProperties: false` accepts them; every existing fixture still validates.
5. `Phase1Config` + `Phase1ConfigInput` carry a required approved-data-directory field; `resolvePhase1Config` throws `ConfigError` on absence; a test asserts it **cannot equal or default to** `derivedDir`.
6. Code-unit sort in place; a test asserts every recorded fixture hash is **unchanged**, plus a collation-equivalence guard over the full key vocabulary.
7. Full gate still 447+ tests, 0 skipped, with the bundle.

---

## 6 · Rules of engagement — non-negotiable

**Architecture**

- Model judgment is confined to authoring `CoordinatorJudgmentDraft`. **Nothing else.**
- Derive route, phase, budgets, sequence numbers, provenance, verification status, identifiers, hashes and
  operational fields in deterministic code. **Never trust a caller's claim** about phase, route verification,
  counters or authorization.
- **One** normative transition registry. A second Guard, a second store, a second registry or a divergent test
  path is a design defect, not a host adaptation (§1.4). The structural test: removing either host integration
  leaves the engine and its suite intact.
- Persist **every** tool invocation, successful or refused. A refusal that leaves no trace is
  indistinguishable from a call never made.
- Refuse all run-bearing operations if store preflight fails. On append failure, terminate with
  `hard-dependency-failure` — **never continue from in-memory state.**
- Keep raw curated JSON, `list_by_category`, Figma tools, credentials and any network/model client **outside**
  the model-facing and runtime tool surfaces.

**Honesty of claims** — this is the project's whole reason for existing

- The status vocabulary is enforced: `implemented` means executable code exists **and the relevant test ran.**
- **Do not weaken a gate to obtain a pass.** If a gate fails, the finding is the output.
- Never claim support for a product generally. Record support **only for the exact verified configuration** —
  never a bare product name (§1.6.4 rule 2). The literal string `desktop hosts with a sandbox` is banned
  outside §1.6.4/§14.9 and is mechanically checked.
- Designer-facing messages carry no internal phase names, counters, Guard codes, operation IDs or event
  sequence numbers — **but must plainly state that Phase 2 approval records are unverified and
  non-authorizing.** Run ids and artifact hashes *are* permitted (§16.1; the validated renderer prints both).

**Process**

- **Where a document conflicts with `host-turn-workflow-contract.md`, stop and identify the conflict.** Do not
  silently choose. Three such conflicts were found this session; assume more exist.
- Use `docs/host-turn-contract-review-ledger.md` as **defect history and convergence evidence, not as
  permission to revive superseded requirements.** A `superseded` row stays visible with a pointer; no finding
  is ever deleted.
- No aggregate count may be quoted unless `node tools/ledger-rollup.ts --check` reproduces it.
- Small, independently verifiable work packages. Tests before or with the implementation. Include happy path,
  illegal transition, stale state, replay, interruption/resume, concurrency, tampering and authority-leak cases.
  Commit only when a package is coherent and green.
- **Do not make broad speculative repairs.** For each decision record the chosen rule, why it is the smallest
  safe choice, and its revisit trigger.
- `docs/phase1-decision-log.md` is Phase-1-scoped and holds D-A…D-G. **Phase 2 decisions go in a new Phase 2
  decision log**, per v4 §F's note — appending to the Phase 1 log would make it describe decisions taken after
  its gate closed.

---

## 7 · Reading order

1. `README.md` — what is and is not claimed
2. `docs/host-turn-workflow-contract.md` **revision 4** — the normative contract. §19 first, then §10–§13
3. `docs/phase1-as-built-blueprint.md` — what actually runs, with runnable commands
4. `docs/phase1-decision-log.md` — D-A…D-G, each with a revisit trigger
5. `docs/host-turn-contract-review-ledger.md` — 57 findings; **17 open, 8 partial**
6. `docs/coordinator-interface-ripple.md` — R-1…R-7, decided and deliberately **not** implemented
7. `<bundle>/manage-ds-components-spec-amendments_v4.md` — the register; §F is the widening authority
8. `docs/v1-baseline-manifest.md` — inherited artifacts, hashed, with their known defects

**Known-bad inherited artifact, still unrepaired:** the warning-toast canonical fixture carries a hallucinated
token path and a wrong text style — and it is also v1.2's few-shot example. See the baseline manifest. Do not
treat it as ground truth.

---

## 8 · Commands

```bash
ADALFI_ARTIFACT_DIR="<bundle>" npm run verify   # THE Phase 1 gate: 447 tests, 0 skipped. Refuses without the bundle
npm run verify:source                          # weaker CI path; refuses to run if the bundle IS set
npm run preflight                              # bundle checks alone
npm run typecheck                              # tsc --noEmit, strict
npm run lint
npm run build
npm test                                       # raw node --test; exits 0 with skips, so NOT a gate
npm run test:strict                            # suite gate only, bundle required

node tools/run-assertions.ts                   # migrated workbook assertions
node tools/ledger-rollup.ts --check            # fails if the ledger roll-up disagrees with its rows
node tools/build-baseline-manifest.ts <dir> --out docs/v1-baseline-manifest.md
```

**Not implemented and deliberately deferred:** plugin packaging. The repository name anticipates it; there is
no manifest, no distribution path, and none is claimed.
