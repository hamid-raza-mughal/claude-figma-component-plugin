# Builder Phase 1 Decision Log

Builder-Phase-1-scoped. Parallel to `docs/phase1-decision-log.md` (D-A…D-G, Coordinator Phase 1) and
`docs/phase2-decision-log.md` (PD-1…PD-9, Coordinator Phase 2). Each entry: the ruling, why it is the
smallest safe choice, and its revisit trigger. Recorded once; not re-raised absent new implementation
evidence exposing a concrete contradiction.

**Scope of this phase.** Productionize the reusable component representation contract v0.4 and its
deterministic validation layer in the tracked codebase. Not in scope: the live Figma Builder executor, a
Figma write adapter, full Coordinator-to-Builder execution, HD-1 production approval, HD-3 command
provenance, live model evaluation, Synthesizer, Reviewer, the modify/audit routes, plugin publishing,
component-library publishing, or Cowork/Desktop runtime adaptation.

---

## ⚠ Naming collision — read before adding any identifier

This repository already has a "Phase 1" and a "Phase 2". **Both are Coordinator phases and both are
complete** (`docs/phase1-as-built-blueprint.md`, `docs/phase2-as-built.md`). Builder Phase 1 is a distinct,
new phase that happens to share a number. Consequences, recorded as BP-4 below:

| Concern | Builder Phase 1 uses | Already taken by |
|---|---|---|
| Decision ids | `BP-*` | `PD-*` (Coordinator Phase 2), `D-A…D-G` (Coordinator Phase 1) |
| Invariant ids | `REP-*` | `INV-*` (`src/validation/invariant-registry.ts`), `G-*` (`src/guard/errors.ts`), `FD-*` (`src/contracts/observed-tree.ts`), `SA-*`, `CV-*` (research package) |
| Document names | `builder-phase1-*` | `phase1-*`, `phase2-*` |

---

## ⚠ Confidentiality notice

This document is **sanitized**. Every real Figma file key, node id, variable-collection id,
component-property identifier and artifact hash has been replaced with a bracketed placeholder or omitted.
The concrete values exist only in the untracked research directory and in the gated evidence pack described
in BP-5. **No tracked file produced by Builder Phase 1 may carry a real identifier.** The placeholder legend
is deliberately not recorded here.

---

## Verified baseline

Branch `builder-phase1-representation-contract`, created from `phase2-acceptance-evidence` at `a81f7db`.
The pre-existing uncommitted `.gitignore` change and the untracked `plugin_explore_phase/` directory were
left exactly as found.

All three commands were executed on this branch and the output below is verbatim.

```
$ npm run typecheck
npm notice run @adalfi/coordinator-core@0.1.0 typecheck
npm notice run tsc --noEmit
                                                        # exit 0, no diagnostics

$ npm run lint
npm notice run @adalfi/coordinator-core@0.1.0 lint
npm notice run eslint .
                                                        # exit 0, no findings

$ npm run test:source
ℹ tests 605
ℹ suites 140
ℹ pass 598
ℹ fail 0
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0

Suite gate — source-only
  PASS  runner-exit-code — node --test exited 0
  PASS  no-failures — fail 0
  PASS  only-known-bundle-gated-skips — skipped 7, expected exactly 7 bundle-gated placeholders
  PASS  no-todo-tests — todo 0
  PASS  no-cancelled-tests — cancelled 0
  PASS  test-count-floor — tests 605, floor 363
  → 605 tests ran; 7 bundle-gated suites did not. This run does NOT satisfy the Phase 1 gate.
                                                        # exit 0
```

The seven skips are the documented bundle-gated placeholders (`tools/run-suite.ts`,
`sourceOnlyExpectedSkips: 7`). The strict gate (`npm run test:strict`) additionally requires the external
artifact bundle via `ADALFI_ARTIFACT_DIR`, which is not present in this environment. Builder Phase 1
acceptance therefore runs against `verify:source`; see BP-10.

---

### BP-1 · The research directory is evidence, not a dependency

**Ruling.** `plugin_explore_phase/` was created for research, experimentation, adversarial validation and
discovery. Its reusable result — the component-neutral representation contract v0.4 — is promoted into
tracked production code. The directory itself:

- contributes **zero runtime imports** to any production module;
- **stays untracked** (it has 0 tracked files today: `git ls-files plugin_explore_phase | wc -l` → `0`;
  236 files, 24 MB, no git history);
- is **never** treated as a future package boundary, and is never "cleaned up and shipped".

**Why this is the smallest safe choice.** This is the locked user decision governing the phase, so it is
recorded rather than reasoned. What the repository adds is the observation that the directory's own
`verify_checksums.py` passing over 185 canonical files establishes *internal coherence*, not tracked
provenance — an untracked directory cannot carry production history no matter how well it hashes itself.

**Revisit trigger.** None. This is the phase's governing constraint.

---

### BP-2 · The boundary is enforced by lint and by a scan, not by prose

**Ruling.** BP-1's "no runtime import" is enforced two ways: an ESLint `no-restricted-imports` pattern
banning `**/plugin_explore_phase/**`, and a static source scan over `src/`, `schemas/`, `tests/`, `tools/`
and `docs/`. The existing `tools/**` / `tests/**` override in `eslint.config.js:32–37`, which today disables
`no-restricted-imports` wholesale, is narrowed so this pattern stays active there too.

**Why this is the smallest safe choice.** The rule being enforced is an *absence*, and this repository has
already learned that absences rot silently — `tests/unit/portability.test.ts:1–10` states it directly: "An
absence is exactly the kind of claim that rots silently, so it gets a test rather than a sentence in a
document." Lint alone would not catch a `readFileSync` reaching into the directory; a scan alone would not
catch it at authoring time. Both cost one rule each.

**Revisit trigger.** A legitimate need for a test to read the research directory — which would be a request
to change BP-1, not BP-2.

---

### BP-3 · The promoted contract is version `0.4.1-draft`

**Ruling.** The production representation contract is versioned **`0.4.1-draft`**.

**Why this is the smallest safe choice.** Three candidates were considered and two rejected on evidence:

- **`0.4.0-draft`** is rejected because the research package pins that version by checksum across 185 files
  and archives it as an immutable lineage point (`versions/VERSIONS.json`). The production document differs
  in content — three stale rule and blocker targets are corrected into structured targets, three orphaned
  rule ids are resolved, and four new rules are added. Two materially different documents sharing one version
  string is this repository's explicitly stated known failure mode
  (`tests/contracts/schema-agreement.test.ts:1–9`: "Two representations of one contract is the project's
  known failure mode").
- **`0.4.0` or `1.0.0`** are rejected because the research schema's own root `allOf` makes the version string
  load-bearing policy: a `contractVersion` matching `^1\.0\.0$` *requires* `readinessStatus =
  ready_for_production`, `approvalStatus.overall = approved`, and `blockers maxItems: 0`. One research
  contract carries 9 open blockers and the other 11, and both have `ownerConfirmations: []`. Any non-draft
  version would encode a false approval claim in the version string itself.
- **`0.4.1-draft`** signals a corrected successor while preserving traceable lineage
  (`0.2.0-draft → 0.3.0-draft → 0.3.1-draft → 0.4.0-draft → 0.4.1-draft`), and keeps the `-draft` suffix
  honest: the schema gate permits only `not_ready` or `validation_ready` for a draft.

**Revisit trigger.** An owner confirmation clearing every blocker on a promoted contract, which is the only
condition under which a `1.0.0` version would stop being a false claim.

---

### BP-4 · Identifier prefixes

**Ruling.** Builder Phase 1 uses `BP-*` for decisions, `REP-*` for invariants, and `builder-phase1-*` for
document names. See the collision table above for what each avoids.

**Why this is the smallest safe choice.** `PD-*` and `INV-*` are live in tracked code and docs today. Reusing
either would make a cross-reference ambiguous in exactly the way `docs/phase2-decision-log.md` PD-2 had to
resolve for `G-20a`/`G-20c` — one label, two meanings, discovered late.

**Revisit trigger.** None expected. A future phase adding a family should record its prefix here first.

---

### BP-5 · Evidence policy — sanitized fixtures tracked, mapping never committed

**Ruling.** The Button and non-Button (Pill) experiments are promoted as regression fixtures in two layers:

1. **Sanitized, tracked.** Deterministically pseudonymized contracts, evidence artifacts and probes live in
   `tests/representation/fixtures/empirical/`. Artifact SHA-256 values are **recomputed over the sanitized
   bytes**, so hash validation stays real without carrying a real hash.
2. **Real, gated, outside the repository.** The unmodified research inputs live at
   `$REPRESENTATION_EVIDENCE_DIR` — a path **outside the repo tree**, so no `.gitignore` change is needed and
   no accidental `git add` can reach them. The environment variable name is client-neutral by design.

**The real-to-placeholder mapping is never committed.** The promotion tool writes it only into the gated
directory and refuses an output path inside the repository. `docs/builder-phase1-research-provenance.md`
records relative source paths and aggregate hashes only — no identifier values, no mapping, and no counts
that could act as a fingerprint.

Screenshots are not promoted at all: the research package's own `knownLimitations` states that screenshots
"establish visual evidence only and back no structural claim in this contract", so nothing depends on them
and they are the largest client-identifying payload in the corpus.

**Why this is the smallest safe choice.** A committed mapping would make every placeholder trivially
reversible, which is sanitization in name only — the tracked repository would then carry the client's design
system in a thin disguise. Keeping the mapping with the secrets it describes is the only arrangement where
"the tracked fixtures contain no client data" is a true statement rather than a hopeful one.

**Revisit trigger.** Written client authorization to track the real identifiers, which would be a data
governance decision, not an engineering one.

---

### BP-6 · One invariant, one enforcement owner, checked in both directions

**Ruling.** Every production representation invariant is one `REP-*` row in a single registry carrying
exactly one `EnforcementOwner`. A test asserts, in **both directions**, that every declared rule id has at
least one positive and one negative fixture, and that every fixture-asserted rule id is declared.

**Why this is the smallest safe choice.** This mirrors `INV-15` in `src/validation/invariant-registry.ts`
("Every invariant names exactly one enforcement owner") and its stated rationale: "an invariant owned by 'the
schema and also the validator' is in practice owned by neither." The bidirectional fixture check exists
because the research package demonstrates the concrete failure: two of its rules were moved into the schema
and their ids survived only in the fixture manifest, while a third declared rule acquired no negative fixture
at all. A registry that is only checked one way cannot detect either condition.

`ENFORCEMENT_OWNERS` in `src/contracts/failures.ts:60–68` already contains the three owners this phase needs
(`schema`, `semantic-validator`, `reference-validator`), so no existing contract file changes.

**Revisit trigger.** A rule that genuinely requires two enforcement points — which would first need a written
account of how the two are kept from disagreeing.

---

### BP-7 · The research package is frozen; defects are fixed only in the promotion

**Ruling.** No file under `plugin_explore_phase/` is modified by Builder Phase 1. The verified defects
recorded below are corrected **only** in the production promotion. Each defect is additionally preserved as a
*snapshot fixture* whose expected outcome is failure, so the defect becomes an executable regression rather
than a paragraph.

**Why this is the smallest safe choice.** The research package is checksum-coherent and its archives are
declared immutable; editing it would invalidate the very evidence being promoted, and would also destroy the
record of what the experiments actually found. Preserving each defect as a failing fixture means the
production validator is proven to catch it, which is a stronger claim than "we fixed the text".

**Revisit trigger.** None. A future research iteration would create a new version directory, not edit this
one.

---

### BP-8 · The reusable schema uses a client-neutral URN `$id`

**Ruling.** `schemas/representation/representation-contract.schema.json` declares

```
$id: "urn:component-representation:schema:representation-contract:0.4.1-draft"
```

The existing Coordinator schemas under `schemas/coordinator/` and `schemas/shared/` keep their current
`https://adalfi.dev/schemas/…` identities and are not touched.

**Why this is the smallest safe choice.** The representation contract is intended to be reusable across
clients; giving it an identity derived from one client's name would bake that client into the reusable
artifact permanently and inconsistently with its own neutrality requirement. A URN is client-neutral, encodes
the version, and invents no domain that could lapse or mislead. JSON Schema `$id` need not be
dereferenceable, and Ajv's `getSchema(id)` accepts any string, so this works unchanged with the existing
`SchemaRegistry` in `src/validation/schema-validator.ts`. The `$id` is exported as a pinned constant, exactly
as `src/coordinator/compose-trusted-output.ts:51–52` does for the existing schemas.

**Revisit trigger.** A decision to publish the contract at a resolvable URL, at which point the URN becomes
an alias rather than a mistake.

---

### BP-9 · The public barrel is enforced, not conventional

**Ruling.** `src/representation/index.ts` is the module's only importable entry point. Deep imports into
`src/representation/contracts/**`, `validation/**`, `evidence/**` or `selection/**` from anywhere outside
`src/representation/` are banned by an ESLint `no-restricted-imports` pattern and by a static scan.

**Why this is the smallest safe choice.** `package.json` declares no `exports` field and is `private: true`,
and TypeScript imposes no module encapsulation of its own. Without a lint rule and a scan, a barrel is a
naming convention that the first `import { … } from '../representation/validation/semantic.ts'` quietly
defeats — and the internal surface is exactly what Builder Phase 2 must not couple to. The scan follows the
shape already used by `tests/registry/command-string-scan.test.ts`.

**Revisit trigger.** Adding an `exports` map to `package.json`, which would enforce the same boundary at the
resolver level and make the lint rule redundant rather than wrong.

---

### BP-10 · Gated evidence gets its own command; the default skip count does not move

**Ruling.** Tests requiring the real evidence pack live in `tests/representation/evidence-gated/` and are
named `*.evidence.ts`. That filename is **not matched** by the default discovery glob
(`tests/**/*.test.ts`, `package.json:14`), so they never run in `npm test`, `npm run test:source` or
`npm run test:strict`. They run only via a new script:

```
"test:evidence": "node --test --test-reporter=spec \"tests/representation/evidence-gated/*.evidence.ts\""
```

which fails with an explicit message when `REPRESENTATION_EVIDENCE_DIR` is unset, rather than passing empty.
**`sourceOnlyExpectedSkips` in `tools/run-suite.ts` stays exactly `7`.**

**Why this is the smallest safe choice.** The alternative — adding the gated tests to the default suite and
raising the expected-skip count — makes "seven known bundle-gated placeholders" into a vaguer number covering
two unrelated gating mechanisms, and a suite whose skip budget grows is one where a genuinely new skip stops
being visible. `tools/run-suite.ts` treats the skip count as a precise assertion; keeping it precise is worth
one extra script. Every Builder Phase 1 acceptance item is satisfiable from the sanitized tracked fixtures
alone, so the gated command is additional assurance and never the basis of the gate.

**Revisit trigger.** The gated pack becoming a standard part of the development environment, at which point
folding it into `test:strict` alongside the artifact bundle would be reasonable.

---

## Verified research defects

Each was confirmed by direct inspection of file content on 2026-08-16, against a research package in which
**every executable check passes**: schema validity, both contracts at 0 semantic violations, 52/52 fixtures,
42 + 44 + 19 test cases, structural retired-vocabulary check, checksum verification over 185 files,
generated-table drift check, and all three probes behaving as their reports predict.

That combination — a fully green suite over a package carrying seven live defects — is the empirical
justification for the structured-rule-target model this phase introduces. Identifier values are placeholdered
per the confidentiality notice; `<research>` denotes `plugin_explore_phase/`.

| Id | Defect | Location | Why the suite cannot see it |
|---|---|---|---|
| **D-1** | Rule `VR-9`'s `detectionCondition` still names three v0.3 vocabulary tokens (`appliesToScopes=buttons`, `classification=button_specific_pattern`, `candidate_cross_component_invariant`). All three are **absent** from the v0.4 schema, so the rule is unactionable as written. | `<research>/Builder_comp_rep_docs/component-representation-contract.json:1953`; propagated verbatim to the generated grounding pack `:49` | The tokens sit inside a sentence — see D-4 |
| **D-2** | Blocker `BLK-5` and a `knownLimitations` entry both assert "No non-Button component has been analyzed in this file or elsewhere." The non-Button experiment exists, and `CHANGELOG.md:5` cites it as the reason v0.4 exists. Doubly stale: factually false, and phrased in retired vocabulary. | same file `:2149–2150`, `:2186` | Free-text prose; no validator reads it |
| **D-3** | Rule `VR-1` guards matrix cells but its `detectionCondition` targets **`LR-1`**, which in that contract is `strategy: "list"` with no `allocation` key. The matrix is `LR-2`. Replicated verbatim into all three probe files. A Builder acting on this rule would guard the wrong representation. | `<research>/non_button_validation/pill/non-button-experimental-contract.json`, `validationRules[0]` | The representation id is a substring of prose, not a resolvable reference |
| **D-4** | **Root cause of D-1/D-2/D-3.** `check_retired_structure.py:114` is `elif isinstance(node, str) and node in RETIRED_ENUM_VALUES:` — whole-string equality on a leaf value, so a token inside a sentence never matches. And `generate_tables.py --check` verifies that markdown *matches contract prose verbatim*, so identical stale text in both is a PASS. Neither tool closes the gap; **both propagate it**. | `<research>/Builder_comp_rep_docs/check_retired_structure.py:114`; `generate_tables.py` | n/a — this is the mechanism |
| **D-5** | The fixture manifest asserts `expectedRuleId` for three ids (`CV-4`, `CV-9`, `CV-19`) that are **not declared** in `contractIntegrityRules`; conversely `CV-3` is declared with **zero** negative fixture. Verified by set difference. | `<research>/Builder_comp_rep_docs/fixtures/manifest.json` vs the contract's `contractIntegrityRules` | The manifest is only checked one way |
| **D-6** | The shared-build-frame probe is **byte-identical** to the deliverable contract (identical SHA-256, verified). "Probe C passes" is therefore a restatement of "the contract passes", not an independent result. | `<research>/non_button_validation/pill/probe-C-shared-build-frame.json` | Nothing compares a probe to the artifact it is supposed to differ from |
| **D-7** | Blocker `PB-2` cites an allocation-evidence artifact that **does not exist** on disk. | `<research>/non_button_validation/pill/`, blocker `PB-2` | The reference is prose, so no artifact resolution runs |
| **D-8** | Seven of nine non-Button blockers are stale. The v0.4 migration performed **string substitution only** (its own report: "remapped mechanically (substitution only, no meaning altered)"), renaming fields while leaving v0.3.1 claims intact — so `PB-1`, `PB-2`, `PB-3`, `PB-4`, `PB-7`, `PB-8` and `PB-9` each describe a defect the contract's own current data contradicts. `PB-5` and `PB-6` remain genuine. | non-Button contract `approvalStatus.blockers` | Blocker text is prose |
| **D-9** | Blocker-count drift: the contract carries **11** blockers; the component-analysis document's blocker table lists **10**, omitting the migration-review blocker. (The reported "12 vs 11" discrepancy was **not found** — no file claims 12.) | non-Button contract vs `non-button-component-analysis.md` §11 | No count is recomputed from the contract |
| **D-10** | `PB-10` is genuine: the hidden component set's 24 prototype reactions appear **only** in free-text `description` fields; no structural field can represent them, and the change that would have added one was removed from scope by owner decision. The migration-review blocker is also genuine — 15 findings carry `migrationReviewRequired: true`, matching the migration report's `unresolvedStateCount: 15` exactly. | non-Button contract, findings `PF-02` / `PF-18` | n/a — correctly reported |
| **D-11** | The change-plan document declares "STATUS: IMPLEMENTED and LOCKED" on line 1 and "Status: PROPOSED. Not implemented." on line 8. | `<research>/non_button_validation/pill/v0.4.0-draft-change-plan.md:1,8` | No document self-consistency check exists |
| **D-12** | *Pre-existing production issue, not caused by this work.* `SPEC_SCHEMA_VERSION = '2.0.0'` is declared twice — exported at `src/coordinator/compose-trusted-output.ts:53` and module-private at `src/tools/engine.ts:72` — with no test asserting they agree. Recorded so Builder Phase 1 does not repeat the pattern. | as cited | No agreement test |

**The common thread.** D-1, D-2, D-3 and D-7 are all load-bearing references that live only in prose, and
D-4 explains why every one of them survived a fully green suite. The production contract therefore requires a
**structured, resolvable target** on every rule, blocker and finding, validated for existence *and*
kind-compatibility, with free text confined to a field that no logic reads.

---

## Resolved contradiction — Coordinator Phase 2 v4 status

**Question.** The OneDrive planning copy of the Phase-2 amendment register v4 is headed
"v4 (PROPOSED)" and states "Status: PROPOSED — submitted for adversarial relay review. Not locked."
(`manage-ds-components-spec-amendments_v4.md:1,3`). Is v4 locked?

**Ruling.** **Yes, v4 is locked.** `docs/phase2-decision-log.md:11` (PD-1) records the repository user
approving and locking revision 4 of `docs/host-turn-workflow-contract.md` as the normative Phase 2
implementation contract on 2026-07-31, and Coordinator Phase 2 was built under that lock
(`docs/phase2-as-built.md`).

**Why.** Source-of-truth precedence puts locked decisions inside the production repository, and current
tracked contracts and code, above historical planning documents. The OneDrive file is a stale copy of an
earlier document generation. A filename or header containing `PROPOSED`, `FINAL` or `LOCKED` is not evidence
of status; the decision log is.

**Consequence for Builder Phase 1.** None directly — but the OneDrive folder must not be cited as current
status for anything, and any future Builder Phase 1 claim that contradicts a repository decision log entry
should be treated as stale until the log says otherwise.
