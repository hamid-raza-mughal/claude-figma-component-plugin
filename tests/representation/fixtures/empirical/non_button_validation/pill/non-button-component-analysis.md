# Pill — Re-derived Component Model

**File:** `NAME-0001-Components` (`FILEKEY-0002`) · **Page:** `Pills` (`NODE-0538`) · **Root:** `NODE-0539` `component_box`
**Pass:** R-2 live-evidence reconciliation · **Date:** 2026-08-16

All structural facts are now read from the **Figma Plugin API** via read-only `use_figma` scripts. R-1's name-parsed derivations have been replaced and diffed (`evidence/api-vs-nameparse-diff.json`). No Button family, axis, correlation, layout strategy, allocation, scaffold, or coverage count was carried in. Claims are tagged **[observed]**, **[computed]**, **[inferred]**, **[unverified]**, or **[owner-decision]**.

---

## 1. Identity and scope

**[observed]** Root `NODE-0539` is a direct child of page `Pills` (`NODE-0538`) — a two-node ancestry chain, so the selection is a top-level component box.

```
NODE-0538  PAGE "Pills"
└── NODE-0539  FRAME component_box
    ├── NODE-0540   FRAME header                     (page chrome)
    ├── NODE-0001   FRAME components_holder          DOCUMENTATION — "Pills — Anatomy & Usage"
    │   └── NODE-0004 container
    │       ├── NODE-0005 card  ← TEXT NODE-0007 = "Dark Mode"
    │       │   ├── NODE-0008  content  block A: per-axis list strip   (15 Pill instances)
    │       │   └── NODE-0133 content  block B: treatment × accent matrix (32)
    │       └── NODE-0069 card  ← TEXT NODE-0071 = "Light Mode"
    │           ├── NODE-0072  content  block A  (15)
    │           └── NODE-0213 content  block B  (32)
    └── NODE-0545   FRAME components_holder          BUILD — five COMPONENT_SET nodes
```

## 2. Component sets — API-confirmed

**[observed]** All five are genuine `COMPONENT_SET` nodes whose children are all `COMPONENT`. All five share the single build frame `NODE-0545`.

| Node | Name | `type` | `visible` | Children | Component-set `key` |
|---|---|---|---|---|---|
| `NODE-0317` | Pill – Highline | COMPONENT_SET | `true` | 48 | `KEY-0015` |
| `NODE-0366` | Pill – Highlighted | COMPONENT_SET | `true` | 48 | `KEY-0017` |
| `NODE-0415` | Pill – Filled | COMPONENT_SET | `true` | 48 | `KEY-0016` |
| `NODE-0464` | Pill – Text | COMPONENT_SET | `true` | 48 | `KEY-0013` |
| `NODE-0513` | Pill – Pulse Animation | COMPONENT_SET | **`false`** | 24 | `KEY-0005` |

**[computed]** Completeness and integrity, checked inside Figma against each set's own declared `variantOptions`:

| Set | Children | Declared Cartesian | Distinct | Duplicates | Missing | Extra |
|---|---|---|---|---|---|---|
| Highline | 48 | 4 × 4 × 3 = 48 | 48 | 0 | 0 | 0 |
| Highlighted | 48 | 4 × 4 × 3 = 48 | 48 | 0 | 0 | 0 |
| Filled | 48 | 4 × 4 × 3 = 48 | 48 | 0 | 0 | 0 |
| Text | 48 | 4 × 4 × 3 = 48 | 48 | 0 | 0 | 0 |
| Pulse Animation | 24 | 2 × 2 × 3 × 2 = 24 | 24 | 0 | 0 | 0 |

Every audit claim on this table is confirmed. 216 children total.

## 3. Property schemas — all four property types

**[observed]** `componentPropertyDefinitions`, read from each `COMPONENT_SET` (never from a variant child).

**PSV-1** — byte-identical across all four visible sets:

| Property key | Type | Default | Options |
|---|---|---|---|
| `Pill Value#NODE-0301` | TEXT | `Label` | — |
| `Pill Symbol#NODE-0295` | INSTANCE_SWAP | `NODE-0315` | preferred: component key `KEY-0011` |
| `Accent` | VARIANT | `Success` | Warning, Error, Success, Info |
| `Size` | VARIANT | `XXSmall` | Regular, Small, XSmall, XXSmall |
| `Icon` | VARIANT | `None` | Leading, None, Trailing |

**PSV-2** — `NODE-0513`:

| Property key | Type | Default | Options |
|---|---|---|---|
| `Badge Value#NODE-0301` | TEXT | `-3.2%` | — |
| `Trend Symbol#NODE-0294` | INSTANCE_SWAP | `NODE-0316` | preferred: component key `KEY-0001` |
| `Type` | VARIANT | `Warning` | Warning, Error |
| `Style` | VARIANT | `Highline` | Highline, Filled |
| `Size` | VARIANT | `Small` | Large, Regular, Small |
| `Animation` | VARIANT | `S1` | S1, S2 |

All expected findings verified. Two things R-1 could not see are now first-class:

- **Non-VARIANT properties exist in both schemas** and carry real defaults. Nothing in the v0.3.1 contract — coverage, allocations, correlated tuples, the label map — can reference them (blocker **PB-9**).
- **Every VARIANT axis has a declared default.** Note the defaults are *not* the documented specimens: `Size` defaults to `XXSmall`, but the documentation shows `Regular` everywhere.

### 3.1 Four ways the two schemas disagree inside one component

1. **Different key, same concept.** `Accent` {Warning, Error, Success, Info} vs `Type` {Warning, Error}. **[computed]**
2. **Same key, different domain and default.** `Size` = {Regular, Small, XSmall, XXSmall} default `XXSmall` vs {Large, Regular, Small} default `Small`. **[computed]**
3. **Treatment at two levels.** Set identity in PFAM-1; an in-set `Style` axis in PFAM-2. **[computed]**
4. **Renamed content properties.** `Pill Value`/`Pill Symbol` vs `Badge Value`/`Trend Symbol`, and the default flips from a generic `Label` to a percentage delta `-3.2%`. **[observed]** — bears on the taxonomy question, **[owner-decision]** to resolve.

## 4. Axis independence — established, not assumed

**[computed]** For every set, distinct combinations equal the declared Cartesian product with zero duplicates, zero missing and zero extra. The axes within each schema variant are **independent**, verified per variant.

Recorded as `CAT-1` (PSV-1) and `CAT-2` (PSV-2), both with `approvalBasis: "unresolved"` and `approvedCombinations: []`. Complete enumeration is not approval.

## 5. Size is a relative scale, not an absolute one

**[computed]** Child heights:

| Set | Regular | Small | XSmall | XXSmall | Large |
|---|---|---|---|---|---|
| Highline / Highlighted / Filled | 32 | 24 | 20 | 16 | — |
| **Pill – Text** | **20** | **16** | **12** | **10** | — |
| Pulse Animation | 32 | 24 | — | — | 40 |

`Pill – Text` / `Regular` (20px) is exactly the height of `Pill – Filled` / `XSmall`. Any Size→pixel rule must be scoped by component set.

## 6. Documentation instances — real variant properties

**[observed]** All 94 Pill instances resolved through `getMainComponentAsync()` → owning `COMPONENT_SET`, with `INSTANCE.variantProperties`. Nested icon instances excluded.

| Block | Node | Pill instances |
|---|---|---|
| Dark · list | `NODE-0008` | **15** |
| Dark · matrix | `NODE-0133` | **32** |
| Light · list | `NODE-0072` | **15** |
| Light · matrix | `NODE-0213` | **32** |
| **Per theme** | | **47** |
| **Total** | | **94** |

All counts match the audit claims exactly.

### 6.1 Matrix structure, recomputed from instances

**[computed]** From `evidence/allocation-evidence-MA-1.json`, derived from the 64 matrix instances' ownership, variant properties and absolute positions:

- **Rows** = `component_set_identity`, ordered by ascending `absoluteY`: `row_Highline`, `row_Highlighted`, `row_Filled`, `row_Text`
- **Columns** = `variant_property` `Accent`, ordered by ascending `absoluteX`: Success, Error, Warning, Info
- **Bands** = `variant_property` `Size`: Regular, Small
- **Fixed filter** = `Icon = None` across **all 64** matrix instances

Every audit claim on matrix structure is confirmed.

### 6.2 Three coverage metrics — all real, all different

**[computed]**

| Set | Instance placements | Unique variant combinations | Matrix cells (per theme) |
|---|---|---|---|
| Highline | 18 | 8 | 4 |
| Highlighted | 18 | 8 | 4 |
| Filled | **40** | **12** | 4 |
| Text | 18 | 8 | 4 |
| Pulse Animation | **0** | **0** | 0 |

Both audit-claimed metric sets are confirmed. `documentedPairingCount` in the contract now carries **unique variant combinations**; the other two are recorded in `coveragePolicy.statement` and PF-16 because the schema has one untyped integer and no discriminator (blocker **PB-8**). Filled is over-represented because it is the sole specimen for the Size, Accent and Icon strips.

## 7. Theme model — direct identity and mode evidence

**[observed]** Collection `colors`:

| Field | Value |
|---|---|
| id | `VC-0002` |
| key | `KEY-0008` |
| `remote` | **`true`** |
| variables | 105 |
| `defaultModeId` | `NODE-0299` |
| modes | **Dark** `NODE-0299` · **Light** `NODE-0558` |

All audit-claimed identities confirmed. One refinement: **`colors` is a remote (library) collection.** `getLocalVariableCollectionsAsync()` returns only `icon_config`; `colors` had to be resolved by id. A tool that enumerates local collections alone would conclude this file has no theme system.

**[observed]** Mode provenance differs between the two containers — exactly as claimed:

| Container | `explicitVariableModes` | Resolved `colors` mode | Provenance |
|---|---|---|---|
| `NODE-0005` "Dark Mode" | `{}` — empty, **and empty on every ancestor up to PAGE** | `NODE-0299` Dark | **inherited** (collection default) |
| `NODE-0069` "Light Mode" | `{colors: "NODE-0558"}` | `NODE-0558` Light | **explicit** |

**[observed]** The same variable IDs are bound under both cards — theme divergence comes from mode resolution, not from different variables:

| Bound on | Variable | ID | Dark `NODE-0299` | Light `NODE-0558` |
|---|---|---|---|---|
| `INSTANCE.fills` | `System/Expressions/success` | `…448294c4…/NODE-0579` | `#43DB70` | `#17CF60` |
| `TEXT "Label".fills` | `System/Expressions/on_success` | `…2dec1bfb…/NODE-0580` | `#01180D` | `#FFFFFF` |
| padding L/R | `4-scale/xs` | `…ceae99d3…/NODE-0297` | 12 | 12 |
| padding T/B | `aux/xs` | `…79b9df58…/NODE-0298` | 6 | 6 |

**[observed]** A **second remote collection** also resolves on both containers: `layout-scale` (`…2ca0ac65…/NODE-0296`, 15 variables, single mode `Default` = `6:1`). It supplies the padding and is **not** theme-varying. The contract's singular `themeModel` cannot record it.

Three things must therefore be kept separate — and v0.3.1 conflates all three into one `boundVariableId` string (blocker **PB-4**):

1. **collection → mode binding** (`explicitVariableModes`, per collection)
2. **explicit vs inherited provenance** (empty map + default mode ≠ declared choice)
3. **variables used by descendants** (many IDs, across two collections)

**[observed]** Both containers are literally named `card`. Theme identity is carried only by a child headline TEXT node.

## 8. Hidden Pulse Animation set

**[observed]** `NODE-0513` — every audit claim confirmed:

- `visible: false` while `parent.visible: true` — structurally present, visually hidden.
- **Real variable bindings:** 12 of the 24 top-level COMPONENT children carry `boundVariables` (e.g. `fills` → `…e402b0fd…/NODE-0314`). The set node itself has none. R-1's `get_variable_defs` → `{}` was a tool artifact of the hidden subtree, not an absence.
- **24 prototype reactions**, one per child: `AFTER_TIMEOUT` triggers driving `CHANGE_TO` actions with `SMART_ANIMATE` / `EASE_OUT` / `0.6s`.
  - Timeouts: **0.4s** for Small and Regular, **0.8s** for Large.
  - Pairing is **bidirectional** S1 ↔ S2, forming 12 two-state loops over each (Type, Style, Size) triple.
- **0 instances** in the documentation holder — absent from the visible documentation.

**[observed]** Terminology bearing on taxonomy: this set names its content properties `Badge Value` (default `-3.2%`) and `Trend Symbol`, against `Pill Value` (default `Label`) and `Pill Symbol` in the four visible sets.

> **[owner-decision]** Whether `NODE-0513` is production Pill, work-in-progress, legacy, or a separate Badge component is **not decided here**. Its presence in this contract reflects structural containment under `NODE-0545` only. The naming evidence, the disjoint schema, the hidden flag, and the zero documentation coverage are all recorded as inputs to that decision.

**[unverified]** What S1 and S2 render differently; only the transition wiring was captured.

## 9. Coverage levels

| Set | Evidence level | Completeness claimed | `documentedPairingCount` (unique combos) |
|---|---|---|---|
| `NODE-0317` | `component_children_enumerated` | **false** | 8 |
| `NODE-0366` | `component_children_enumerated` | **false** | 8 |
| `NODE-0415` | `component_children_enumerated` | **false** | 12 |
| `NODE-0464` | `component_children_enumerated` | **false** | 8 |
| `NODE-0513` | `component_children_enumerated` | **false** | 0 |

All five now reach the level via a first-class API field rather than name parsing. Every completeness claim remains `false` — this experiment is not authorised to approve completeness.

## 10. R-1 → R-2 evidence diff

**[computed]** `evidence/api-vs-nameparse-diff.json`:

- **0 variantProperty mismatches** across all 216 children. Component-ID sets identical for all five sets. Option **membership** identical on every axis.
- **Option ORDER differed** on 9 axes — name parsing recovers first-seen traversal order, the API declares authored order. Example (Highline): `Accent` name-parse `[Success, Warning, Error, Info]` vs API `[Warning, Error, Success, Info]`; `Icon` `[Leading, Trailing, None]` vs `[Leading, None, Trailing]`.
- Facts **only** the API could supply: node type, visibility, component-set key, all non-VARIANT properties, and every `defaultValue`.

Name parsing happened to be correct for Pill — but that could not be known without the API, which is precisely why `component_children_enumerated` needs a method discriminator (blocker **PB-7**, residual).

## 11. Blockers

| ID | Status | Subject |
|---|---|---|
| PB-1 | open | `layoutStrategy` is a single global enum; Pill's documentation is hybrid |
| PB-2 | open | CV-7 forbids indexing a matrix by treatment, which the schema elsewhere calls an axis |
| PB-3 | open | `generalizationScope` / `structuralClassification` enums are Button-hardcoded |
| PB-4 | **narrowed** | Identifiers observable; singular `boundVariableId` model and missing mode provenance remain |
| PB-5 | open | `canonicalValueDisplayLabelMap` has no set/variant scoping |
| PB-6 | open | `treatmentLabel` required but meaningless for PFAM-2 |
| PB-7 | **narrowed** | Pill evidence gap closed; method discriminator still missing from the schema |
| PB-8 | **narrowed** | Metrics observable; `documentedPairingCount` still undiscriminated |
| PB-9 | **new** | Nothing can reference a non-VARIANT component property |
| PB-10 | **new** | Prototype-driven variant animation has no representation |

## 12. Open questions

| # | Question | Status |
|---|---|---|
| Q-1…Q-7 | See `baseline-delta-report.md` Part 9 | **resolved** by the Plugin API |
| Q-8 | Does another non-Button component share Pill's 5:1 build-frame topology and hybrid documentation? | **open** — needs a third component |
| Q-9 | What do `Animation=S1` / `S2` render? | open — transition wiring captured, frame content not |
| Q-10 | Is `NODE-0513` production, WIP, legacy, or a separate component? | **owner decision** |
| Q-11 | Why does PSV-2 restrict to {Warning, Error} and {Highline, Filled}? | owner decision |
| Q-12 | Are the `Size` defaults (`XXSmall` in PSV-1) intentional, given the documentation shows `Regular`? | owner decision |
