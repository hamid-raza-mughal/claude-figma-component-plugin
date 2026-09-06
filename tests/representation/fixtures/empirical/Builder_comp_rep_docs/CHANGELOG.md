# Changelog: component-representation-contract 0.3.1-draft → 0.4.0-draft

`v0.3.1-draft` is archived in full (59 files, aggregate SHA-256 `c154d330a867b528c91d47f5b01267198069d9dd0edc1b5f1564351bf7a46614`) under `versions/0.3.1-draft/`, verified against the accepted 93-file checksum state immediately before anything was touched. It remains an immutable historical version and does not require continued active-schema compatibility. Version identities and archive hashes are recorded in `versions/VERSIONS.json`.

**Why:** the Pill R-2 experiment established that v0.3.1 cannot represent a second component without distortion. Upgrading Pill's evidence from name-parsing to the Figma Plugin API changed nothing the v0.3.1 validator could see — semantic violations stayed at 6/4/0/2 across contract and probes. The defects were representational, not evidentiary. This is a **breaking** successor. `readinessStatus` is `validation_ready`: checksum-pinned and change-controlled, **not** production-approved.

## The eleven changes (C-1 … C-11)

1. **C-1 `layoutRepresentations[]`** replaces scalar `layoutStrategy` and top-level `matrixAllocations`. Several documentation shapes may coexist, each independently scoped. A variant no representation covers must appear in the new `undocumentedSchemaVariantIds[]` — silence is explicit.
2. **C-2 typed dimensions.** A tagged union of `variant_property`, `component_set_identity` and `fixed_filter`, with an explicit `orderingRule`. No magic strings; CV-7 dispatches on `kind`.
3. **C-3 typed scope and corroboration.** `structuralFindings[].appliesToScopes[]` (plural — a finding may span several sets or families) plus a separate `corroboration.level`. `evidenceRecord.generalizationScope` is **removed, not translated**: an evidence record already carries `nodeIds`, and generalization belongs on the finding.
4. **C-4 recomputable allocation evidence.** A `verified` allocation points at an artifact the validator re-derives per source documentation block (CV-12). Empty observations, contradicted axes, mismatched ordering and disagreeing parallel blocks are all rejected.
5. **C-5 discriminated coverage metrics.** `coverageMetrics[]` replaces the untyped `documentedPairingCount`. `matrix_cells` is defined as rows × columns, **excluding** bands.
6. **C-6 structured enumeration provenance.** `method.class` records how children were enumerated; `node_name_parse` cannot back a completeness claim without corroborating owner confirmation.
7. **C-7 theme collection and mode provenance.** `collections[]` / `containers[]` / `variablesUsedByDescendants[]`, with `provenanceStatus` separate from `provenance` so migration never invents an out-of-enum value. The singular `boundVariableId` container model is deleted.
8. **C-8 typed treatment identity.** `set_identity` / `in_set_variant_axis` / `none`. No sentinel strings.
9. **C-9 non-VARIANT properties represented downstream.** A required `role` on every property definition, plus `nonVariantPropertyCoverage[]` with a tri-state `overrideEvidenceStatus` replacing a bare boolean.
10. **C-10 scoped display-label mappings.** Optional `appliesToScopes[]`; CV-14 rejects two competing mappings of the same relationship class in one scope, while deliberately preserving an `editorial_mapping` and a `typo` entry for the same value as complementary.
11. **C-11 CV-2 fix.** `buildFrameId` is a many-to-one reference, not an identifier: many component sets may share one build frame. Uniqueness applies to `componentSets[].id` only; a `buildFrameId` still may not equal any set id.

**Prototype and motion behaviour are explicitly out of scope for v0.4.** The proposed C-12 was removed from the inventory rather than left undefined. The Pill Pulse Animation reaction evidence is retained as linked evidence and a known limitation; a separate behaviour/motion contract may be designed later.

## Renamed / restructured fields

| v0.3.1-draft | v0.4.0-draft | Why |
|---|---|---|
| `layoutStrategy` (scalar enum) | `layoutRepresentations[].strategy` | One component may document itself several ways at once |
| `matrixAllocations[]` (top level) | `layoutRepresentations[].allocation` | An allocation belongs to the representation it describes |
| `rowsAxis` / `columnsAxis` / `bandsAxes` (strings) | typed `dimension` objects | A matrix may be indexed by component-set identity, not only by a VARIANT property |
| `treatmentLabel` (required string) | `treatment` (tagged union) | Treatment is set identity for some components and an in-set axis for others |
| `documentedPairingCount` (untyped int) | `coverageMetrics[]` (discriminated) | Placements, unique combinations and matrix cells are three different numbers |
| `themeModel.containerBindings[].boundVariableId` | `containers[].modeBindings[]` + `variablesUsedByDescendants[]` | A container carries a collection→mode map, not one bound variable |
| `generalizationScope` (on every evidence record) | `structuralFindings[].appliesToScopes[]` + `corroboration` | Scope and corroboration are different questions |
| `structuralClassification` | `corroboration.level` | The Button-hardcoded vocabulary is retired |
| `enumerationEvidence.enumerationMethod` (string) | `.method` (`enumerationMethodRecord`) | Extraction class, tool, fields read and raw-capture refs are separate facts |
| `readinessStatus: ready_for_adversarial_non_button_validation` | `validation_ready` | Component-neutral |

## New structures

- `authoringMode` + `migrationReportRef` — make "legacy states are migration-only" enforceable **without version-sniffing**. A migrated contract needs a hash-verified report **even when zero legacy states remain**.
- `$defs.legacyMigrationState` — one shape for all three migration-only states, governed by one rule (CV-17).
- `namingRules[]` — tiered enforcement (`required` / `recommended` / `observed_only`) with `uniquenessPolicy` conditional on enforcement.
- `representationNodeBindings[]` — the operational locator table. `evidenceNodeIds` reverts to provenance only and must never resolve a node at runtime.
- New rules **CV-3b, CV-12 … CV-18**; CV-9's job is now schema-enforced.

## Migration

`migrate_v031_to_v040.py` is idempotent with three distinct modes: migrate a v0.3.1 input, **refuse** a v0.4 input, and `--verify` for a no-write equivalence check. It performs no evidence or approval upgrades. Buttons migrates with 21 unresolved states (2 legacy allocations, 10 legacy-unclassified metrics, 2 legacy theme provenances, 5 finding scopes and 2 node bindings needing review), all listed in `migration-report-buttons-0.4.0-draft.json` and all approval-blocking.

**Buttons' `documentedPairingCount` values (100 ×8, 20 ×2) remain provisional.** They migrate as `legacy_unclassified` with no metric kind asserted; which quantity they count is an open owner decision.

## What did not change

- No owner decision was resolved. The seven Buttons blockers carry over verbatim, joined by MIG-1 and MIG-2.
- No evidence was upgraded. Buttons is still `not_enumerated` on all ten component sets.
- `approvalStatus.overall` remains `blocked`; `ownerConfirmations` remains empty.
- The Buttons data itself — component sets, schema variants, correlated tuples, findings' substance — is unchanged apart from the mechanical restructuring above and a substitution-only remap of stale field references inside Builder-facing text (9 sites, listed in the migration report).
- No production-readiness claim. "Locked" means checksum-pinned and change-controlled. Any subsequent structural change requires `0.4.1-draft` or later.

---

# Post-0.3.1-draft repair (tooling/process only, no contract data changes)

Five narrow issues found in the 0.3.1 patch itself, fixed without touching `readinessStatus`, the seven evidentiary blockers, or any Buttons data: (1) `versions/CHECKSUMS.sha256` no longer lists its own hash, and `verify_checksums.py` (new) asserts this; (2) the retired-name check is now structural (`check_retired_structure.py`, new), not a lexical grep that couldn't distinguish live keys from historical prose; (3) CV-11's artifact-shape validation now type-checks every `variantProperties` value, fixing a real, reproduced `TypeError: unhashable type` crash on a non-string value; (4) the empirical regression tests are now committed, portable, runnable suites (`tests/test_schema_conditionals.py`, `tests/test_validator_hardening.py`), and schema-reject fixtures assert a specific expected schema-path fragment instead of accepting any error; (5) `.gitignore` now selectively un-ignores the canonical package, keeping only the two raw Figma exports ignored. Full detail: `normalization-validation-report.md` §12.

---

# Changelog: component-representation-contract 0.3.0-draft → 0.3.1-draft

v0.3.0-draft is archived in full (contract, schema, all three markdown docs, `semantic_validator.py`, `generate_tables.py`, and the full `fixtures/` tree as it stood) under `versions/0.3.0-draft/`. This is a **narrow enforcement-hardening patch**, not a broad rewrite: no new modeling concepts, no changes to `layoutStrategy`, the confirmation-reference model, or the Buttons evidence itself. `readinessStatus` is unchanged (`ready_for_adversarial_non_button_validation`) — this patch closes enforcement gaps; it does not resolve any of the 7 evidentiary blockers.

**Why:** v0.3.0-draft's own validation report claimed 5/5 on contract enforceability. An independent audit found — and this patch's authoring independently reproduced, empirically, before fixing — five real gaps where the schema/validator claimed a guarantee they didn't actually enforce (tracked as `SF-15` in the contract).

## The five gaps closed

1. **`fully_enumerated` was label-based, not proof-based.** The schema allowed `enumerationEvidence.status: "enumerated"` with `artifactPath`/`artifactSha256`/`enumeratedCount`/`enumerationMethod` all `null`, and CV-8 never checked artifact existence, hash, or content. The `fully_enumerated_approval_path.json` positive fixture itself used a nonexistent `evidence/fake.json` and a fabricated hash, and still validated clean.
   - Fixed: the enumeration artifact is now a **component-specific** record (`componentSetId`, `fileKey`, `capturedAt`, `enumerationMethod`, `children[].{componentId, variantProperties}`), not a reusable flat array. New rule **CV-11** (11 distinct legs: path safety, existence, deterministic shape validation, hash, componentId uniqueness, identity, provenance/fileKey match, method-consistency, valid timestamp, exact axis key-set, and derivation-vs-claim equality). The `enumerationEvidence` schema now enforces a true **biconditional** between `status == "enumerated"` and `physicalCoverageEvidenceLevel == "component_children_enumerated"` (both directions — the reverse direction is new), plus a stale-record guard (`status == "not_enumerated"` forces every artifact field to `null`/empty).
   - The repaired fixture now carries two real, hash-verified, component-specific artifacts.

2. **Confirmation validation was one-directional.** `check_owner_confirmations` only verified that a *claimed* approval resolved to a real confirmation; an orphan `ownerConfirmations[]` record — real shape, `scopeRef` pointing at nothing, unreferenced by anything — passed silently.
   - Fixed: new `check_orphan_confirmations` independently resolves every confirmation record's `scopeType`+`scopeRef` to a real target and verifies that target's own `ownerConfirmationRef` points back to it — both directions now checked.

3. **Matrix allocations could overlap ambiguously, and axis checks used a union instead of an intersection.** CV-3 only rejected zero coverage of a schema variant, never more-than-one. CV-7 unioned declared axes across every variant an allocation referenced, so an axis declared in only *one* of several referenced variants incorrectly passed.
   - Fixed: CV-3 now requires **exactly one** allocation per schema variant (0 → "not covered", >1 → "covered by N, expected 1") and explicitly checks that every `matrixAllocations[].appliesToSchemaVariantIds` entry resolves to a real variant (previously left to be caught incidentally, and incompletely, by CV-7). CV-7 now requires each axis exist in **every** referenced variant (true intersection).

4. **The qualifying-evidence-levels field was partly decorative.** `minimumEvidenceLevelForPhysicalCompletenessClaim: "schema_only"` validated cleanly, and nothing ever consulted the field's actual contents.
   - Fixed: renamed to `qualifyingEvidenceLevelsForPhysicalCompletenessClaim` (an explicit array/set, not a "minimum" — evidence levels are not a total order). Its own values are now schema-restricted to the true floor `{component_children_enumerated, owner_confirmed}` (a same-field constraint, moved from an earlier validator-only draft of this fix into the schema once it became clear the constraint didn't actually depend on any other part of the document). A second, genuinely cross-referential validator leg (CV-1) requires every real `physicalCompletenessClaimed=true` entry's evidence level to actually appear in the declared array.

5. **Generated-table drift-checking didn't exist, and the CV table wasn't actually generated.** `generate_tables.py` only printed output for manual pasting. `builder-grounding-pack.md`'s CV table was a hand-condensed 4-column summary, not the generator's real 7-column output (the VR table was genuinely verbatim). `component-representation-analysis.md` promised its SF table was "reproduced in `normalization-validation-report.md` §4," which it was not.
   - Fixed: `generate_tables.py --check <file>...` now verifies marker-wrapped embedded tables against fresh output, using a **hardcoded expected-marker-set per file** (so it can detect an absence, not just a mismatch) — failing on a missing pair, a duplicate pair, improper nesting/interleaving, an unrecognized table name, or content drift. All three markdown docs now embed real, marker-wrapped, generator-verified tables: the pack gained `CV_TABLE` (replaced, now genuinely verbatim), `BLK_TABLE` (converted from a bullet list to a table), and `EVIDENCE_LEVEL_TABLE`; the analysis doc and the report both now embed the real `SF_TABLE`.

## Smaller corrections bundled into this patch

- **CV-1/CV-3/CV-5/CV-7's own `detectionCondition` text** in the contract had fallen behind what the code actually enforced (CV-7 still said "at least one" variant instead of "every"; CV-3 didn't mention the exactly-one-allocation or explicit-variant-reference checks; CV-5 didn't mention duplicate detection; CV-1 didn't mention the qualifying-levels legs). All four corrected to match the implementation precisely.
- **Semantic (not just byte-identical) duplicate detection** added to CV-5 for `correlatedAxisTuples` combination arrays (key-order normalized, the same normalization CV-8 already used).
- **All 20 pre-existing fixtures were regenerated** (not just the new ones added) because the field rename and new required fields made the old fixture shape schema-invalid; the suite is now **34 fixtures** (7 positive, 6 schema-reject negatives, 21 semantic-reject negatives) — this figure is read from `fixtures/manifest.json`, not asserted in advance.
- **`base_dir` is now an explicit parameter**, computed by the same rule for both the real contract (its own containing directory) and each fixture individually (that fixture's own directory) — closing a design inconsistency where the original enforcement plan would have required fixture artifacts to live in a location the plan itself didn't actually specify correctly.
- New `structuralFindings` entry `SF-15` and a `knownLimitations` bullet document this patch's own gap-closure, for cross-version traceability, mirroring how `SF-14` documented the 0.2.0→0.3.0 evidence-level correction.

## What did not change

The Buttons evidence itself (`buildFrameId` mappings, hashes, screenshot classification, the 0-of-10 physical-completeness finding), `layoutStrategy`, the confirmation-reference model's shape (`scopeType`/`scopeRef`/`ownerConfirmationRef`), `readinessStatus`, and all seven `approvalStatus.blockers` are unchanged in substance from v0.3.0-draft.

---

# Changelog: component-representation-contract 0.2.0-draft → 0.3.0-draft

v0.2.0-draft is archived in full (contract, schema, and all three markdown docs) under `versions/0.2.0-draft/`, so every entry below is diffable against a real, preserved baseline rather than prose alone. A SHA-256 manifest for both the archive and the new deliverables is at `versions/CHECKSUMS.sha256`.

v0.3.0-draft is a **validation-ready baseline, not the final universal contract.** `readinessStatus: "ready_for_adversarial_non_button_validation"`. Version `1.0.0` remains gated on a future non-Button validation experiment plus human approval — now an enforceable schema rule (`CV-10`), not just prose.

## New top-level fields

| Field | Why |
|---|---|
| `contractId` | Stable identity for this contract document, independent of `contractVersion`. Needed as the `scopeRef` target for `contract_overall`-scoped owner confirmations (amendment 1). |
| `layoutStrategy` | `matrix \| list \| scenario_gallery \| none`. Lets the contract represent components with no row/column/band matrix at all (required amendment). |
| `readinessStatus` | `not_ready \| ready_for_adversarial_non_button_validation \| ready_for_production`. Makes the "not final" ceiling explicit and machine-checkable. |
| `ownerConfirmations[]` | The other half of the corrected bidirectional confirmation model (amendment 1). Empty in this revision — nothing has actually been confirmed by the file owner yet. |
| `contractIntegrityRules[]` (CV-1..CV-10) | Document-integrity rules, distinct from the existing Builder-behavior `validationRules` (VR-1..VR-9). Maps NODE-0001 to the 7 required rejections + 2 structural requirements + the version gate. |

## Renamed / restructured fields

| v0.2.0-draft | v0.3.0-draft | Why |
|---|---|---|
| `evidenceLevel` enum: 4 values (`…, component_children_verified, owner_confirmed`) | 5 values (`…, visual_matrix_verified, component_children_enumerated, owner_confirmed`) | A screenshot and a real structural child enumeration are different kinds of check, not different strengths of the same check — conflating them let a screenshot silently satisfy a completeness claim it shouldn't have. |
| `correlatedAxisTuples[].allowedCombinations` + `proposedBy` + `approved` | `observedCombinations` + `proposedValidCombinations` + `approvedCombinations` + `approvalBasis` (`unresolved\|owner_confirmed\|fully_enumerated`) + `ownerConfirmationRef` | "What was seen," "what's proposed as valid," and "what's actually approved" were conflated into one field. Only owner-confirmed or fully-enumerated combinations may become approved. |
| `matrixAllocation` (singular object) | `matrixAllocations[]` (array), each with `allocationId`, `appliesToSchemaVariantIds`, `ownerConfirmationRef` | One global allocation couldn't represent that Disabled sets have no column axis except via a prose note. Now every schema variant gets its own allocation, independently approvable. |
| `matrixAllocation.bandsAxis` (free-text string) | `matrixAllocations[].bandsAxes` (array of axis-name strings) | A free-text note can't be mechanically checked against declared axes; an array can (`CV-7`). |

## Semantics corrected (not just renamed)

- **Owner-confirmation reference direction was backwards/circular in the draft plan and is now corrected**: `ownerConfirmationRef` (on the approved object) points *to* `ownerConfirmations[].confirmationId`; `ownerConfirmations[].scopeRef` (on the confirmation record) points *back* to the approved object, interpreted per a new `scopeType` (`correlated_axis_tuple \| component_set_coverage \| matrix_allocation \| contract_overall`). `CV-6` checks both directions agree, not just that the reference resolves.
- **`fully_enumerated` is now proven, not labeled.** `coveragePolicy.perComponentSetCoverage[]` gained `enumerationEvidence` (`status`, `enumeratedAxisCombinations`, artifact path/hash/count, method). `CV-8` requires every in-scope component set to actually show `enumerationEvidence.status == "enumerated"`, and `approvedCombinations` to exactly equal the **intersection** (not union) of what those sets actually enumerated — a combination present in only some sets is a discrepancy to surface, not paper over.
- **`NODE-0002`'s physical-completeness claim is flipped: `true` → `false`.** Its `physicalCoverageEvidenceLevel` moves from the retired `component_children_verified` to `visual_matrix_verified`, which does not meet the (now `component_children_enumerated`-based) bar. **Net: 0 of 10 sets meet the bar, not 1 of 10** — this is the single largest substantive correction in this revision.
- **CV-2 (duplicate identifiers) uses per-namespace uniqueness**, not one global pool. The exception: `componentSets[].id` and `buildFrameId` together form one global pool, since both are real Figma node ids from the same namespace.
- **CV-3 (broken cross-references) is materially expanded**: bidirectional family/schema-variant membership checks, exactly-one-coverage-entry-per-set, axis existence required in *every* referenced schema variant (not "at least one"), and every schema variant covered by at least one `matrixAllocations` entry when `layoutStrategy == "matrix"`.
- **The version/readiness/approval promotion gate is now bidirectional** (`CV-10`): version `1.0.0` requires production-readiness, *and* claiming production-readiness requires version `1.0.0`, *and* any `-draft` version is forbidden from claiming `ready_for_production`. The prior draft only enforced the first direction.

## Data corrections

- **`buildFrameId` added to all 10 `componentSets[]` entries.** Two (`NODE-0003`, `NODE-0004`, for the Disabled builds) were direct corrections from the file owner; the other 8 were extracted the same way and independently cross-checked. `buildFrameId` is now a first-class field, explicitly distinct from `id` (the `COMPONENT_SET` id) — the two were previously conflated by omission (only `id` was ever tracked).
- **`provenance` gained real hashes and timestamps**: SHA-256 of both source exports, `terminal.json`'s own `source.generatedAt`, and (for the live Figma reads) `resultingEvidenceLevel`/`toolIdentity`/`artifactAvailable`/`artifactPath`/`artifactSha256`. Where a fact genuinely isn't known (exact capture timestamp of the live reads, `basic-tree.json`'s generation time, any tool-version string), it's recorded as `null` rather than guessed.
- **The screenshot evidence artifact is now preserved** at `evidence/comp_build_NODE-0002_screenshot.png` (previously only in an ephemeral, session-scoped scratch path outside the project).
- **`SF-14`** (new finding) documents the evidence-level correction itself, purely for cross-version traceability.
- **`BLK-3`** reworded from "1 of 10 verified" to "0 of 10 enumerated, 1 of 10 visual-only." **`BLK-6`** (empty `ownerConfirmations`) and **`BLK-7`** (no contract-level confirmation, blocking `approvalStatus.overall="approved"`) added.
- **`VR-3`/`VR-4` text updated** for the `approvalBasis` rename; `VR-4` is repurposed from "don't self-approve" (now impossible to author, per `CV-8`) to "don't trust a past `fully_enumerated` label without re-checking it's still true at use time."

## New deliverables (did not exist in v0.2.0-draft)

- `component-representation-contract.schema.json` — same file, substantially revised (see above).
- `semantic_validator.py` — deterministic Python validator for the 6 genuinely cross-referential CV rules (2, 3, 5, 6, 7, 8) plus CV-10's confirmation-record leg; delegates every same-object/root-level constraint to `jsonschema` rather than re-implementing it, to avoid the two drifting apart.
- `generate_tables.py` — emits the CV/VR/SF/BLK markdown tables verbatim from the contract's own text, so the markdown docs can't silently drift into matching-ids-but-different-meanings.
- `fixtures/` — 21 fixtures (7 positive: one per `layoutStrategy` value, one per approval path, one permanent vacuous-`if` regression test; 13 negative: one per CV rule, plus two extra CV-3/CV-8 cases for the bidirectional and intersection-specific checks) + `manifest.json`.
- `evidence/` — durable copy of the one screenshot artifact this analysis has ever produced.
- `versions/0.2.0-draft/` — full archive of the five prior deliverables; `versions/CHECKSUMS.sha256` — integrity manifest for the archive and the new deliverables (see `normalization-validation-report.md` for the open question this does *not* solve: the containing folder is gitignored, so this checksum manifest proves internal consistency, not durable version history).

## What did not change

`componentIdentity`, `semanticFamilies` (Buttons legitimately has 3 — no change), `propertySchemaVariants`' actual property lists, `canonicalValueDisplayLabelMap`, `themeModel`, `representativeExamples`, and `SF-01` through `SF-13` are all unchanged in substance from v0.2.0-draft.
