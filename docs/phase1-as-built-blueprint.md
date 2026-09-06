# Phase 1 As-Built Blueprint

**Model calls in Phase 1: zero.** Not "few", not "cached" — none. There is no model
adapter in this repository and no place to put one; a test asserts that no module
under `src/` can reach a network or a model client.

**Date:** 2026-07-30 · **Status:** Phase 1 complete, both gates passed
**Commits:** `1278adc` WP0 · `fe8d995` WP1 · `ead2e1f` WP2 · `300d8e9` WP3 · `800600c` WP4 · `a064453` WP5

---

## 1. What runs, end to end

```
                  ┌──────────────────────────────────────────────┐
  curated JSON ──▶│ ingestion  (the ONLY reader of raw source)    │
  (876,098 B)     │  validate → normalize → alias-resolve → hash  │
                  └───────────────┬──────────────────────────────┘
                                  │  reuse keyed on source_sha256 AND index_version
                                  ▼
                  ┌──────────────────────────────────────────────┐
                  │ derived SQLite index — 1,207 rows, ~35 ms     │
                  │  6 B-tree + FTS5 (unicode61 pinned)          │
                  │  rebuildable, never authoritative, gitignored │
                  └───────────────┬──────────────────────────────┘
                                  │
     explicit route ──▶ query planner (deterministic, no SQL, no model)
                                  │
                                  ▼
                  ┌──────────────────────────────────────────────┐
                  │ resolver — SIX operations, ZERO model calls   │
                  │  resolveBatch · materializeSelection          │
                  │  verifyBatch · expandStyle                    │
                  │  listByCategory (controller-only) · R14       │
                  └───────────────┬──────────────────────────────┘
                                  │ bounded candidates (3 default / 5 ceiling)
                                  ▼
                  ┌──────────────────────────────────────────────┐
                  │ assembler — ONE route module, ~10 KB total    │
                  │  raw curated JSON contributes ZERO bytes     │
                  └───────────────┬──────────────────────────────┘
                                  │
                        ══ FUTURE GATE: model call (Phase 2) ══
                                  │  CoordinatorJudgmentDraft
                                  ▼
                  ┌──────────────────────────────────────────────┐
                  │ §16.1 steps 1-10 — validation + composition  │
                  │  no model-generated operational field        │
                  │  survives this boundary                      │
                  └───────────────┬──────────────────────────────┘
                                  ▼
                  ┌──────────────────────────────────────────────┐
                  │ §16.1 step 11 — ONE object → TWO renderings  │
                  │  approval view  ┐ both bind the same         │
                  │  machine handoff┘ source_object_sha256       │
                  └───────────────┬──────────────────────────────┘
                                  │
                    ══ FUTURE GATE 1: human semantic approval ══
                                  │
                    ══ FUTURE: Builder (new/modify) | Synthesizer (audit) ══
```

Everything above the first future gate is **implemented and tested**. Everything at or
below it is **approved-not-implemented**.

## 2. Entry commands

The artifact bundle is **required** by `npm run verify`. Source-backed suites skip rather
than pass when it is absent, and `node --test` exits 0 with skips — so a verification
command that tolerates its absence reports green having not run 84 of the tests. It is
refused instead:

```bash
npm install
ADALFI_ARTIFACT_DIR=/path/to/Manage_DS_Components npm run verify
# preflight → typecheck → lint → build → 447 tests, 0 skipped
```

`verify` fails, before doing any work, if `ADALFI_ARTIFACT_DIR` is unset, if the curated
export is missing, or if its SHA-256 differs from the baseline manifest. It then fails
again if any test skipped, if any is `todo`, or if the test count fell below the recorded
floor — the last catching a suite file dropping out of the glob, which skip counting
cannot see because those tests do not skip, they stop existing.

```bash
npm run verify:source   # the weaker CI path — refuses to run if the bundle IS set
npm run preflight       # bundle checks alone
npm run typecheck       # tsc --noEmit, strict
npm run lint
npm run build           # emit to dist/
npm test                # raw node --test; exits 0 with skips, so not a gate
```

`verify:source` is what GitHub CI runs (`.github/workflows/ci.yml`). It permits exactly
the seven bundle-gated placeholder skips and fails on an eighth, so a green CI run cannot
be mistaken for the Phase 1 gate — and says so in its own output.

A re-export of the curated JSON invalidates the derived index and every measured number
that cites the source, so it fails the preflight by design. To run once anyway, with the
measured claims void for that run:

```bash
ADALFI_ALLOW_SOURCE_DRIFT=1 npm run verify
```

## 3. Indexing and resolver commands

Every path is **configuration**, never a hard-coded value (§5.6). Absence is an error,
not a default:

```bash
# Regenerate the v1 baseline manifest (hashes every inherited artifact)
node tools/build-baseline-manifest.ts <artifact-dir> --out docs/v1-baseline-manifest.md

# Run the migrated workbook assertions
node tools/run-assertions.ts
node tools/run-assertions.ts --out docs/assertion-results.md   # appends, never overwrites
```

Programmatic ingestion:

```ts
const config = resolvePhase1Config({
  curatedSourcePath: '/abs/path/adalfi-design-curated-tokens.json',  // or ADALFI_CURATED_SOURCE
  derivedDir: '/abs/path/derived',                                   // or ADALFI_DERIVED_DIR
});
const { manifest, database_path, reuse_decision } = ingest(config);
```

## 4. Source-hash and index-version reuse behaviour

Reuse requires **both** keys to match. On either mismatch the index is rebuilt; a stale
index is never silently used — it is the most dangerous possible failure here, because
every candidate would carry a plausible identity derived from a source that no longer
exists.

| Decision | When |
|---|---|
| `reuse` | source hash **and** index version match, and the index reports entries |
| `rebuild-absent` | no index exists for this (source, format) pair |
| `rebuild-source-changed` | the export was re-generated |
| `rebuild-index-format-changed` | `INDEX_VERSION` was bumped |
| `rebuild-unreadable` | a file wears a valid name but holds nothing usable |
| `rebuild-incomplete` | a partial build reports zero entries |

Index filenames encode both keys, so two indexes can coexist during a format migration.
The metadata is checked anyway: trusting a filename over content is precisely the
shortcut that makes staleness invisible.

## 5. Typed query generation

No arbitrary SQL, no model call, no database path exposed. Property → permitted
reference classes and property → category are fixed maps ported from the prototype. A
request without a usable term or value becomes a **structured clarification gap**, never
a guess.

```ts
const plan = planQueries({
  route: 'new',
  items: [{ semantic_id: 'root', property: 'fill', reference_text: 'warning 6 opacity fill' }],
});
// plan.queries -> typed ResolverQuery[]   plan.gaps -> ClarificationNeeded[]
```

## 6. Every resolver operation

| Operation | Contract | Model calls |
|---|---|---|
| `resolveBatch` | 3 candidates default, 5 hard ceiling, stable order, ≤3 reason codes, no complete records | 0 |
| `materializeSelection` | `candidate_id` → complete record; verifies hash, version, class, path, key, id, value, mode; rejects fabricated, altered, missing, duplicated, stale | 0 |
| `verifyBatch` | bounded read-only; returns **evidence, not alternatives** | 0 |
| `expandStyle` | style → bound-variable join; **the operation that detects the v1 font-size defect** | 0 |
| `listByCategory` | **controller-owned**, capped at 25, logged, always emits `broadened_from` | 0 |
| R14 mode asymmetry | non-blocking `Disclosure`; applies to ≤189 of 570 paint styles, not all | 0 |

## 7. Trusted composition sequence

```
 1 draft against its closed schema
 2 route / payload compatibility  ── semantic validators run here
 3 resolve every selected candidate_id
 4 verify source hash and index version
 5 materialize each complete TypedResolution
 6 cross-record semantics
 7 reject altered or hallucinated reference fields
 8 trusted aggregate confidence (weakest child, never an average)
 9 compose the route-specific output
10 validate the complete trusted output schema
11 render approval + machine views from that same object
```

Steps are **named and reported**. A failure names its step, because a stale snapshot
(step 4) and an altered path (step 7) need different responses. A failure still composes
a valid `failed` output: a run that cannot proceed still owes the human an explanation in
the same shape as a success.

## 8. Clarification and failure contracts

**Gaps** carry a stable `gap_id`, a lifecycle (`active | resolved | reopened`), an owner,
a blocking severity, evidence, and the required answer. Any active blocking gap
deterministically forces `blocked` with a **null** route. Array length is never
convergence evidence — a dropped gap and a resolved gap look identical in a count, so a
gap must appear as `resolved`, not merely be absent.

**Disclosures** are structurally non-blocking: `actionable` is the literal `false`, so
"cannot block a run" is enforced by the type system rather than by discipline.

**Failures** distinguish seven classes. Only `validation-failure` is repairable — a
repair call cannot conjure a missing dependency, and retrying an invalid input just
spends budget.

## 9. Budgets — defined, exercised nowhere

| Budget | Value |
|---|---|
| Semantic drafting calls | 1 |
| Compact repair calls | 1 |
| Self-reflection calls | 0 |
| Human clarification rounds | 3 |

Repair and clarification are **separate counters**: sharing one would let a formatting
failure consume a question the user still needs to answer.

## 10. Measured facts

| Measurement | Value |
|---|---|
| Curated source | 902,685 bytes · `adalfi-design-curated-tokens_latest.json`, exported 2026-09-06T12:41Z |
| Index entries | 1,207 = 531 variables + 570 paint + 105 text + 1 effect + **0 grid** |
| Index build | ~35 ms (34–38 across runs on the reference machine; report the range, not a single sample) |
| Post-normalization id collisions | 0 |
| SQLite / FTS | 3.51.3 · `unicode61 remove_diacritics 2` |
| Schema card | 1,866 bytes (~534 **estimated** tokens) |
| Assembled input, `new` | 15,003 bytes — **1.66%** of source |
| Assembled input, `modify` / `audit` | 15,057 / 15,033 bytes |
| Raw curated JSON in model input | **0 bytes**, all three routes |
| recall@1 / @3 / @5 | **11/12 · 12/12 · 12/12** (n=12) |
| Prototype baseline | 9/12 top-1 · 12/12 top-5 |
| Tests | **447**, 0 skipped (unit 152 · contracts 122 · resolver 127 · adversarial 46). Phase 1 shipped at 428; the mandatory verification gate and the §16.1 step binding added 19 |
| Source modules · schemas · fixtures | 46 · 6 · 13 |

`n=12`. One case is ~8 points, so recall is reported as fractions and never as a
percentage.

**Every figure in this table is re-taken by `tools/measure-source-baseline.ts`, not
transcribed.** Run it against the bundle before quoting any of them:

```
ADALFI_ARTIFACT_DIR=<bundle> node tools/measure-source-baseline.ts
```

Re-measured 2026-09-06 against the new curated export. Two figures moved for reasons
worth naming rather than burying. **Index build time** was recorded as a single
`44 ms` sample; it is machine- and cache-dependent, so it is now reported as a
range. **Assembled input** was `9,808 bytes / 1.12%` from WP6 and does not
reproduce: measured under the same recipe `prepareContext` actually uses, `new` is
15,003 bytes, and even with an empty candidate set the same assembler now yields
11,386. The judgment modules are byte-identical to WP6 and `SECTION_ORDER` is
unchanged, so the old figure describes an assembler that no longer exists. It had
no committed re-measurement path, which is why nothing caught it — and is why the
tool above now exists.

## 11. Future gate points

| Gate | Owner | Phase |
|---|---|---|
| First model call | Phase 2 model adapter | 2 |
| **Gate 1 — human semantic approval** | human | 2 |
| Builder handoff (`new`, `modify`) | Builder, sandbox only | post-2 |
| Synthesizer handoff (`audit`) | Synthesizer | post-2 |
| Gate 2 — final acceptance | human | post-2 |

`gate_mode` is `observe-only-validation` throughout Phase 1: no write plane exists, so no
approval here can authorise one.

## 12. Implemented vs approved-not-implemented

**Implemented** — executable code exists and the relevant test ran:
ingestion · derived index · CAS reuse · schema-card generator · six resolver operations ·
identity seam · lifecycle types · 24 contracts + `Disclosure` · closed 2020-12 schemas ·
judgment modules · route selection · request assembler · leakage assertion · semantic and
reference validators · §16.1 steps 1–10 in the composer · step 11 in both renderers ·
assertion runner · the mandatory verification gate.

**Approved-not-implemented** — see `coordinator-interface-ripple.md`:
Runtime Controller · model adapter · durable run store · clarification/approval UI ·
timeout and cancellation · live Figma read · Figma write adapter · Builder · Synthesizer ·
Reviewer (0–100 model retired, rewrite recorded) · plugin packaging.

**Capability-gated:** `modify` and `audit` remain gated on the Figma retrieval spike.
FD-1 and FD-2 are contract-bearing — falsifying either is an architecture amendment, not
an adapter fix.

## 13. What this phase may not be used to claim

Per §20: not production-ready, not pilot-ready, no live Coordinator, no live `new` /
`modify` / `audit`, not Cowork-compatible, not Figma-compatible, no token reduction
achieved, no prompt caching effective.

What it **does** establish: raw curated JSON contributes zero bytes to model input; the
resolver makes zero model calls and its recall is measured against corrected ground
truth; a fabricated or altered reference cannot survive materialization; `audit` cannot
reach Builder; and the artifact a human approves is provably the artifact the next stage
receives.

**Evidence-update note, 2026-07-31 — Phase 2, not Phase 1.** This section describes Phase 1
alone, and nothing above changed. Separately, Phase 2's Coordinator runtime (built on top of
this engine, unmodified) has one piece of live runtime evidence: **R-1 (Claude Code) HD-2
verified** — `docs/phase2-r1-verification.md`. This is not "Cowork-compatible" turning positive
— Cowork is R-2, a different configuration, still unverified — and it carries no claim about
HD-1 (human approval, unmet), HD-3 (host command metadata, unmet), Builder, Figma writes, or
pilot/production readiness. See `docs/phase2-as-built.md` for the full accounting.
