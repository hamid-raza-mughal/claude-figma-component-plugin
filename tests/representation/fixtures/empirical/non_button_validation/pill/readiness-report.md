# Readiness Report — Adversarial Non-Button Validation (Pill)

**Experiment:** first adversarial non-Button validation of `component-representation-contract v0.3.1-draft`
**Date:** 2026-08-16
**Authority exercised:** Figma read-only. No create, edit, rename, move, publish, or delete operation was issued. No file inside `Builder_comp_rep_docs/` was modified (verified: `verify_checksums.py` → 93/93 match). Nothing staged or committed.

This is a single batched readiness report. No incremental clarification questions were asked.

---

## 1. Baseline inputs read

| Input | Path | Read |
|---|---|---|
| Contract instance | `Builder_comp_rep_docs/component-representation-contract.json` | yes |
| JSON Schema | `Builder_comp_rep_docs/component-representation-contract.schema.json` | yes |
| Grounding pack | `Builder_comp_rep_docs/builder-grounding-pack.md` | referenced for scaffold vocabulary only |
| Analysis | `Builder_comp_rep_docs/component-representation-analysis.md` | referenced |
| Validation report | `Builder_comp_rep_docs/normalization-validation-report.md` | referenced |
| Changelog | `Builder_comp_rep_docs/CHANGELOG.md` | referenced |
| Semantic validator | `Builder_comp_rep_docs/semantic_validator.py` | read in full (CV-1…CV-11 implementations) |

**Contamination check.** The two baseline exports (`NAME-0001-components-NODE-0005-basic-tree.json`, `…-terminal.json`) were string-searched for `NODE-0035`, `NODE-0040`, `NODE-0041`, `NODE-0039`, and `Pill`. **All five probes returned false.** The baseline exports contain no Pill data whatsoever. Every component-specific fact in this experiment is therefore re-derived from live Figma reads, not carried over.

---

## 2. Figma selection resolution

| Field | Value | Classification |
|---|---|---|
| File key | `FILEKEY-0003` | observed |
| File name | `NAME-0001-Components` | observed |
| Selected node ID | `NODE-0040` | observed |
| Selected node name | `component_box` | observed |
| Selected node kind | frame (per `get_metadata` vocabulary) | observed |
| Bounds | 2634 × 2781 at (−1612, 797) | observed |
| Link resolves | yes | observed |

**Is the selection the complete documentation area for one non-Button component?** Yes. `NODE-0040` contains exactly three functional children:

- `NODE-0382` `header` — page chrome (title / subheading).
- `NODE-0041` `components_holder` — the documentation block, headlined **"Pills — Anatomy & Usage"** (`NODE-0388`), containing two theme cards.
- `NODE-0042` `components_holder` — the build holder, containing the five COMPONENT_SETs.

Plus one hidden `labels` frame (`NODE-0567`). No second component's documentation appears inside the selection, and no Pill material was found outside it within the selection's subtree. **Scope is coherent.**

## 3. Non-Button confirmation

Confirmed. The component is **Pill**. The string `Button` appears nowhere in the 650-line structural capture of `NODE-0040`. Component set names are `Pill – Highline`, `Pill – Highlighted`, `Pill – Filled`, `Pill – Text`, `Pill – Pulse Animation`. Headline text is `Pills — Anatomy & Usage`.

## 4. Available read-only evidence methods

| Method | Available | What it yielded |
|---|---|---|
| `mcp__Figma__get_metadata` | ✅ | Full descendant structure: node ids, names, kinds, x/y, w/h, `hidden` flag. **Primary structural source.** |
| `mcp__Figma__get_variable_defs` | ✅ | Resolved variable *name → value* pairs, scoped to a node subtree. |
| `mcp__Figma__get_screenshot` | ✅ | Rendered PNG in-context (not persistable to disk by this tool). |
| `mcp__plugin_figma_figma__download_assets` | ✅ | Persistable PNG export → used for the two evidence screenshots. |
| `mcp__Figma__get_design_context` | ⚠️ **not pursued** | Returned a Code Connect setup prompt instead of design context for `NODE-0393`. Acting on it would have required a write-scoped mapping action outside this experiment's authority. Recorded as a limitation, not followed. |
| REST / plugin-API node payload | ❌ | Unavailable. No `type: COMPONENT_SET`, no `componentPropertyDefinitions`, no `variantProperties` field, no `explicitVariableModes`. |
| Variable collection / mode identifiers | ❌ | Not exposed by any available tool. |
| Instance-level `variantProperties` | ❌ | Not exposed. Documented instances resolve only to their component-set name. |

## 5. Can component-set children be structurally enumerated?

**Yes — with one material qualification.**

`get_metadata` lists every child of each COMPONENT_SET as a `symbol` node whose name is Figma's generated variant serialization (`Accent=Success, Size=Regular, Icon=Leading`). All 216 children across all five sets were listed and parsed. Counts are exact Cartesian products in every case (48, 48, 48, 48, 24), which is a strong internal consistency check.

**Qualification (carried into the contract as blocker PB-7):** `variantProperties` were **parsed from node names**, not read from a `variantProperties` API field — no available tool exposes that field. The baseline's evidence level `component_children_enumerated` does not distinguish these two enumeration methods. The enumeration artifacts and `enumerationMethod` string record the distinction explicitly.

Corroborating (but not proving) evidence that these are true COMPONENT_SETs: `evidence/screenshot-NODE-0042-component-sets.png` shows the four visible sets each drawn with Figma's dashed component-set boundary.

---

## 6. Batched list of every missing input and access limitation

All at once, as required:

| # | Missing input / limitation | Consequence | Handling |
|---|---|---|---|
| L-1 | No REST/plugin node payload | Node kinds reported in tool vocabulary (`frame`/`symbol`), not `COMPONENT_SET`/`COMPONENT` | Proceeded; classification recorded as observed-with-qualification |
| L-2 | No `variantProperties` API field | Enumeration is name-parse based | Proceeded; recorded in `enumerationMethod`, PF-17, PB-7 |
| L-3 | No `componentPropertyDefinitions` | BOOLEAN / TEXT / INSTANCE_SWAP properties, `defaultValue`, `preferredValues` unknowable | Marked `not_enumerated`. **Absence is not claimed as evidence of absence.** |
| L-4 | No instance-level `variantProperties` | Documented instances cannot be resolved to axis combinations | `documentedPairingCount` redefined as *placements*; recorded in `coveragePolicy.statement` and PB-8 |
| L-5 | No variable collection name / ID | `themeModel.collectionName` / `collectionId` unobtainable | Stored as literal `"unverified"`; recorded as PB-4 |
| L-6 | No variable mode names / IDs | Mode identity unobtainable | Mode *names* taken from documentation card headline text (`Dark Mode` / `Light Mode`), mode IDs `"unverified"`; PB-4 |
| L-7 | No variable IDs | `containerBindings[].boundVariableId` unobtainable | `"unverified"`; PB-4 |
| L-8 | `get_variable_defs` returned `{}` for hidden set `NODE-0039` | Cannot tell "no bindings" from "not resolved because hidden" | Recorded as `unverified`, **not** as absence |
| L-9 | Animation semantics of `S1`/`S2` not captured | Motion behaviour unknown | Axis values enumerated; behaviour marked `not_enumerated` |
| L-10 | `get_design_context` diverted to Code Connect | One structural cross-check unavailable | Not pursued (would exceed read-only authority); recorded in `knownLimitations` |
| L-11 | No owner access | No owner confirmation obtainable | `ownerConfirmations: []` by design; nothing approved |
| L-12 | Figma file version identity not exposed | `figmaFileVersionIdentity` null in every access-log entry | Recorded as null, not fabricated |
| L-13 | `get_screenshot` cannot persist to disk | In-context renders unciteable as files | Two persistable exports captured instead via `download_assets` |

---

## 7. Readiness decision

**PROCEED.** The selection identifies a coherent, complete, non-Button component scope. Structural enumeration is available for all five component sets. The limitations above are all recordable as `unverified` / `not_enumerated` and none of them prevent re-deriving the component model. No stop condition was met.

Defensible defaults applied where evidence was unavailable:

- Unobservable identifiers → literal `"unverified"`, never a plausible-looking fabricated value.
- Unobservable structure → `not_enumerated`, never inferred from a screenshot.
- Theme mode names → sourced from documentation headline text, with the source stated, rather than guessed from the variable system.
- Nothing promoted to a cross-component invariant; nothing approved.

---

# Addendum — R-2 Live-Evidence Reconciliation (2026-08-16)

The limitation table above describes the **R-1** pass. This addendum records what changed when the Figma **Plugin API** became available via read-only `use_figma` scripts.

## New evidence method

| Method | Available | What it yielded |
|---|---|---|
| `mcp__plugin_figma_figma__use_figma` (read-only scripts) | ✅ **new** | `node.type`, `visible`, component-set `key`, `componentPropertyDefinitions`, `COMPONENT.variantProperties`, `INSTANCE.variantProperties`, `getMainComponentAsync()`, variable collections/modes/IDs, `explicitVariableModes`, `resolvedVariableModes`, `boundVariables`, prototype `reactions` |

Four read-only scripts were executed. No create, edit, rename, move, publish or delete operation was issued.

## Limitation status

| # | R-1 limitation | R-2 status |
|---|---|---|
| L-1 | No REST/plugin node payload | **closed** — all five confirmed `COMPONENT_SET`, children `COMPONENT` |
| L-2 | No `variantProperties` API field | **closed** — read directly for all 216 children; 0 mismatches vs name-parse |
| L-3 | No `componentPropertyDefinitions` | **closed** — 4 non-VARIANT properties and every VARIANT default captured. No BOOLEAN properties exist. |
| L-4 | No instance-level `variantProperties` | **closed** — all 94 documented instances captured |
| L-5 | No variable collection name/ID | **closed** — `colors`, `…TRUNC-0005/NODE-0048`, `remote: true`, 105 variables |
| L-6 | No variable mode names/IDs | **closed** — Dark `NODE-0027` (default), Light `NODE-0028` |
| L-7 | No variable IDs | **closed** — real IDs with `valuesByMode` |
| L-8 | Hidden set returned `{}` from `get_variable_defs` | **closed** — 12 of 24 children carry bindings; the `{}` was a tool artifact |
| L-9 | Animation semantics of S1/S2 | **partially closed** — 24 reactions, triggers and transitions captured; what the two frames *render* is still unverified |
| L-10 | `get_design_context` diverted to Code Connect | unchanged — not pursued; would exceed read-only authority |
| L-11 | No owner access | unchanged — `ownerConfirmations` empty by design |
| L-12 | Figma file version identity not exposed | unchanged — recorded as `null`, not fabricated |
| L-13 | `get_screenshot` cannot persist to disk | unchanged — `download_assets` used instead |
| **L-14** | **New.** `getLocalVariableCollectionsAsync()` returns only `icon_config`. The `colors` and `layout-scale` collections are **remote** and had to be resolved by ID. A tool enumerating local collections alone would conclude this file has no theme system. | new, recorded |
| **L-15** | **New.** The owner-supplied screenshot `/Users/apple/Desktop/component_box_pills.png` **could not be read** — the sandbox denies Desktop access (`EPERM`). The file exists (643,586 bytes). Live renders captured directly from Figma were used instead, which are stronger evidence for structural questions but do **not** substitute for whatever the owner intended to highlight. | **needs owner action** |

## Residual limitations

- Geometry (child pixel heights) still comes from the `get_metadata` capture, not the Plugin API.
- Variable bindings were sampled on one representative instance per theme card plus its Label child, not exhaustively across all 94 instances.
- The remote `colors` collection's 105 variables were not exhaustively enumerated — only the four bound on sampled nodes.
- Only the 24 top-level COMPONENT children of the hidden set were swept for reactions and bindings; descendants were not.
- TEXT / INSTANCE_SWAP **overrides** on the 94 documented instances were not captured, only their `variantProperties`.

## Readiness decision

**PROCEED — unchanged.** Every R-1 defensible default that has since been contradicted by API evidence was corrected in place and recorded in the factual-correction table. Nothing that was marked `unverified` in R-1 and is now observable was left stale.
