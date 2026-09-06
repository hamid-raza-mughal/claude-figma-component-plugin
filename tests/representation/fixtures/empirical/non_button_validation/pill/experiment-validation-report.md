# Experiment Validation Report — Pill

**Pass:** R-2 live-evidence reconciliation · **Date:** 2026-08-16
**Subject:** `non-button-experimental-contract.json` (`0.2.0-draft`)
**Validated against:** `Builder_comp_rep_docs/component-representation-contract.schema.json` + `semantic_validator.py` (v0.3.1-draft baseline, **unmodified**)

---

## 1. Reproduction

```bash
cd NAME-0002/non_button_validation/pill
python3 build_experiment_artifacts.py --stamp 2026-08-16T08:55:00Z
B=../../Builder_comp_rep_docs
for f in non-button-experimental-contract.json probe-A-list-layout.json \
         probe-B-schema-satisfying-distortion.json probe-C-cv2-isolation.json; do
  echo "## $f"; python3 $B/semantic_validator.py \
    $B/component-representation-contract.schema.json "$f"; done
shasum -a 256 -c CHECKSUMS.sha256
```

The generator is deterministic; the only non-deterministic inputs (timestamps) are supplied via `--stamp`.

## 2. Control runs

| Control | Result |
|---|---|
| Baseline schema self-check (`Draft202012Validator.check_schema`) | **valid** |
| Baseline fixture suite (`--test-fixtures fixtures/manifest.json`) | **34/34 fixtures behaved as expected** |
| Baseline contract re-validated | **PASS: 0 violations** (exit 0) |
| Baseline package integrity (`verify_checksums.py`) | **PASSED: 93 files match, manifest correctly excludes itself** |
| Experiment package integrity (`CHECKSUMS.sha256`) | **28/28 OK**, self-excluded |

The validator is unaltered and behaving normally. Pill's failures are attributable to the Pill data and the schema's expressiveness.

## 3. Results matrix

| Instance | Schema | Semantic | Exit | R-1 semantic |
|---|---|---|---|---|
| **`non-button-experimental-contract.json`** (deliverable, honest) | **0** | **6** | 1 | 6 |
| `probe-A-list-layout.json` | 0 | 4 | 1 | 4 |
| **`probe-B-schema-satisfying-distortion.json`** | **0** | **0** | **0** | 0 |
| `probe-C-cv2-isolation.json` | 0 | 2 | 1 | 2 |

**Violation counts are identical to R-1.** This is the expected and correct outcome: R-2 upgraded the *evidence* (name-parse → Plugin API) without changing the *representation defects*. No violation was resolved by editing Pill data.

### 3.1 What changed inside the contract, and why counts did not

| Field | R-1 | R-2 | Effect on violations |
|---|---|---|---|
| `contractVersion` | `0.1.0-draft` | `0.2.0-draft` | none |
| `enumerationMethod` | name-parse | `plugin_api_variant_properties` | none — CV-11 checks internal consistency, not method |
| `propertySchemaVariants` | 3 VARIANT props per variant | 5 (PSV-1) / 6 (PSV-2), incl. TEXT + INSTANCE_SWAP + defaults | none — CV-7 only inspects VARIANT properties |
| `documentedPairingCount` | 18 / 18 / 40 / 18 / 0 (placements) | 8 / 8 / 12 / 8 / 0 (unique combinations) | none — untyped integer, unchecked |
| `themeModel` identifiers | five `"unverified"` strings | real collection id, mode ids `NODE-0027` / `NODE-0028` | none — no rule inspects them |
| `mechanismEvidence.classification` | `computed` | `observed` | none |
| `explicitPerFrameModeOverrideObserved` | `false` | `true` | none |
| `structuralFindings` | 17 | 20 | none |
| blockers | 8 | 10 | none |
| `matrixAllocations[0]` | asserted from structure | recomputed from 64 instances | **none — and that is the finding** (§6) |

Every one of those is a genuine evidence improvement, and the v0.3.1 validator is blind to all of them.

## 4. Run 1 — the deliverable contract

```
FAIL: 6 violation(s)
 - [CV-2] duplicate Figma node id 'NODE-0042' in the componentSets id/buildFrameId pool
 - [CV-2] duplicate Figma node id 'NODE-0042' in the componentSets id/buildFrameId pool
 - [CV-2] duplicate Figma node id 'NODE-0042' in the componentSets id/buildFrameId pool
 - [CV-2] duplicate Figma node id 'NODE-0042' in the componentSets id/buildFrameId pool
 - [CV-3] schema variant 'PSV-2' is not covered by any matrixAllocations entry
 - [CV-7] matrixAllocations['MA-1'].rowsAxis references axis 'Style' which is not
          declared as VARIANT in variant(s): ['PSV-1']
```

**JSON Schema validation passed (0 violations).** All six failures are semantic.

| Violation | Classification | Cause |
|---|---|---|
| CV-2 ×4 | **Validator false positive** | Five COMPONENT_SETs legitimately share build frame `NODE-0042` (API-confirmed `parentId` on all five). CV-2 pools `buildFrameId` into a uniqueness namespace, but it is a many-to-one reference. |
| CV-3 ×1 | **True positive against schema expressiveness** | Correct given `layoutStrategy: "matrix"`, but "PSV-2 has no documentation at all" is unsayable. Symptom of CF-1. |
| CV-7 ×1 | **Validator false positive** | The matrix **is** row-indexed by component-set identity — now recomputed from 64 instances, not asserted. |

## 5. Isolation probes

**Probe C** (`buildFrameId: null` only) → `FAIL: 2` — CV-3 and CV-7 remain, **all four CV-2 vanish**. Proves CV-2 is caused solely by the shared build frame. Suppressing `buildFrameId` would silence it at the cost of deleting true provenance, which is why the deliverable keeps `NODE-0042`.

**Probe A** (`layoutStrategy: "list"`, no allocations) → `FAIL: 4` — only CV-2 remains. Proves CV-3 and CV-7 are caused entirely by recording the real matrix. Declaring `list` validates more cleanly while representing less of the truth.

**Probe B** (three deliberate distortions) → **`PASS: 0 violations`**.

The distortions:

1. `MA-1` rows/columns/bands changed from the recomputed `Style × Accent / Size` to `Accent × Size / Icon` — **contradicting the instance evidence in `evidence/allocation-evidence-MA-1.json`**.
2. A **fabricated** `MA-2` for PSV-2 — a component set with **0** documentation instances (API-confirmed).
3. `buildFrameId` nulled on all five sets — **suppressing** true provenance.

> ### The central result
>
> **The honest contract fails with 6 violations. The contract containing a fabricated allocation, an axis assignment that contradicts the captured instance evidence, and suppressed provenance passes clean.**
>
> Stated precisely: **the validator cannot distinguish evidenced allocations from evidence-free assertions.** No rule ties `matrixAllocations` to observed documentation nodes or instances.

R-2 sharpens this rather than softening it. In R-1 the honest allocation was itself an assertion read off structure, so the two were arguably comparable. In R-2 the honest allocation is **recomputed from 64 instances' real `variantProperties` and geometry**, and the fabricated one still scores identically. The gap is now demonstrably about validator capability, not about evidence quality on either side.

Proposed change **P-11** (strengthened) and **C-4 / CV-12** in the v0.4.0 plan close it: the validator re-derives the allocation from an evidence artifact and rejects mismatches and empty observation sets.

## 6. What the schema accepted silently

All four instances scored `schema = 0`. Distortions forced by the schema and accepted without comment:

| Distortion | Schema's view |
|---|---|
| `treatmentLabel` = `"not_applicable (Style is an in-set VARIANT axis…)"` | valid string |
| `boundVariableId` = a sentence describing a collection→mode binding, ×2 | valid strings |
| 20 findings forced to `generalizationScope: "specific_node"` | valid enum member |
| 20 findings forced to `classification: "unknown"` | valid enum member |
| Both theme containers recorded as `containerNodeName: "card"` | no uniqueness constraint |
| `documentedPairingCount` silently switched metric between R-1 and R-2 | untyped integer |
| Four real non-VARIANT properties declared but referenced nowhere downstream | no completeness rule |

**A schema pass is not evidence of schema adequacy.**

## 7. CV-11 against API-grade evidence

All five artifacts were regenerated from `COMPONENT.variantProperties`. **All eleven CV-11 legs passed** for all five sets: path containment, existence, JSON validity, shape, SHA-256, unique `componentId`s (216 total), `componentSetId` match, `fileKey` match, `enumerationMethod` match, parseable `capturedAt`, and derived-combination equality with matching counts (48/48/48/48/24).

Residual gap (**PB-7**): CV-11 verifies internal consistency, not provenance quality. The R-1 name-parsed artifacts also passed all eleven legs. `evidence/api-vs-nameparse-diff.json` shows they happened to be value-identical — but the validator could not have known that, and would have accepted them either way.

## 8. R-1 → R-2 evidence diff

| Check | Result |
|---|---|
| variantProperty mismatches across 216 children | **0** |
| Component-ID sets identical (all five) | **true** |
| Option membership identical (all axes) | **true** |
| Option **order** differed | **9 axes** — name-parse recovers first-seen traversal order; the API declares authored order |
| Facts only the API supplied | node type, `visible`, component-set `key`, 4 non-VARIANT properties, every `defaultValue` |

## 9. Repository status

Accurate statement — **the working tree is not clean**:

```
 M .gitignore
?? NAME-0002/
```

`.gitignore` is **modified**; `NAME-0002/` is **untracked**. Nothing was staged and nothing was committed by this work, and no stashes exist — but "nothing staged or committed" is **not** equivalent to "git clean," and R-1 reported this imprecisely. The `.gitignore` modification predates this experiment.

## 10. Success-criteria assessment

| Criterion | Met | Basis |
|---|---|---|
| Component represented without importing Button assumptions | ✅ | Baseline exports contain zero Pill data (5 string probes, all false). All facts re-derived from the Plugin API. |
| Every material claim points to captured evidence | ✅ | Every `evidenceRecord` carries `sourceFile` + `nodeIds`; 8 tool calls logged; 16 artifacts SHA-256'd in the manifest. |
| Coverage levels match the actual evidence method | ✅ | All five at `component_children_enumerated` via a first-class API field; all completeness claims **false**; method recorded structurally. |
| Axis correlations and allocations independently derived | ✅ | Independence checked in Figma per set against each set's own `variantOptions`; MA-1 recomputed from 64 instances. |
| Schema and semantic validation reproducible | ✅ | Deterministic generator, four recorded runs, five controls. |
| Contradictions reported, not normalized away | ✅ | 6 violations left standing; not one resolved by editing data. |
| Baseline delta explicit and actionable | ✅ | 10 schema failures, 3 validator findings, 13 proposed changes, 8 owner decisions, Q-1…Q-8 status, and a phased v0.4.0 plan with migrations and fixtures. |

## 11. Verdict

# `BASELINE_CHANGE_REQUIRED`

**Preserved from R-1, on stronger evidence.**

The core machinery held up again and in places did better: `propertySchemaVariants` absorbed two schemas including their non-VARIANT properties; CV-11 passed all eleven legs against API-grade artifacts; the deliberate non-ordering of `visual_matrix_verified` against `component_children_enumerated` was vindicated a second time by a set that is invisible to rendering *and* to `get_variable_defs` yet fully readable via the API.

The change is required by defects that better analysis cannot fix:

1. **The scope vocabulary is Button-hardcoded.** All 20 Pill findings — now API-grade — are forced to `specific_node` / `unknown`. No second component is representable. *(CF-7, PB-3, C-3)*
2. **CV-2 encodes Buttons' NODE-0001 build-frame topology** and fires 4 false positives on Pill's NODE-0049. *(C-11)*
3. **`layoutStrategy` cannot express a hybrid documentation shape**, and CV-3 then demands an allocation for an undocumented variant. *(CF-1, PB-1, C-1)*
4. **CV-7 forbids indexing a matrix by treatment** while the schema elsewhere calls treatment an axis — now rejecting a *recomputed* allocation. *(CF-1, PB-2, C-2)*
5. **The validator cannot distinguish evidenced allocations from evidence-free assertions.** *(C-4 / CV-12)*
6. **Nothing can reference a non-VARIANT property**, though Pill declares four with real defaults. *(CF-8, PB-9, C-9)*
7. **`themeModel` mis-models theme binding** as one variable per container, with no provenance and no room for a second collection — while the real identifiers were observable all along. *(CF-4, PB-4, C-7)*

This is evidence collection. Nothing here approves the Pill model, the baseline contract, any allocation, any correlated combination, any completeness claim, the Pulse Animation taxonomy, or any proposed change.


---

# R-3 — Migration to `component-representation-contract v0.4.0-draft`

**Date:** 2026-08-16 · **Contract version:** `0.4.0-draft` · **authoringMode:** `migrated`

The v0.4.0-draft baseline was implemented and locked. Pill migrated through the same tool as the Buttons baseline (`migrate_v031_to_v040.py`), supplied with an **evidence overlay** carrying its real R-2 captures. The result:

```
python3 ../../Builder_comp_rep_docs/semantic_validator.py \
    ../../Builder_comp_rep_docs/component-representation-contract.schema.json \
    non-button-experimental-contract.json
  -> PASS: 0 violations
```

**Under v0.3.1 this same contract failed with 6 violations.** All six are now representable rather than suppressed:

| v0.3.1 violation | v0.4 resolution |
|---|---|
| CV-2 ×4 (five sets sharing build frame `NODE-0042`) | `buildFrameId` is a many-to-one reference; uniqueness applies to `id` only (C-11) |
| CV-3 (PSV-2 uncovered by any allocation) | `undocumentedSchemaVariantIds: ["PSV-2"]` — silence made explicit (C-1) |
| CV-7 (rows indexed by treatment) | `component_set_identity` is a first-class dimension kind (C-2) |

## What the hybrid documentation now looks like

Two representations coexist, which v0.3.1's scalar `layoutStrategy` could not express:

- **LR-1** `list` — the per-axis strip, 15 Pill instances per theme card
- **LR-2** `matrix` — rows = component-set identity, columns = `Accent`, bands = `Size`, `Icon` fixed at `None`

LR-2's allocation is **`verified`**: `evidence/allocation-evidence-LR-2.json` carries all 64 matrix observations, and CV-12 re-derives rows/columns/bands/fixedFilters **independently per source documentation block** (NODE-0047, NODE-0051) and confirms both derive the same semantic allocation. Coordinates are never aggregated across theme blocks.

## Naming rules and the two `content` siblings

10 naming rules cover every observed layer role, tiered: 2 `required` (matrix rows, axis-strip rows), 7 `recommended` (wrappers), 1 `observed_only` (`hr`).

Pill is the reason `uniquenessPolicy` is per-rule rather than global: **both documentation blocks in each card are named `content`**. Parent-scoped uniqueness is demonstrably false for that role. Identity comes from `representationNodeBindings[]`, which binds each block by `containerNodeId` under its `rootNodeId` card — never from the layer name, and never from `evidenceNodeIds`, which is provenance only.

## Coverage: three metrics, all recorded

| Set | instance_placements | unique_variant_combinations | matrix_cells |
|---|---|---|---|
| Highline | 18 | 8 | 4 |
| Highlighted | 18 | 8 | 4 |
| Filled | 40 | 12 | 4 |
| Text | 18 | 8 | 4 |
| Pulse Animation | 0 | 0 | — |

All three were real all along; v0.3.1 had one untyped integer and no way to say which. `physicalCompletenessClaimed` remains **false** everywhere.

## Theme, with real provenance

`colors` (`VC-0001`, remote, 105 variables), modes Dark `NODE-0027` / Light `NODE-0028`. Both containers `provenanceStatus: verified` — the Dark card `inherited_default`, the Light card `explicit`. The second collection `layout-scale` is recorded with `themeVarying: false`, which v0.3.1's singular themeModel could not hold.

## Migration provenance

`migration-report-pill-0.4.0-draft.json` pins the source contract and the migration tool by hash and lists 15 unresolved states — all `migration_review`, all finding scopes the migration refused to infer. **Zero legacy states**: the overlay resolved all 10 by supplying real evidence. Because CV-17b requires a report even at zero legacy states, Pill is the live case for that leg.

## Probes under v0.4

| Probe | v0.3.1 | v0.4 | Meaning |
|---|---|---|---|
| A — list representation alone | FAIL 4 | **PASS** | v0.4 no longer forces a matrix; the list block is legitimate on its own |
| B — fabricated allocation + contradicted axes + suppressed provenance | **PASS 0** | **FAIL 2 (CV-12)** | the false negative is closed |
| C — five sets sharing one build frame | FAIL 2 | **PASS** | the CV-2 false positive is gone |

Probe B's two rejections:

```
CV-12 LR-2: declared rows dimension is not a function of the observed row grouping --
      row group 'NODE-0053' contains 4 distinct rows values ['Error','Info','Success','Warning']
CV-12 LR-3: allocation evidence contains zero observations --
      an allocation describing nothing cannot be verified
```

The first is the sharper of the two. `Accent × Size` is a *genuine* re-projection of the same 64 instances, so pure value-based recomputation accepts it. What rejects it is that the documentation's own row grouping (`rowGroupNodeId`) contradicts it — the evidence records how the rows are actually grouped, and a declared row axis must be a function of that grouping.

## Owner blockers — unchanged

All 10 Pill blockers (PB-1 … PB-10) carry over, joined by MIG-2. Nothing was resolved: not the `NODE-0039` taxonomy, not the `Size` relative-scale question, not any promotion to a multi-component invariant. Every finding remains `single_component_observed`.
