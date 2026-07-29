# Coordinator Interface Ripple Record

**Purpose.** P1-FINAL §7.3 freezes downstream agent internals. When Phase 1 changes a future contract, the
required change is recorded here — **never implemented** — with status `approved-not-implemented`.

**Why this file matters more than it looks.** The project has already been burned once by three artifacts
carrying three representations of the same fact. This is the single place a downstream change is allowed to
live before it has code, so that "we decided that" and "we built that" cannot be confused.

Required fields per entry: affected artifact/role · old assumption · required future contract · reason ·
architecture source · implementation phase · status.

---

## R-1 · Reviewer scoring model — remove the scalar score

| Field | Value |
|---|---|
| **Affected** | `Specs/reviewer_agent_spec.md` — Dials 6 and 7, plus §4 header, `ReviewPackage.score`, and the decision table |
| **Old assumption** | A deterministic weighted 0–100 score with dimension weights 40/30/20/10 (`new`/`modify`) and 40/30/30 (`audit`), and a fixed 80/100 pass threshold. |
| **Required future contract** | Deterministic **pass/fail** for reference fidelity, structural conformance, accessibility AA and audit evidence integrity. **Anchored 1–5 rubrics** with written anchors for the subjective dimensions. Any deterministic fail or any `blocking` finding overrides every rubric line. Acceptance requires all deterministic dimensions pass, no blocking finding, and **≥3 on every rubric line**. **No scalar score is emitted** — `ReviewPackage.score: number` is removed, not renamed. |
| **Reason** | The weighted sum's determinism was illusory: it ran on LLM-assigned severities, and the spec contains **no severity-to-points formula at all**, so the number was never reproducible. Closed as **DR-1**. |
| **Architecture source** | `manage-ds-components-runtime-diagrams_v3.md` §DR-1 · register `SA-6`, `SA-24` |
| **Implementation phase** | Reviewer implementation (post-Phase-2) |
| **Status** | `approved-not-implemented` |
| **Phase 1 mitigation** | A policy-superseded banner at the top of the spec, so the obsolete model cannot be built by someone reading it cold. The internals are untouched. |

## R-2 · Reviewer rubric — interaction-state coverage is non-gating

| Field | Value |
|---|---|
| **Affected** | `Specs/reviewer_agent_spec.md` Dial 7 rubric; `Specs/synthesizer_agent_spec.md` Dial 7 guardrail #4 |
| **Old assumption** | "State coverage" is a weighted rubric dimension worth 20 points, capped at `medium` confidence while an eight-state reference remained unverified. |
| **Required future contract** | Interaction-state coverage is **advisory and non-gating**: always surfaced, never able on its own to fail a run, and never able to pull a rubric line below the acceptance floor. Findings travel as a `Disclosure` of kind `interaction_state_gap`, which **structurally cannot** set `blocked`. The reference is `docs/interaction-state-taxonomy.md` — a project convention, explicitly not a domain standard. |
| **Reason** | The cited "project framework Section 16" does not exist, the states were never enumerated, and the count was wrong — the agreed set is 5 baseline + 6 conditional = **eleven**. A gate whose trigger cannot occur is worse than a decision. The `medium` ceiling was a proxy for the same problem. |
| **Architecture source** | Decision **D-D** · `SA-23` · P1-FINAL §5.2 (condition struck 2026-07-29) |
| **Implementation phase** | Reviewer / Synthesizer implementation |
| **Status** | `approved-not-implemented` |
| **Promotion path** | Gating requires a later recorded decision supported by a published anchor set **and** pilot evidence. Not reachable by re-reading the policy. |

## R-3 · Synthesizer — interaction vs scenario states are two axes

| Field | Value |
|---|---|
| **Affected** | `Specs/synthesizer_agent_spec.md` header flag, Dial 4 tool 4, Dial 7 guardrail #4 |
| **Old assumption** | A single eight-item list: default, hover, focus, active/pressed, disabled, **loading, error, empty**. |
| **Required future contract** | Two axes. **Interaction states** (11, per the taxonomy) describe how the user is engaging the component and live on its `state` variant axis. **Scenario / resilience states** — `empty`, `error`, `offline`, `partial-data`, `long-content`, `truncated`, `first-run`, `permission-denied`, `stale-data` — are tracked separately and are out of scope for coverage counting. One deliberate overlap: `busy/loading` is an interaction state when the component awaits **its own** action; region-level loading is a scenario state. |
| **Reason** | The stand-in list mixed the axes, which makes the count meaningless — under it, a Button "covering 8 states" and a Table "covering 8 states" are not comparable claims. Found while closing D-D, in the spec's own text. |
| **Architecture source** | Decision **D-D** · `docs/interaction-state-taxonomy.md` §5 |
| **Implementation phase** | Synthesizer implementation |
| **Status** | `approved-not-implemented` |

## R-4 · Builder — `nodeMap` replaces `createdNodeIds`

| Field | Value |
|---|---|
| **Affected** | `Specs/builder_agent_spec.md` Dial 7 |
| **Old assumption** | `createdNodeIds: string[]` |
| **Required future contract** | `nodeMap: Record<semantic_id, nodeId>`, plus the structural-conformance rules of `SA-27`: every approved semantic element maps to a built node; every created node appears in `BuilderResult` or `ImplementationManifest`; implementation-supporting frames and wrappers are permitted **when declared and justified**; undeclared or unrelated nodes fail validation. **No one-to-one semantic-element/node requirement.** |
| **Reason** | Nothing can bridge approved semantic intent to built structure without the mapping, so post-build validation and every finding locator are unimplementable. Depends on **FD-1** (stable node ids), which is contract-bearing. |
| **Architecture source** | Register `SA-3`, `SA-27` · P1-FINAL §5.5 |
| **Implementation phase** | Builder implementation |
| **Status** | `approved-not-implemented` |

## R-5 · Variant/property model must survive into the Phase 1 contracts

| Field | Value |
|---|---|
| **Affected** | `SemanticBrief`, `SemanticDelta` — **implemented in Phase 1 WP3**, recorded here because it constrains Builder and Synthesizer |
| **Old assumption** | P1-FINAL §14.2 describes `new` ready output as "semantic brief and materialized resolutions", leaving the variant/property model unstated. |
| **Required future contract** | `SemanticBrief` carries a variant/property model able to express a `state` axis with options and per-state resolutions. `SemanticDelta` carries `change_type: "state"`, the option-set transition, and `change_status` per item. Per corrected **SA-13**: `change_status` exists **only** on `SemanticDelta` items and `mode` **only** on mode-bearing records — neither is global on `SemanticBrief`. |
| **Reason** | Without it the spec's own worked `modify` example (`state: [default, hover, pressed] → [+disabled]`) is inexpressible and the `modify` route regresses against v1. It is also where interaction-state coverage evidence lives. |
| **Architecture source** | Decision **D-D** consequence 3 · corrected `SA-13` · `SA-25`(evidence) |
| **Implementation phase** | **Phase 1 WP3** — the only entry here that is not deferred |
| **Status** | `approved-in-phase-1` |

## R-6 · Figma access permissions are fixed, not negotiable per agent

| Field | Value |
|---|---|
| **Affected** | All four agent specs; future Controller and adapters |
| **Old assumption** | Coordinator holds read-only Figma tools directly (`coordinator_agent_spec.md` Dial 4 tools 2 and 3). |
| **Required future contract** | Coordinator and Synthesizer have **no direct Figma connector access**. Coordinator receives a complete-tree reference plus bounded, provenance-linked excerpts prepared by deterministic code. Synthesizer receives independently extracted evidence and may request only bounded verification **through the Controller**. **Builder is the only writer, and only to a sandbox target.** |
| **Reason** | Direct agent access makes the data boundary unenforceable and audit coverage unfalsifiable. Phase 1 may define read-plane ports and fixtures but must not implement or grant live access. |
| **Architecture source** | P1-FINAL §5.4 · `SA-26` · v3 §9.2 |
| **Implementation phase** | Controller + adapters (Phase 2+) |
| **Status** | `approved-not-implemented` |

## R-7 · Accessibility claim language

| Field | Value |
|---|---|
| **Affected** | `Specs/reviewer_agent_spec.md`, `Specs/synthesizer_agent_spec.md`, future rubric implementation |
| **Old assumption** | "WCAG 2.1 AA" as an outcome of automated checks. |
| **Required future contract** | The phrase is **"machine-verifiable WCAG 2.2 AA subset."** Automated checks never establish full WCAG conformance. Target-size checks must honour WCAG 2.2 criterion exceptions. |
| **Reason** | Automated tooling cannot establish conformance, and claiming it converts a partial check into a false assurance. Reconciled in `runtime-diagrams_v3.md` (L378 and the deterministic-dimensions table) during WP0c; the specs still carry the old phrase inside frozen sections. |
| **Architecture source** | P1-FINAL §5.3 · `SA-25` |
| **Implementation phase** | Reviewer implementation |
| **Status** | `approved-not-implemented` |

---

## Register

| ID | Affected role | Status | Phase |
|---|---|---|---|
| R-1 | Reviewer | `approved-not-implemented` | post-Phase-2 |
| R-2 | Reviewer · Synthesizer | `approved-not-implemented` | post-Phase-2 |
| R-3 | Synthesizer | `approved-not-implemented` | post-Phase-2 |
| R-4 | Builder | `approved-not-implemented` | post-Phase-2 |
| R-5 | Coordinator contracts | `approved-in-phase-1` | **WP3** |
| R-6 | All agents · Controller | `approved-not-implemented` | Phase 2+ |
| R-7 | Reviewer · Synthesizer | `approved-not-implemented` | post-Phase-2 |

**Nothing in this file has been implemented in a downstream agent spec.** Where a frozen spec would
otherwise mislead an implementer, Phase 1 added a banner at the top of that spec and changed nothing below
it — see `SA-24` and `SA-23` in register v3 §G.
