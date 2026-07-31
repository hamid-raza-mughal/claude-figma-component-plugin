# Phase 2 As-Built — Coordinator Runtime

**Status at close of this session:** all nine work packages from
`docs/phase2-handover-to-claude-code.md` §5 (as reordered and specified by the user's
2026-07-31 instruction) are implemented, tested, and green against the artifact-backed
gate. Built under the v4 lock recorded in `docs/phase2-decision-log.md` PD-1.

**What Phase 2 is, precisely:** the deterministic Coordinator runtime — a normative
transition registry, a Run Guard, a durable append-only store, a command registry, and the
15 Guard-mediated tools of `host-turn-workflow-contract.md` §13 — wired to the existing,
unmodified Phase 1 engine (resolver, composer, renderers). One engine, exercised through one
runtime adapter (Claude Code, R-1) so far.

## What was built, by work package

| WP | Scope | Key files |
|---|---|---|
| 1 | Phase 2 decision log; the four §11.7 widenings (`run-guard` owner, `ApprovalRecord`'s three fields, `'controller'`→`'run-guard'`, `approvedDataDirectory`) | `docs/phase2-decision-log.md`, `src/contracts/*`, `schemas/**` |
| 2 | Transition registry (§10, 20 rows) + Guard core (fold, display_id, provenance, budgets, `beginRun`) | `src/registry/transitions.ts`, `src/registry/operations.ts`, `src/guard/*` |
| 3 | Durable store: schema, preflight, witness classification, CAS append | `src/store/*` |
| 4 | Command-string static scan (§2.8, §17.3) | `tests/registry/command-string-scan.test.ts` |
| 5 | The artifact-independent tools: `resolveCommand`, `beginRun`, `resumeRun`, `failRun`, `cancelRun`, lazy expiry | `src/tools/engine.ts` |
| 6 | Phase 1 integration: `prepareContext`, `submitDraft`, `presentForApproval` | `src/tools/engine.ts`, `src/resolver/resolution-lookup-port.ts` |
| 7 | The remaining flows: `openClarification`, `answerClarification`, `recordApproval`, `buildHandoff`, `closeRun`, `runMaintenance` | `src/tools/engine.ts` |
| 8 | Adversarial/concurrency/static-scan evidence beyond WP1–7's own coverage | `tests/adversarial/phase2-adversarial.test.ts` |
| 9 | Claude Code (R-1) runtime adapter + the R-1 HD-2 verification run | `src/runtimes/claude-code/`, `docs/phase2-r1-verification.md` |

## Decisions made along the way

Nine implementation-level dispositions were required beyond the contract's own §19
register — each recorded in `docs/phase2-decision-log.md` with the ruling, why it's the
smallest safe choice, and a revisit trigger:

- **PD-1** — the v4 lock itself.
- **PD-2** — G-20c (not G-20a) governs witness-classified lost/foreign stores.
- **PD-3** — `run_event.kind` is generated 1:1 from the transition registry, not
  hand-maintained.
- **PD-4** — the Guard's caller identity is one literal, `'run-guard'`, everywhere.
- **PD-5** — `ApprovalRecord`'s `verified`/`authorizing` are typed `boolean`, not literal
  `false`, so G-9b has something to refuse.
- **PD-6** — `closeRun` is reachable from every non-terminal phase, not only the three the
  printed §12.2 table shows (row 20's "any non-terminal," added in revision 4, was never
  reflected in the table).
- **PD-7** — `prepareContext` for a `new` run has no semantic elements yet, so it uses
  `listByCategory` (the Guard's own capped escape hatch) across five standard categories
  rather than inventing a query-planning heuristic for signal that doesn't exist yet.
- **PD-8** — `prepareContext`/`submitDraft` also refuse on `source-invalidated`, extending
  G-21's literal five-tool list on the same principle it already enforces one phase later.
- **PD-9** — a genuine, previously-latent Phase 1 defect: `generateSchemaCard`'s real
  output had never been run through `assertNoLeakage` before this integration (every prior
  test used a hand-written fixture that avoided the collision). Fixed with a narrow,
  two-field exemption, not a blanket one.

Also landed: **D-3** (§13.3's code-unit sort), previously ruled but never coded — done in
WP6 with a regression test walking every key in every canonical fixture.

## Verification

```
ADALFI_ARTIFACT_DIR="<bundle>" npm run verify
# preflight PASS · typecheck PASS · lint PASS · build PASS
# 673 tests · 673 pass · 0 fail · 0 skipped
```

673 tests, up from the Phase 1 floor of 447 — 226 new tests across nine local checkpoint
commits (`a93f810`..`6edd7af` and this session's own, one per work package), none pushed.

The R-1 HD-2 verification run (`docs/phase2-r1-verification.md`) is a real write, a real
interruption (a second, independent engine instance resuming from the file), and a real
resume to completion — not inferred from the preflight passing.

## What is deliberately not claimed

- **Builder activation, or any consequential Figma operation.** `src/tools/engine.ts` never
  imports a Figma client, and none exists anywhere in this repository.
- **Verified human authorization.** Every `ApprovalRecord` this session's code can produce
  carries `response_source: 'model-relayed'`, `verified: false`, `authorizing: false` —
  enforced structurally (the tool's own parameters give a caller no other field) and by
  G-9a/G-9b. HD-1 is unmet; `recordApproval`'s decisions are exactly as authoritative as the
  caller that invoked the tool, which in every runtime today is the model.
- **R-2 (Desktop/Cowork) readiness.** Not exercised this session. `verification pending`,
  per the user's own instruction — not `not supported`, not `assumed working`.
- **Pilot or production readiness.** Phase 2 implements the `coordinator` stage only,
  matching §3.5. `builder`, `post-build`, `synthesizer`, `reviewer` remain unimplemented;
  `next_route` is recorded, never followed.
- **Authoritative host command metadata (HD-3).** Every route this session's code can
  produce is `route_provenance: 'model-relayed'`, `route_verified: false` — no runtime
  supplies HD-3 evidence yet, so `deriveRouteProvenance` never has a reason to derive
  otherwise.

## Left for a future session

- **runMaintenance's `stage_latency`, `clarification`, and `failure` tables** exist in
  `src/store/schema.ts` but are not populated — `run_event` payloads carry the same
  information today (gaps, answers, failure classes). Revisit if a consumer needs the
  structured tables specifically (§11.4's own revisit trigger already names this case for
  latency).
- **R-2 (Desktop/Cowork) adapter and its own HD-2 verification run** — WP9 built only R-1.
- **HD-1** (a verified human-approval channel) and **HD-3** (authoritative host command
  metadata) remain open dependencies exactly as revision 4 left them; nothing in this
  session narrows either.
- **The `/review-component` → `component.audit` promotion criterion** (§18 question 5) is
  unchanged — still open, still gated on measuring whether review and audit ever produce
  different output shapes.
