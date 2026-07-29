# Interaction-State Taxonomy

**Status: PROJECT CONVENTION — NOT A DOMAIN STANDARD.**
**Gating: advisory / non-gating.** · **Decision:** D-D · **Amendment:** `SA-23` · **Date:** 2026-07-29
**Applicability table status:** `draft — awaiting design confirmation`

---

## 0. Why this file exists, and what it must never claim

The pipeline previously promised to check components against "the 8-state coverage discipline, per project
framework Section 16." That section does not exist. The states were never enumerated anywhere in the
project, and **the count was also wrong** — the agreed set is eleven, not eight. A check whose reference
cannot be produced is not a check.

**No external standard supplies this list.** WCAG 2.2 AA covers focus *visibility* (2.4.7, 2.4.11, 2.4.13)
and pointer *target size* (2.5.8), but enumerates no interaction-state set. Material and the WAI-ARIA
Authoring Practices describe states as guidance, not as a conformance bar. So this is an AdalFi house rule
or it is nothing — and it must never be described as a domain standard, in any spec, prompt, or report.

**Advisory means advisory.** Coverage findings are always surfaced. They appear in Synthesizer findings and
on the Reviewer rubric. **They can never, on their own, fail a run.** Promotion to gating requires a later
recorded decision supported by *both* a published anchor set *and* pilot evidence showing how often the
check would have fired — not a re-reading of this document.

---

## 1. Baseline interaction states

Applicable to any interactive component. Five states.

| State | Definition | Notes |
|---|---|---|
| `default` | Resting, interactive, no user attention. | Always required for an interactive component. |
| `hover` | Pointer over the target, not activated. | Pointer-only. Absence on a touch-primary component is legitimately `not-applicable`. |
| `focus-visible` | Keyboard or programmatic focus with a visible indicator. | Named `focus-visible`, not `focus`, deliberately — the accessibility obligation is the *visible* indicator. Closest to an external requirement (WCAG 2.4.7 / 2.4.11), and the one most often missing. |
| `pressed` | Active during activation — pointer down, key down, or touch. | Called `pressed`, not `active`, to avoid collision with `selected` and with CSS `:active` semantics. |
| `disabled` | Present, non-interactive, not focusable-as-actionable. | Must remain perceivable; contrast expectations differ from `default`. |

## 2. Conditional interaction states

Applicable only when the component's semantics call for them. Six states. A component is never penalised
for omitting a state its semantics exclude — but the omission must be **declared**, not silent (§4).

| State | Applies when | Notes |
|---|---|---|
| `selected` | The component participates in a selection set. | Tabs, list rows, chips, segmented controls. Distinct from `pressed` (transient) and `checked` (binary). |
| `checked` | The component has a binary or tri-state checked value. | Checkbox, radio, switch. Include `indeterminate` where the control supports it. |
| `expanded` | The component discloses or collapses content. | Accordion, disclosure, combobox, menu trigger. Pairs with an ARIA expanded relationship. |
| `read-only` | The value is displayed and focusable but not editable. | **Not** `disabled`: read-only remains focusable and readable by assistive technology. Conflating the two is a common and consequential error. |
| `invalid` | The component carries a validation failure. | The *control's* state. The accompanying message is content, not a state. |
| `busy/loading` | The component is awaiting an outcome of its own action. | A button spinner, a field validating remotely. **Scope is the component.** Page- or region-level loading is a scenario state (§5). |

## 3. Applicability by component class

**`draft — awaiting design confirmation.`** Drafted from the eleven states above and the component classes
implied by the AdalFi library. Because coverage is advisory, a draft table cannot cause a wrong pass or
fail — it can only mislabel a finding, which a reviewer can correct.

Legend: **R** required · **O** optional · **N/A** not applicable by semantics.

| Component class | default | hover | focus-visible | pressed | disabled | selected | checked | expanded | read-only | invalid | busy/loading |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Button | R | R | R | R | R | N/A | N/A | O | N/A | N/A | O |
| Icon button | R | R | R | R | R | O | O | O | N/A | N/A | O |
| Link | R | R | R | R | O | N/A | N/A | N/A | N/A | N/A | N/A |
| Text input / textarea | R | O | R | N/A | R | N/A | N/A | N/A | O | R | O |
| Select / combobox | R | R | R | N/A | R | O | N/A | R | O | R | O |
| Checkbox | R | R | R | R | R | N/A | R | N/A | O | O | N/A |
| Radio | R | R | R | R | R | R | R | N/A | O | O | N/A |
| Switch / toggle | R | R | R | R | R | N/A | R | N/A | N/A | N/A | O |
| Tab | R | R | R | R | O | R | N/A | N/A | N/A | N/A | N/A |
| List / menu item | R | R | R | R | O | O | O | O | N/A | N/A | N/A |
| Accordion / disclosure | R | R | R | R | O | N/A | N/A | R | N/A | N/A | N/A |
| Chip / tag | R | O | O | O | O | O | N/A | N/A | N/A | N/A | N/A |
| Slider | R | R | R | R | R | N/A | N/A | N/A | O | O | N/A |
| Card (interactive) | R | R | R | R | O | O | N/A | O | N/A | N/A | O |
| Tooltip | R | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| Toast / banner | R | O | O | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| Badge (non-interactive) | R | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

Non-interactive display components — badge, static text, divider, plain container — carry `default` only.
A coverage finding against a non-interactive component is a **false positive** and should be reported as a
taxonomy defect, not as a component defect.

## 4. Permitted `not applicable` rationales

**Closed list.** `not-applicable` is a claim with a reason, never a silent skip. A rationale outside this
list is itself a finding.

| Code | Meaning |
|---|---|
| `non-interactive` | The component has no interactive affordance. |
| `no-pointer-affordance` | Touch- or keyboard-primary; a pointer-only state does not arise. |
| `semantics-exclude` | The component's role excludes the state (`checked` on a Button). |
| `state-owned-by-parent` | A container or controller owns the state (a row inside a selectable list). |
| `platform-provided` | The platform renders it and the design system does not override it. |
| `superseded-by-variant` | Expressed as a separate documented variant rather than a state. |
| `scenario-not-interaction` | It is a scenario/resilience state (§5), tracked on the other axis. |

## 5. Interaction variants vs scenario / resilience states — two axes, never one

This distinction is the reason a coverage count can mean anything at all.

**Interaction states** (this document) describe *how the user is engaging this component right now*. They
belong on a component's `state` variant axis and are what coverage counts.

**Scenario / resilience states** describe *what the surrounding data or system is doing*. They are not
interaction states, they do not belong on the same axis, and they are **out of scope for this taxonomy**:

`empty` · `error` (region or page level) · `offline` · `partial-data` · `long-content` · `truncated` ·
`first-run` · `permission-denied` · `stale-data`

Mixing the axes is not hypothetical — `synthesizer_agent_spec.md`'s own stand-in list did exactly that,
combining default/hover/focus/pressed/disabled with `loading`, `error`, and `empty`. Under that mix a
Button "covering 8 states" and a Table "covering 8 states" are not comparable claims, so the count conveys
nothing. Two axes keep both measurable.

**The one deliberate overlap.** `busy/loading` is a conditional *interaction* state when the component
awaits the outcome of **its own** action (a button spinner after submit). Region- or page-level loading is
a scenario state. The test is ownership: if the component initiated it, it is interaction.

## 6. Expected evidence

Coverage is only assessable if the artifacts say something checkable.

| Artifact | Expected evidence |
|---|---|
| `SemanticBrief` (`new`) | A variant/property model carrying a `state` axis with its options, plus per-state property and style resolutions. The bar is expressibility: `state: [default, hover, pressed, disabled]` with resolutions attached to each. |
| `SemanticDelta` (`modify`) | `change_type: "state"` on the delta, the option-set transition (`[default, hover, pressed] → [+disabled]`), and `change_status` per delta item. This is why the variant/property model must survive into the Phase 1 contracts — see `SA-25`. |
| Figma variant properties | A `state` variant property whose options match the brief. Interaction states are variant options, not separate components. |
| `AuditBrief` / `ExtractionCoverage` (`audit`) | Which states were observed, which were absent, and which regions were excluded from extraction. An unrecorded exclusion makes coverage unfalsifiable (`SA-8`). |
| Findings | A `Disclosure` of kind `interaction_state_gap` — **non-blocking by construction**, so it cannot set `blocked` or fail a run. |

## 7. Open items

1. **§3 needs design confirmation** — component classes and R/O/N-A assignments are drafted, not agreed.
2. **No pilot evidence yet** on how often coverage findings would fire. Required before any gating
   discussion, together with a published anchor set.
3. **Anchor set not written** — deliberately. Anchors are only needed for gating, and writing them now
   would imply a decision that has not been taken.
