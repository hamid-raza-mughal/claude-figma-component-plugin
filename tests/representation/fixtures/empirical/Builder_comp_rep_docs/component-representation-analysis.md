# Component Representation Analysis — NAME-0001 Components / `component_box` (NODE-0005)

**Status: v0.3.0-draft revision.** This supersedes the v0.2.0-draft revision (archived in full under `versions/0.2.0-draft/`). See `CHANGELOG.md` for the itemized diff and `normalization-validation-report.md` for this round's validation results. This document must not contradict `component-representation-contract.json`, which validates against `component-representation-contract.schema.json` and is checked further by `semantic_validator.py`.

Scope: establish the structural contract of an existing Figma component-documentation artifact (the "Buttons" doc page), so a future Builder agent can reproduce this documentation grammar for other component types. This document does **not** design the Builder and does **not** modify the Figma file. Every material claim below is tagged with a classification (observed/computed/inferred/unverified) and, for structural claims, a generalization scope (specific node / Buttons / candidate cross-component invariant / owner-declared standard).

## 0. Four kinds of truth, kept separate

| Truth type | What it means | Where it's authoritative |
|---|---|---|
| **Component API truth** | The literal `componentPropertyDefinitions` on a real `COMPONENT_SET` node. | `contract.componentSets` / `propertySchemaVariants` |
| **Physical component truth** | Whether a specific axis combination actually exists as a real `COMPONENT` child, or is demonstrated by a real `INSTANCE`. | `contract.coveragePolicy`; requires `component_children_enumerated` or `owner_confirmed` to claim completeness |
| **Documentation-layout truth** | The scaffold's own structure — frame nesting, order, dividers. | §3, §5, §6 below |
| **Editorial/display-label truth** | The hand-typed captions in `var_col_title`, `variant_value`, `build_title` — a separate, fallible authoring layer. | `contract.canonicalValueDisplayLabelMap` |

## 1. Executive understanding

*Classification: inferred (synthesis); scope: Buttons for specific claims, candidate cross-component invariant for the general principle.*

The artifact is a single, hand-built Figma documentation page composed of three macro-regions in a fixed order — introduction, themed "Component Representation" gallery, and "Component Builds" (the actual `COMPONENT_SET` matrices). All 196 `INSTANCE` nodes in the file are confirmed (observed, re-verified) to sit inside the representation gallery, not inside any matrix. The scaffold's naming and nesting repeats with high but imperfect consistency within this one page — the repeatable parts are candidate documentation grammar; the breaks (§7, §8) mark where a Builder must not assume uniformity.

**This revision's central correction:** the prior draft treated a single live screenshot as proof that a component set's variant matrix was physically complete. It was not — a screenshot proves a visual render looked complete; it does not structurally enumerate the set's real children. That evidence level has been split (`visual_matrix_verified` vs. `component_children_enumerated`), and the practical consequence is that **0 of the 10 Button component sets currently meet the bar for a physical-completeness claim** (the prior draft had reported 1 of 10). This is tracked as `SF-14` and `BLK-3`.

No second component type has been examined. Every claim that generalizes past the literal Buttons page is recorded at corroboration level `single_component_observed`, never asserted as fixed or universal.

## 2. Evidence and source roles

*Classification: observed.*

| Source | What it provides | Self-reports validation? |
|---|---|---|
| `NAME-0001-components-NODE-0005-basic-tree.json` (SHA-256 `TRUNC-0001`) | Full hierarchy, no style/variable data. | No — no `validation` block exists. Counts attributed to it were independently computed by walking the tree. |
| `NAME-0001-components-NODE-0005-terminal.json` (SHA-256 `TRUNC-0002`, `source.generatedAt: "2026-08-11T09:31:57.312Z"`) | Same hierarchy plus `styles.*`, `componentPropertyDefinitions`, `namedStyleCatalog`, `variableCatalog`. | Yes — a `validation` block with layer/type counts and reference-resolution checks. Reference-resolution (unresolved styles/variables, duplicate IDs) is only possible from this file. |
| Rendered page image (chat-supplied) | Whole-page layout, panel grouping. Text too low-res to read reliably. | N/A |
| Live Figma reads, read-only, both logged verbatim in `contract.provenance.liveFigmaAccessLog` | `get_metadata(NODE-0005)` confirmed root identity (`artifactAvailable: false` — no artifact was ever saved from this read). `get_screenshot(NODE-0006)` resolved a specific band-ordering ambiguity and showed one matrix visually populated (`resultingEvidenceLevel: "visual_matrix_verified"`, `artifactAvailable: true`, artifact preserved at `evidence/comp_build_NODE-0002_screenshot.png`, SHA-256 `TRUNC-0003`). Neither read has a logged wall-clock `capturedAt` — recorded as `null` rather than guessed. | N/A |

## 3. Structural anatomy

*Classification: observed unless marked; scope: Buttons unless marked.*

```
component_box                          SECTION   NODE-0005   [observed live via get_metadata]
└── main_container                     FRAME     NODE-0007
    ├── component_intro                FRAME     NODE-0008
    ├── hr                              RECTANGLE
    ├── components_representations      FRAME              — holds all 196 INSTANCE nodes in this file
    │   └── reps_containers → dark_rep_container / light_rep_container
    ├── hr                              RECTANGLE
    └── component_builds_section        FRAME
        ├── comp_build_section 'Primary Buttons'    (builds_container → 4 comp_build)
        ├── hr
        ├── comp_build_section 'Secondary Buttons'  (builds_container → 4 comp_build)
        ├── hr
        └── comp_build_section 'Disabled Buttons Variants' (builds_container → 2 comp_build)
```

The top-level order occurs exactly once in this file (`SF-09`, scope: specific node — one occurrence is not yet a demonstrated invariant, even within Buttons).

Each of the 10 `comp_build` FRAMEs wraps exactly one `COMPONENT_SET`. **New in this revision:** the `comp_build` FRAME id is now tracked separately from the `COMPONENT_SET` id it wraps (`contract.componentSets[].buildFrameId`), because the two are different node types/ids that were previously conflated:

| COMPONENT_SET id | comp_build (buildFrameId) | Name |
|---|---|---|
| NODE-0002 | NODE-0006 | Button - Primary - Filled - Gradient |
| NODE-0009 | NODE-0010 | Button - Primary - Tonal - Solid |
| NODE-0011 | NODE-0012 | Button - Primary - Outline - Gradient |
| NODE-0013 | NODE-0014 | Button - Primary - Text - Void |
| NODE-0015 | NODE-0016 | Button - Secondary - Filled - Solid |
| NODE-0017 | NODE-0018 | Button - Secondary - Tonal - Solid |
| NODE-0019 | NODE-0020 | Button - Secondary - Outline - Solid |
| NODE-0021 | NODE-0022 | Button - Secondary - Text - Void |
| NODE-0023 | **NODE-0003** | Button - Disabled - Outlined |
| NODE-0024 | **NODE-0004** | Button - Disabled - TextOnly |

Bolded rows were directly corrected by the file owner and independently re-verified against the raw export in this revision; the other 8 were extracted the same way and cross-checked by an independent review pass.

`build_description` (headline + trailing `hr`) is retained on **every** `comp_build`, including both Disabled ones — only the child `x-axis_legends_container` is conditionally absent, because `State` has one declared value there and no column header row is needed (`SF-06`).

## 4. Quantitative profile

*Classification: computed, cross-checked against `terminal.json`'s self-report; scope: specific node (this file).*

1,478 total layers (agreed by two independent computations plus the self-report). Max depth 11 (0-indexed) / 12 (`terminal.json`'s own 1-indexed convention — a counting-convention difference, not a contradiction). Type counts: FRAME 628, TEXT 550, INSTANCE 196, RECTANGLE 52, ELLIPSE 40, COMPONENT_SET 10, SECTION 1, VECTOR 1. 10 `COMPONENT_SET`s (4 Primary + 4 Secondary + 2 Disabled). 196 `INSTANCE`s, all 196 confirmed under `components_representations`. 23 named styles, 69 variables across 6 collections. 0 duplicate IDs, 0 unresolved named styles, 0 unresolved variables (only checkable from `terminal.json`, since `basic-tree.json` carries no style/variable data to check in the first place).

## 5. Visual-to-structural mapping and the screenshot's real evidentiary weight

*Classification: observed (screenshot-verified items) or visual inference (image-only), marked individually.*

Columns → `State` (screenshot-verified for one `comp_build`); rows → `Size` (same); the purple caption lines → `comp_build_variant_section/comp_build_var_description` (screenshot-verified, text also independently extracted for all 40 bands). The band lacking a divider is visually topmost but structurally the **last** child (`comp_build` uses `layoutMode: NONE`; neither export carries `x`/`y`, so this ordering fact is screenshot-only, not derivable from JSON — scope: specific node, since only one of the 10 `comp_build`s was re-screenshotted).

**Corrected framing for the screenshot's evidentiary weight:** the live screenshot of `NODE-0002` showed a fully populated 4-band × 5-row × 5-column grid with no visible gaps. This is real, useful evidence — but it is a *visual* render, not a *structural enumeration* of the `COMPONENT_SET`'s actual children. The two are deliberately not ordered relative to each other in `contract.evidenceLevel`: a screenshot can miss an occluded node, a rendering artifact, or an off-canvas component in a way a real API-level child listing cannot. `coveragePolicy.perComponentSetCoverage` for `NODE-0002` therefore now reads `physicalCoverageEvidenceLevel: "visual_matrix_verified"`, `physicalCompletenessClaimed: false` — down from the prior draft's `component_children_verified` / `true`. **Net: 0 of 10 component sets meet the completeness bar**, not 1 of 10.

## 6. Component API: two schema variants

*Classification: observed, read directly from `componentPropertyDefinitions`.*

**`schema_a_full_state`** (8 sets: all Primary + Secondary) and **`schema_b_disabled_state`** (2 Disabled sets) are modeled as two explicit variants, differing only in `State.canonicalOptions` (`["Enabled","Hovered","Focused","Pressed","Disabled"]` vs. `["Disabled"]`). All other properties — `Size`, `Layout`, `Symbol`, the `Leading`/`Trailing` booleans, the two icon instance-swaps, the `Label` text property — are identical across both, including byte-identical synthetic property IDs (e.g. `Leading#NODE-0025`) across all 10 sets (inferred, not directly provable: likely shared lineage from one duplicated master).

## 7. Variant-matrix semantics, `layoutRepresentations[]`, and typed allocations

*Classification: mixed, marked per claim.*

**New in v0.4.0-draft:** the scalar `layoutStrategy` and top-level `matrixAllocations` are gone. A component now declares `layoutRepresentations[]` — several documentation shapes may coexist, each scoped to its own schema variants and evidence nodes. Buttons migrates to two matrix representations, `LR-1` and `LR-2`. Allocation dimensions are a tagged union rather than axis-name strings.

- `LR-1` (→ `schema_a_full_state`): rows `variant_property Size`, columns `variant_property State`, bands `Layout` and `Symbol`.
- `LR-2` (→ `schema_b_disabled_state`): identical except `columns: null` — Disabled has no column axis because `State` has one value there. Structurally `null`, not a footnote.

Neither allocation is yet human-approved (`approvalStatus: "pending_review"`, `ownerConfirmationRef: null` on both — `BLK-2`).

**Axis correlation (`CAT-1`, computed from 100% of the data):** cross-referencing all 40 annotation bands against all 196 `INSTANCE.variantProperties` shows `Layout` and `Symbol` are never independently combined — only 4 of the naive 8 pairings ever occur. The real documented-pairing count is 100 cells for `schema_a` sets, 20 for `schema_b` sets (not the naive 200/40). `CAT-1.approvalBasis` is `"unresolved"` — this is pattern-detection over the file's own data, not an owner confirmation and not a structural enumeration, and per `CV-6`/`CV-8` it must not be promoted to `approvedCombinations` without one or the other (`BLK-1`).

**New: `observedCombinations` vs. `proposedValidCombinations` vs. `approvedCombinations`.** The prior draft's single `allowedCombinations` field conflated "what was seen" with "what may be treated as valid." These are now three separate fields: `observedCombinations` (what the data shows), `proposedValidCombinations` (currently identical to observed — nothing has been hypothesized beyond direct observation), and `approvedCombinations` (empty — nothing has been promoted). Promotion requires either a real, resolvable owner confirmation, or `approvalBasis: "fully_enumerated"` backed by structural enumeration evidence (`enumerationEvidence.status: "enumerated"`) on **every** component set in scope, with the approved set equal to the **intersection** (not union) of what was actually enumerated across those sets — a combination present in only some in-scope sets is exactly the kind of discrepancy this contract exists to surface, not paper over optimistically. For Buttons today, all 10 sets show `enumerationEvidence.status: "not_enumerated"` — this has never been done for any of them.

## 7a. Coverage metrics, discriminated

v0.3.1 exposed one untyped `documentedPairingCount` integer per component set and no way to say which quantity it counted. v0.4.0-draft replaces it with discriminated `coverageMetrics[]`. `matrix_cells` counts rows × columns, **excluding** bands.

<!-- GENERATED:COVERAGE_METRIC_TABLE:START -->
| Component set | Metric kind | Metric | Value | Scope |
|---|---|---|---|---|
| `NODE-0002` | **legacy_unclassified** | _undefined — owner decision_ | 100 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0009` | **legacy_unclassified** | _undefined — owner decision_ | 100 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0011` | **legacy_unclassified** | _undefined — owner decision_ | 100 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0013` | **legacy_unclassified** | _undefined — owner decision_ | 100 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0015` | **legacy_unclassified** | _undefined — owner decision_ | 100 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0017` | **legacy_unclassified** | _undefined — owner decision_ | 100 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0019` | **legacy_unclassified** | _undefined — owner decision_ | 100 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0021` | **legacy_unclassified** | _undefined — owner decision_ | 100 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0023` | **legacy_unclassified** | _undefined — owner decision_ | 20 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |
| `NODE-0024` | **legacy_unclassified** | _undefined — owner decision_ | 20 | from `coveragePolicy.perComponentSetCoverage[].documentedPairingCount` |

`matrix_cells` counts rows × columns, **excluding** bands. A `legacy_unclassified` entry preserves a migrated value whose metric kind was never recorded; it blocks approval until the owner defines it.
<!-- GENERATED:COVERAGE_METRIC_TABLE:END -->

## 8. Structural findings register

Every structural claim is registered with a stable id. The table below is generated verbatim from `component-representation-contract.json`'s own `structuralFindings` array via `generate_tables.py` — run `python3 generate_tables.py --check component-representation-analysis.md` to verify it hasn't drifted.

<!-- GENERATED:SF_TABLE:START -->
| ID | Finding | Applies to | Corroboration |
|---|---|---|---|
| SF-01 | comp_build internal shape (variant-band annotations -> COMPONENT_SET -> y-axis legends -> build_description) held identically across all 10 comp_build instances. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-02 | comp_build_var_description grammar '{key} - {value}' repeated, joined by a dot-separator glyph, held identically across all 40 annotation bands. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-03 | en_dash text nodes contain a literal hyphen (U+002D), never a typographic en dash (U+2013), across all 80 occurrences. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-04 | The specific pairing {Center - Fill <-> Optional, Left - Hug <-> Leading/Trailing/Both} is the exact Layout/Symbol correlation observed in every one of the 10 Button component sets. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-05 | The general principle that declared VARIANT axes on a COMPONENT_SET may be correlated rather than independently combinable, and that naive Cartesian expansion can overstate the real design space, is a Figma-level phenomenon (not a Button API detail) but is only evidenced here via Buttons. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-06 | Disabled-restricted component sets (State limited to one value) omit the x-axis legend row but retain build_description (headline + divider), for both of the 2 observed disabled sets. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-07 | Theme is implemented by binding the same variable to different container frames, which resolve to different mode-specific literal values, for both of the 2 observed theme containers in this file. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-08 | The general principle that Figma variable modes (rather than duplicate named styles) can implement theme switching is a file/Figma-level mechanism, not Button-specific, but is only evidenced here via the Buttons page's two theme containers. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-09 | The top-level page order (intro -> divider -> representation -> divider -> builds) occurs exactly once in this file (one component_box); it has not been observed to repeat, even within Buttons. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
| SF-10 | The partition into exactly 3 semantic families (Primary/Secondary/Disabled) with hr dividers between them is specific to this one component_builds_section; the comp_build_section internal shape (headline + builds_container) does repeat 3/3 times. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
| SF-11 | Naming-convention violations exist and are not schema/lint-enforced: 4/38 var_col-title-role nodes are named 'Label' instead of 'var_col_title'; 4 comp_pan-role wrapper frames are named 'container'; the light-mode theme heading is named 'Subheading' vs. the dark-mode 'rep_title'; a capital-I typo ('Center - FIlled') ships in both theme panels. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-12 | All 196 exported INSTANCE nodes are located inside components_representations; 0 are located inside any comp_build. INSTANCE.variantProperties data therefore proves specific axis combinations exist as real components, but only for the combinations shown in the representation gallery, not for the matrix cells inside each COMPONENT_SET. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-13 | The mechanism by which dark_rep_container and light_rep_container resolve an identical bound variable to different literal values (explicit per-frame mode override vs. inherited vs. some other Figma mechanism) is not observable from either export; explicitVariableModes occurs 0 times anywhere in the terminal export. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
| SF-14 | The v0.2.0-draft contract treated the get_screenshot(NODE-0006) result as component_children_verified-level evidence and claimed physical completeness for NODE-0002. That evidence level has been split (visual_matrix_verified vs. component_children_enumerated) and the screenshot correctly reclassified as visual_matrix_verified only, which does not meet the completeness bar. Net effect: 0 of 10 component sets now meet the bar (previously reported as 1 of 10). This finding exists purely for cross-version traceability. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
| SF-15 | The v0.3.0-draft contract and validator claimed 5/5 enforceability but had five real enforcement gaps: fully_enumerated was label-based (an artifact could be fabricated/reused across sets); ownerConfirmations resolution was one-directional (an orphan confirmation record passed silently); layoutRepresentations[].allocation coverage only checked for zero coverage, not exactly-one, and its axis check unioned declared axes across referenced variants instead of requiring every one; the qualifying-evidence-levels policy field was unconstrained; and generate_tables.py had no drift-detection mode. All five are closed in v0.3.1-draft (CV-11 added; CV-3/CV-6/CV-7 corrected; CV-1 gained a schema-enforced floor restriction; generate_tables.py --check added). This finding exists purely for cross-version traceability. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
<!-- GENERATED:SF_TABLE:END -->

No finding is labeled "fixed" or "universal." Scope and corroboration are now separate: `appliesToScopes[]` says WHAT a finding covers, `corroboration.level` says HOW BROADLY it has been observed. The strongest level any Buttons finding reaches is `single_component_observed` — true across all observed recurrences within Buttons, explicitly not a claim about any other component.

## 9. Theme mechanism — what is proved and what is not

*Unchanged from the prior revision's correction, restated for completeness.* `dark_rep_container`/`light_rep_container` both bind the identical `VariableID:TRUNC-0004/NODE-0026` and resolve to that variable's two different declared per-mode values (`Dark`/`Light`, modes `NODE-0027`/`NODE-0028`) — directly observed. `explicitVariableModes` occurs 0 times anywhere in `terminal.json`, so *why* the two containers resolve differently (explicit per-frame override vs. inherited vs. some other mechanism) is unverified, not directly observed (`SF-13`, `BLK-4`).

## 10. Editorial/display-label truth vs. Component API truth

*Classification: observed.* Caption differences are treated as possible editorial mappings, not automatic errors — most are ordinary shorthand (`"Center - Fill"` → `"Central"`), and exactly one is an unambiguous typo (`"Center - FIlled"`, capital I mid-word, in both theme panels). The full mapping lives in `contract.canonicalValueDisplayLabelMap`. Naming-convention violations in the scaffold itself (nodes named `Label` instead of `var_col_title`, `container` instead of `comp_pan`, `Subheading` vs. `rep_title`) are tracked separately as `SF-11`, since they're a documentation-layout-truth issue, not a caption-content one.

## 11. Risks, ranked by likely impact

1. **Physical coverage is weaker than the prior draft stated.** 0 of 10 sets meet the `component_children_enumerated`/`owner_confirmed` bar (§5, `BLK-3`).
2. **Naive Cartesian expansion would be wrong.** `Layout × Symbol` is correlated (§7). A Builder that ignores this generates documentation for combinations that never existed.
3. **`Symbol` and the `Leading`/`Trailing` booleans overlap semantically** — every instance with a fixed `Symbol` preset has both booleans `false`; all four boolean combinations only appear under `Symbol = Optional`.
4. **Editorial-label drift is real and shipped**, including one typo. A Builder that treats a caption as canonical will propagate this.
5. **Layer-naming convention is not schema-enforced** (`SF-11`) — ~10% of role-bearing nodes use the "wrong" name for their role.
6. **No owner confirmation exists anywhere yet** (`BLK-6`, `BLK-7`) — every approval path in this contract (axis correlation, matrix allocation, coverage, contract-overall) is currently blocked on this.
7. **The theme-mode mechanism is unverified** (§9).
8. **No second, non-Button component has been analyzed** (`BLK-5`) — the single largest open risk for extending this contract past Buttons.

## 12. Confidence by section

High: structural anatomy (for shapes recurring ≥3 times), quantitative profile, component API, the axis-correlation finding itself, the corrected screenshot-evidence framing. Explicitly capped lower: anything recorded at corroboration level `single_component_observed` (confidence: medium at most, by design), and the one-comp_build ordering finding (screenshot-only, not re-confirmed for the other 9).

## 13. Recommended next investigation

Unchanged in substance from the prior revision: the single highest-value next step is analyzing one non-Button component to test which single-component findings actually hold outside Buttons (`BLK-5`). A close second: performing a real structural enumeration (not a screenshot) on at least one component set, to move it from `visual_matrix_verified`/`schema_only` to `component_children_enumerated`, which would also be the first real test of the `fully_enumerated` promotion path described in §7.
