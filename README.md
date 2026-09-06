# claude-figma-component-plugin

Deterministic core for the **Manage DS Components** pipeline — a design-system component agent that
resolves AdalFi design tokens, authors semantic intent, and hands off to a Figma builder under human
approval.

**Phase 1 is complete.** Both gates (`resolver-efficient`, `coordinator-core-ready`) pass:
**447 tests, 0 failures, 0 skipped, 0 model calls** — 428 as shipped on 2026-07-30, plus 19 for the
mandatory verification gate and the §16.1 step binding. This repository contains the runtime-neutral
deterministic engine only.

Start with `docs/phase1-as-built-blueprint.md` for what runs, and
`docs/phase1-handoff-evidence.md` for the twenty evidence items.

## What this is, precisely

| Claim | Status |
|---|---|
| Deterministic core: ingestion, derived index, resolver, contracts, validation, rendering | **implemented** — Phase 1 complete, both gates passed |
| Live model call | **none.** Zero model calls in Phase 1, by design |
| Figma access | **none.** No token, no credential, no write method exists |
| Runtime Controller | **not implemented** — Phase 2 |
| Plugin packaging | **not implemented** — deliberately deferred; the repository name anticipates it |
| Production / pilot readiness | **not claimed** |

The status vocabulary is enforced: `implemented` means executable code exists and the relevant test ran.
Nothing here is described as production-ready, pilot-ready, or Cowork-verified without that evidence.

**Phase 2 (the Coordinator runtime) is implemented on top of this engine** — see
`docs/phase2-as-built.md`. Two pieces of runtime evidence have landed since Phase 1's own gate:
**R-1 (Claude Code) HD-2 — the durable store, written to, interrupted, and resumed — verified
same-process 2026-07-31 and, separately, across two genuinely independent OS processes
2026-08-01**, evidence in `docs/phase2-r1-verification.md` (Sections A and B). That is the only
claim this evidence update makes. It does **not** mean: R-2 (Desktop/Cowork) is verified — still
not claimed; Builder is active or any Figma write happened — neither exists in this repository;
human approval is verified — every approval Phase 2 can record is model-relayed and unverified
(HD-1 is unmet); or pilot/production readiness — still not claimed. The same evidence document's
Section C separately reports a functional design-quality gap found while running a realistic
component request: the approval view's aggregate-confidence field is currently a hardcoded
default rather than a real signal — see that section for detail; it is not fixed by this update.

## Why the architecture looks like this

The predecessor design put a ~250,000-token design-token JSON into model context and asked the model to
resolve references from it. Two of fourteen resolutions in the canonical example were wrong — a fabricated
token path at High confidence, and a text style claimed at 14px that is 12px — and both passed pre-gate
validation, a human gate, and eval grading, because none of those execute.

So the model is demoted to semantic authoring, and every fact code can verify moves into code:

- **Curated JSON is authoritative; the SQLite index is derived and rebuildable.** Raw source never enters
  model context.
- **The resolver makes zero model calls.** It returns bounded candidates; the model selects by opaque
  `candidate_id`; deterministic code materializes the exact record and rejects any altered field.
- **Human approval precedes any Figma write.**

## Layout

```
src/config/        typed configuration — no hard-coded paths
src/contracts/     closed TypeScript contracts (WP1, WP3)
src/ingestion/     curated-source load, normalize, hash, index (WP2)
src/resolver/      deterministic resolution — zero model calls (WP2)
src/coordinator/   route selection, request assembly, §16.1 steps 1-10 (WP4)
src/judgment/      prompt core + one module per route (WP4)
src/validation/    schema, semantic and reference validators
src/rendering/     approval view + machine handoff from one object — §16.1 step 11 (WP5)
schemas/           JSON Schema, Draft 2020-12, format assertion on
tests/             unit · contracts · resolver · adversarial · fixtures
tools/             developer utilities (manifest generator)
docs/              decision log, baseline manifest, ripple record, taxonomy
```

Design artifacts (the curated JSON, v1 agent specs, eval workbook) live **outside** this repository and are
read through typed configuration. They are never copied in.

## Requirements

Node **≥ 22.18**. The index uses the built-in `node:sqlite` (SQLite 3.51.3 with FTS5) — no native build
step. Tests run on `node:test`; TypeScript executes via native type stripping.

## Commands

```
npm install
ADALFI_ARTIFACT_DIR=/path/to/Manage_DS_Components npm run verify
```

`npm run verify` is the mandatory Phase 1 gate: preflight → typecheck → lint → build →
**447 tests, 0 skipped**. It **refuses to run** without the artifact bundle rather than passing without it.

Tests that read the v1 artifact bundle skip rather than pass when it is absent — a vacuous pass would be
exactly the false evidence this design exists to remove. But `node --test` exits 0 with skips, so skipping
alone was not enough: a verification command could report green having silently not run 84 of the tests.
The gate now fails if the bundle is unset, missing, or hash-drifted from the baseline manifest; and fails
again if any test skipped, if any is `todo`, or if the test count fell below the recorded floor.

```
npm run verify:source             # weaker CI path — refuses to run if the bundle IS set
npm run preflight                 # bundle checks alone
npm run typecheck                 # tsc --noEmit, strict
npm run lint
npm run build                     # emit to dist/
npm test                          # raw node --test; exits 0 with skips, so not a gate
npm run test:strict               # suite gate only, bundle required

node tools/run-assertions.ts      # migrated workbook assertions
node tools/build-baseline-manifest.ts <artifact-dir> --out docs/v1-baseline-manifest.md
```

GitHub CI runs `verify:source` only. The artifact-backed gate is a controlled local/release step, because
the curated export is a design artifact that is not published to CI. CI permits exactly the seven
bundle-gated placeholder skips and fails on an eighth, and its own output states that it did **not** run the
Phase 1 gate.

## Start here

- `docs/phase1-decision-log.md` — every closed decision and why, including revisit triggers
- `docs/v1-baseline-manifest.md` — every inherited artifact, hashed, with its known defects
- `docs/coordinator-interface-ripple.md` — downstream changes decided but deliberately not implemented
- `docs/interaction-state-taxonomy.md` — the authored project convention for interaction states
- `docs/token-baseline-static.md` — measurements and estimates, kept strictly apart
- `tools/measure-source-baseline.ts` — re-takes every number above from the real bundle; run it before quoting one
- `docs/phase1-as-built-blueprint.md` — the pipeline as built, with runnable commands
- `docs/phase1-handoff-evidence.md` — all twenty §19 evidence items

## Measured

| | |
|---|---|
| Index | 1,207 entries, built in ~35 ms, 0 id collisions |
| Resolver recall | 11/12 top-1 · 12/12 top-5 (n=12) vs a 9/12 · 12/12 prototype baseline |
| Assembled model input | ~15 KB per route — **1.66% of the source**, and **zero** raw source bytes |
| Model calls | **0** |
| Suite | 1,139 tests with the bundle, 0 skipped · 1,024 tests source-only, 7 bundle-gated skips |
