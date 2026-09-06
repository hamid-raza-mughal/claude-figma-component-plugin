# Baseline Delta Report — Pill vs `component-representation-contract v0.3.1-draft`

**Pass:** R-2 live-evidence reconciliation · **Date:** 2026-08-16
**Evidence component:** Pill (`NODE-0539`, page `Pills` `NODE-0538`, file `FILEKEY-0002`)

Nothing here has been applied to the baseline. The v0.3.1 package is byte-unchanged (`verify_checksums.py` → 93/93).

---

## Part 0 — Adversarial test results (re-run against API evidence)

| # | Assumption under test | Verdict | Evidence |
|---|---|---|---|
| 1 | One documentation scaffold fits every component | **contradicted** | Two scaffolds run simultaneously in each theme card: list strip (`NODE-0008`, 15 instances) and matrix (`NODE-0133`, 32). |
| 2 | Every component should use a matrix | **conditional** | A real matrix exists for PSV-1 only, alongside a list block. PSV-2 contributes **0** documentation instances. |
| 3 | All declared axes form a Cartesian product | **corroborated** | Checked in Figma against each set's own `variantOptions`: 48/48/48/48/24 children, 0 duplicates, 0 missing, 0 extra. Corroborated *for Pill*, not promoted. |
| 4 | All component sets within a component share one property schema | **contradicted** | PSV-1 {Pill Value TEXT, Pill Symbol INSTANCE_SWAP, Accent/Size/Icon} vs PSV-2 {Badge Value TEXT, Trend Symbol INSTANCE_SWAP, Type/Style/Size/Animation}. |
| 5 | Rows, columns and bands can be allocated uniformly | **contradicted** | MA-1 covers PSV-1 only, is row-indexed by set identity, restricts bands to {Regular, Small} of four Size values, and fixes `Icon=None`. PSV-2 admits no allocation. |
| 6 | Disabled/restricted states follow the Button omission pattern | **not_applicable** | Neither schema declares a disabled, readonly or interaction-state property of *any* type. Absence of the Button pattern is not a contract failure. |
| 7 | Theme switching uses the same mechanism observed for Buttons | **corroborated (mechanism) / contradicted (convention)** | Same collection `colors` `…4c8f51ad…/NODE-0559`, same modes Dark `NODE-0299` / Light `NODE-0558` as the Buttons baseline. But Buttons used `dark_rep_container`/`light_rep_container`; Pill's containers are **both named `card`**, and their mode provenance differs (inherited vs explicit). |
| 8 | Caption differences are necessarily errors | **contradicted** | `No Icon`/`Leading Icon`/`Trailing Icon` against API canonical `None`/`Leading`/`Trailing` is editorial. No typo-class divergence anywhere in Pill. |
| 9 | Visual completeness implies structural completeness | **contradicted (decisively)** | `NODE-0513` has `visible:false`, renders blank, is absent from its parent's render, and contributes 0 documentation instances — yet the API reports a COMPONENT_SET with 24 children, a second schema, 12 children with variable bindings, and 24 prototype reactions. |
| 10 | Button-specific findings can safely become Builder defaults | **contradicted** | CV-2 encodes Buttons' 1:1 set→build-frame topology and fires 4 false positives on Pill's 5:1; the scope enums are Button-hardcoded; `treatmentLabel` assumes treatment is always set identity. |

### SF-05 — reclassified

> **Verdict: `conditional` / narrowed** (R-1 said `contradicted`; that was too blunt).
>
> SF-05 warned that declared axes "may be correlated" and that naive Cartesian expansion "can overstate the real design space." For Pill the expansion overstates nothing: every declared combination is physically realised in all five sets, verified against each set's own `variantOptions` inside Figma.
>
> But a single component cannot contradict a possibility claim. What Pill establishes is that the *expectation* embedded in SF-05 — that correlation is the default risk — is unsafe in the opposite direction too. The correct restatement:
>
> **"Axis independence or correlation must be established per schema variant from enumeration evidence; neither may be assumed."**
>
> Note the per-schema-variant scoping: Pill has two variants, and each had to be checked separately. SF-05's `candidate_cross_component_invariant` scope is **not** corroborated. Buttons never reached the evidence level to settle the question at all (`visual_matrix_verified` / `schema_only` throughout); Pill is the first component where enumeration actually decided it.

### SF-08 — upgraded

> **Verdict: `corroborated`, on directly observed variable-identity and mode-binding evidence.**
>
> R-1 inferred the mechanism from variable *names* resolving to different hex values. R-2 observes it directly:
>
> - Collection `colors`, id `VC-0002`, key `4c8f51ad…`, `remote: true`, 105 variables, `defaultModeId: NODE-0299`.
> - Modes **Dark `NODE-0299`**, **Light `NODE-0558`** — the same collection and mode IDs the Buttons baseline recorded, independently re-derived.
> - The **same variable IDs** are bound under both cards (`…448294c4…/NODE-0579` = `System/Expressions/success`, with `valuesByMode` NODE-0299 → `#43DB70`, NODE-0558 → `#17CF60`). Theme divergence is mode resolution, not variable substitution.
>
> `themeModel.mechanismEvidence.classification` moves `unverified` → **`observed`**, and `explicitPerFrameModeOverrideObserved` moves `false` → **`true`**.
>
> **Narrowing retained and extended.** Three things must stay component-specific: (a) container **naming** — Pill's are both `card`; (b) **mode provenance** — Dark is pure default inheritance with no explicit mode anywhere in its ancestry, Light is an explicit override, and these are not interchangeable; (c) **collection multiplicity** — a second remote collection `layout-scale` also resolves on both containers without being theme-varying.

---

## Part 1 — Confirmed reusable contract machinery

| Element | Evidence it worked |
|---|---|
| `propertySchemaVariants` + `schemaVariantId` | The single most valuable structure. Absorbed two incompatible schemas in one component, now including their non-VARIANT properties. |
| `semanticFamilies` | Clean bidirectional membership for PFAM-1 / PFAM-2. |
| `enumerationEvidence` + CV-11 | Passed all eleven legs against five API-sourced artifacts — the strongest exercise the machinery has had. |
| Non-ordering of `visual_matrix_verified` vs `component_children_enumerated` | Vindicated harder than in R-1: the hidden set is invisible to rendering *and* to `get_variable_defs`, yet fully readable via the API. |
| `coveragePolicy` separating evidence level from completeness *claim* | Let us record "enumeration achieved, completeness not claimed" — the honest posture. |
| `propertyDefinition.type` enum | Already admits TEXT / INSTANCE_SWAP; the four real ones slot in without change. (Everything *downstream* of it does not — see PB-9.) |
| CV-1, CV-4, CV-5, CV-6, CV-10 | Correctly silent. No approval fabricated, no obstruction of honest non-approval. |
| `claimClassification` | Sufficient and component-agnostic. |
| `evidenceRecord.nodeIds` | Load-bearing: the workaround for three schema gaps. |

## Part 2 — Button-specific findings correctly remaining Button-scoped

| Button finding | Pill status |
|---|---|
| Disabled-state omission pattern | `not_applicable` — no state property of any type |
| Caption typos (`relationship: "typo"`) | Not present |
| 10 sets in a Primary/Secondary/Disabled hierarchy | Not present — 5 sets, flat treatment list |
| 100-cell documented pairing counts | Different quantity entirely; not comparable |
| `dark_rep_container` / `light_rep_container` naming | Not present — both containers named `card` |
| 1:1 set → build-frame topology | Contradicted — Pill is 5:1 |
| `visual_matrix_verified` as the practical ceiling | Exceeded — API enumeration throughout |

## Part 3 — Candidate invariants corroborated (still candidates; none promoted)

| Candidate | Status |
|---|---|
| Variable modes implement theme switching (SF-08 mechanism) | Corroborated on direct identity evidence, same collection/modes as Buttons |
| A component may contain sets with distinct property schemas | Corroborated — now with non-VARIANT divergence too |
| Display labels diverge editorially from canonical values | Corroborated, different divergence pattern |
| Theme documentation as parallel per-mode containers | Corroborated structurally, contradicted on naming *and* on provenance symmetry |
| Screenshots cannot establish structural completeness | Corroborated with a decisive positive instance |
| Component sets declare non-VARIANT content properties | **New candidate** — Pill declares four; Buttons unexamined for these |

## Part 4 — Hypotheses contradicted or narrowed

| Baseline position | Required change |
|---|---|
| SF-05 as a correlation warning | **Narrow** to per-schema-variant establishment (wording above) |
| SF-08 travelling with Buttons' container convention | **Narrow** — mechanism generalises; naming, provenance and collection-multiplicity do not |
| Treatment is always set identity (`treatmentLabel`) | **Contradicted** — PFAM-2 carries it as an in-set axis with default `Highline` |
| One `layoutStrategy` per component | **Contradicted** |
| A matrix axis must be a declared VARIANT property (CV-7) | **Contradicted** — Pill's real matrix rows are set identity, now *recomputed* from instance evidence |
| Sets have distinct build frames (CV-2 pooling) | **Contradicted** — five sets share `NODE-0545` |
| A `Size` value denotes a stable physical size | **Contradicted** — `Regular` = 32px in three sets, 20px in `Pill – Text` |
| VARIANT properties are the whole property surface | **Contradicted** — four real TEXT / INSTANCE_SWAP properties with defaults |

## Part 5 — Valid evidence the schema cannot represent

| ID | Evidence | Why the schema cannot hold it | Stored instead |
|---|---|---|---|
| **CF-1** | Documentation is both a list strip and a matrix | `layoutStrategy` is one global enum; top-level `allOf` forbids `matrixAllocations` unless it is exactly `"matrix"` | `"matrix"`; the list block survives only as `representativeExamples` prose |
| **CF-2** | PFAM-2 has no set-identity treatment | `treatmentLabel` required non-nullable string | Sentinel string |
| **CF-3** | `Size=Regular` is 32px in three sets, 20px in a fourth; `Size` has two domains and two defaults | `canonicalValueDisplayLabelMap` keyed on `(axis, canonicalValue)`, `additionalProperties: false`, no scoping field | Unscoped entries, caveat in `evidence.note` |
| **CF-4** | *(revised)* Collection/mode/variable identities are known; the **model** is wrong | `containerBindings[].boundVariableId` is a single required string. A container carries a *collection→mode map*, not one variable. No field for explicit-vs-inherited provenance. Only one collection recordable. | Real `collectionName`/`collectionId`/`modeId`s; `boundVariableId` carries a sentence describing the actual binding, because there is no correct value |
| **CF-5** | Two theme containers both named `card` | `containerBindings` has no `nodeId` field | Disambiguation in `evidence.nodeIds` |
| **CF-6** | *(revised)* Enumeration is now API-field based | `evidenceLevel` has one value covering every extraction method | Distinction only in the free-text `enumerationMethod` |
| **CF-7** | Findings scoped to "the Pill component" | `generalizationScope` = {`specific_node`, `buttons`, `candidate_cross_component_invariant`, `owner_declared_standard`}; `structuralClassification` = {`observed_button_invariant`, `button_specific_pattern`, …}. **No non-Button component scope exists.** | All 20 findings forced to `specific_node` / `unknown` — understatement chosen over unauthorised promotion |
| **CF-8** | **New.** Four non-VARIANT properties with real defaults | `propertyDefinition` admits them, but coverage, allocations, correlated tuples and the label map are all VARIANT-only | Declared in `propertySchemaVariants`, referenced nowhere downstream |
| **CF-9** | **New.** 24 prototype reactions wiring S1↔S2 with timed `CHANGE_TO` + Smart Animate | No field of any kind exists for prototype behaviour | `evidence/api-capture-pulse-animation.json` and PF-18 only |
| **CF-10** | **New.** A second collection (`layout-scale`) resolves on both theme containers | `themeModel` is singular | PF-13 and the theme evidence artifact |

**CF-7 remains the structural one.** The scope vocabulary is hardcoded to Buttons; any second component can only be understated or over-promoted.

## Part 6 — Validator false positives and false negatives

Reproduced in `experiment-validation-report.md`. Violation counts are **unchanged from R-1** (6 / 4 / 0 / 2): the evidence improved, the representation defects did not.

### False positive — CV-2 (×4)

```
[CV-2] duplicate Figma node id 'NODE-0545' in the componentSets id/buildFrameId pool   ×4
```

CV-2 pools `id` and `buildFrameId` into one uniqueness namespace. **`buildFrameId` is a many-to-one reference, not an identifier.** Five sets sharing one build frame is ordinary Figma authoring and is Pill's actual topology; the Buttons baseline is 1:1 across all ten sets, so the defect never surfaced. `probe-C` isolates it exactly.

**Minimal fix:** uniqueness on `id` only; retain the useful cross-check that no `buildFrameId` equals any `id`.

### False positive — CV-7 (×1)

```
[CV-7] matrixAllocations['MA-1'].rowsAxis references axis 'Style' which is not
       declared as VARIANT in variant(s): ['PSV-1']
```

Factually correct, wrongly fatal. Pill's matrix **is** row-indexed by component-set identity — and in R-2 that is no longer an assertion: it is *recomputed* from 64 instances' ownership and `absoluteY` ordering in `evidence/allocation-evidence-MA-1.json`. The schema's own `treatmentLabel` description calls treatment "the axis of WHICH component set this is." The contract names treatment an axis in one place and forbids indexing a matrix by it in another.

### True positive against schema expressiveness — CV-3 (×1)

`PSV-2 is not covered by any matrixAllocations entry` is correct given the declaration, but the reality — PSV-2 has no documentation at all — is unsayable. A symptom of CF-1.

### False negatives — the serious result

All four instances score `schema = 0`. Every distortion in Part 5 validates silently: five sentinel/descriptive strings in `themeModel`, the sentinel `treatmentLabel`, and 20 findings at the wrong scope. **A schema pass is not evidence of schema adequacy.**

And:

> **`probe-B-schema-satisfying-distortion.json` passes with 0 violations.**
>
> It contains a **fabricated** `MA-2` for a component set with zero documentation instances, an MA-1 rows/columns assignment that **contradicts** the recomputed evidence, and **suppressed** build-frame provenance. The honest contract fails with 6.

Stated precisely: **the validator cannot distinguish evidenced allocations from evidence-free assertions.** No rule ties `matrixAllocations` to observed documentation nodes or instances, so an allocation describing nothing real is indistinguishable from one recomputed from 64 instances. The severity is unchanged — this is the highest-value gap the experiment found — but it is a capability gap, not an intent.

## Part 7 — Proposed baseline changes (NOT applied)

| # | Change | Addresses | Risk |
|---|---|---|---|
| P-1 | Replace scalar `layoutStrategy` with `layoutRepresentations[]` | CF-1, PB-1, CV-3 | Breaking |
| P-2 | Fix CV-2: uniqueness on `id` only | CV-2 false positive | Low |
| P-3 | Typed dimension references (`variant_property` / `component_set_identity` / `fixed_filter`) | CF-1, CV-7, PB-2 | Medium |
| P-4 | Component-neutral `scopeType`/`scopeRef` finding scope; retire Button-hardcoded enum members | CF-7, PB-3 | **Breaking; highest priority** |
| P-5 | Restructure `themeModel` around collection→mode bindings with provenance | CF-4, CF-10, PB-4 | Medium |
| P-6 | Add `nodeId` to theme container bindings | CF-5, PB-4 | Low |
| P-7 | Scope `canonicalValueDisplayLabelMap` entries to sets/variants | CF-3, PB-5 | Low |
| P-8 | Typed/nullable treatment identity | CF-2, PB-6 | Low |
| P-9 | Structured `enumerationMethod` provenance | CF-6, PB-7 | Medium |
| P-10 | Discriminated coverage metrics | PB-8 | Low |
| **P-11** | **Evidence-backed allocations the validator recomputes** (strengthened — see below) | probe-B false negative | Medium |
| P-12 | Represent TEXT / INSTANCE_SWAP properties downstream of `propertySchemaVariants` | CF-8, PB-9 | Medium |
| P-13 | Represent prototype-driven variant behaviour, or explicitly scope it out | CF-9, PB-10 | Owner call |

### P-11, strengthened

Requiring source node IDs is **insufficient** — a node ID list is still an assertion. The validator must be able to *recompute the allocation and reject a mismatch*. The allocation must therefore carry an evidence artifact containing:

1. **source documentation nodes** — the block node IDs the allocation was read from;
2. **documented instances** — every instance ID within those blocks that belongs to an in-scope component set;
3. **their real variant properties** — from `INSTANCE.variantProperties`, not inferred;
4. **structural grouping and positions** — owning component set, row-group node name, absolute x/y;
5. **derived dimensions** — rows, columns, bands and fixed filters, each with its `kind`, its ordering rule, and its ordered values.

The validator then re-derives (4) → (5) and rejects any allocation whose declared dimensions do not match what the evidence produces. A fabricated `MA-2` fails immediately: it has no instances.

A working prototype is shipped at [`evidence/allocation-evidence-MA-1.json`](evidence/allocation-evidence-MA-1.json). It is **not** part of v0.3.1.

## Part 8 — Changes requiring owner approval

| # | Requires the owner because |
|---|---|
| A-1 | Retiring `buttons` / `observed_button_invariant` / `button_specific_pattern` (P-4) invalidates the accepted baseline's own findings — a versioning decision. |
| A-2 | **Whether `NODE-0513` is production Pill, WIP, legacy, or a separate Badge component.** The `Badge Value` / `Trend Symbol` naming, the disjoint schema, `visible:false`, and zero documentation coverage are evidence, not a verdict. This gates PFAM-2, PSV-2, CAT-2, PB-10 and P-13. |
| A-3 | Whether Pill's five sets and two schemas are one component or two. |
| A-4 | Whether `Size` is intended as a relative scale (permitting `Regular` = 20px in `Pill – Text`). |
| A-5 | Whether PSV-2's restriction to {Warning, Error} and {Highline, Filled} is deliberate. |
| A-6 | Any promotion of Part 3 candidates — two components is not a basis for an invariant. |
| A-7 | Whether the `Regular (32px)` captions should be re-scoped given the `Pill – Text` collision. |
| A-8 | Whether the VARIANT defaults (`Size = XXSmall` in PSV-1) are intentional, given the documentation shows `Regular` throughout. |

## Part 9 — Question status

| # | Question | R-1 | R-2 | Resolution |
|---|---|---|---|---|
| Q-1 | Are the five parents genuinely `COMPONENT_SET`, and do names match real `variantProperties`? | open | **resolved** | All five `type: COMPONENT_SET`, all children `COMPONENT`; 0 mismatches across 216 children (`api-vs-nameparse-diff.json`) |
| Q-2 | Do the sets declare BOOLEAN / TEXT / INSTANCE_SWAP properties or defaults? | open | **resolved** | Four non-VARIANT properties with defaults; every VARIANT axis has a default. No BOOLEAN properties. |
| Q-3 | What is the variable collection, and its mode names and IDs? | open | **resolved** | `colors`, `…4c8f51ad…/NODE-0559`, remote, 105 vars; Dark `NODE-0299` (default), Light `NODE-0558` |
| Q-4 | Explicit per-frame mode override, or inherited? | open | **resolved** | Dark = inherited (empty `explicitVariableModes` through PAGE); Light = explicit `NODE-0558` |
| Q-5 | Which axis combination does each documented instance represent? | open | **resolved** | All 94 captured with real `variantProperties` |
| Q-6 | Does the hidden set have variable bindings? | open | **resolved** | Yes — 12 of 24 children; R-1's `{}` was a tool artifact |
| Q-7 | What motion do `S1` / `S2` encode? | open | **partially resolved** | Wiring resolved: `AFTER_TIMEOUT` (0.4s / 0.8s Large) → `CHANGE_TO` + `SMART_ANIMATE` `EASE_OUT` 0.6s, bidirectional, 12 loops. **Still open:** what the two frames render differently. |
| Q-8 | Does another non-Button component share Pill's topology and hybrid documentation? | open | **open** | Requires a third component. Blocks all Part 3 promotion. |
