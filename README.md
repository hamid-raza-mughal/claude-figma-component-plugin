# claude-figma-component-plugin

Deterministic core for the **Manage DS Components** pipeline — a design-system component agent that
resolves AdalFi design tokens, authors semantic intent, and hands off to a Figma builder under human
approval.

**Current phase: Phase 1 — Coordinator core foundation.** This repository contains the runtime-neutral
deterministic engine only.

## What this is, precisely

| Claim | Status |
|---|---|
| Deterministic core: ingestion, derived index, resolver, contracts, validation, rendering | **in progress** — WP0 complete |
| Live model call | **none.** Zero model calls in Phase 1, by design |
| Figma access | **none.** No token, no credential, no write method exists |
| Runtime Controller | **not implemented** — Phase 2 |
| Plugin packaging | **not implemented** — deliberately deferred; the repository name anticipates it |
| Production / pilot readiness | **not claimed** |

The status vocabulary is enforced: `implemented` means executable code exists and the relevant test ran.
Nothing here is described as production-ready, pilot-ready, or Cowork-verified without that evidence.

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
src/coordinator/   route selection, request assembly (WP4)
src/judgment/      prompt core + one module per route (WP4)
src/validation/    schema, semantic and reference validators
src/rendering/     approval view + machine handoff from one object (WP5)
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
npm run typecheck                 # tsc --noEmit, strict
npm run lint
npm run build                     # emit to dist/
npm test                          # deterministic suite
npm run verify                    # all of the above
```

Tests that read the v1 artifact bundle need its location. They **skip** rather than pass when it is absent —
a vacuous pass would be exactly the false evidence this design exists to remove:

```
ADALFI_ARTIFACT_DIR=/path/to/Manage_DS_Components npm test
```

## Start here

- `docs/phase1-decision-log.md` — every closed decision and why, including revisit triggers
- `docs/v1-baseline-manifest.md` — every inherited artifact, hashed, with its known defects
- `docs/coordinator-interface-ripple.md` — downstream changes decided but deliberately not implemented
- `docs/interaction-state-taxonomy.md` — the authored project convention for interaction states
- `docs/token-baseline-static.md` — measurements and estimates, kept strictly apart
