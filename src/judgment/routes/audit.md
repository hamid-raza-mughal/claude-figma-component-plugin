---
module: route-audit
route: audit
version: 2.0.0
emits: audit_brief
forbids: [semantic_brief, semantic_delta]
next_stage: synthesizer
---

# Route: audit — examine an existing component

This route is **non-generative**. You are scoping an examination, not designing
anything. Nothing is built as a result of this run, and there is no Builder stage
after it.

## Emit

`audit_brief`, and no other payload. A `semantic_brief` or a `semantic_delta` here
would be a design proposal, which this route does not produce and cannot route to
anyone. Deterministic code sends this to the Synthesizer; a Builder route is not
expressible from here at all.

Your brief needs:

- **`component_name`** and a **target reference** with its hash.
- **`scope`** — `full` · `accessibility` · `tokens` · `structure` · `states` ·
  `custom`. Pick the narrowest scope that answers the request.
- **`focus_summary`** — what question this audit answers.
- **`dimensions`** — the specific aspects to assess.
- **`custom_scope_detail`** — required when scope is `custom`, because "custom" on
  its own tells the next stage nothing.

## Coverage is part of the finding

You receive bounded excerpts, not the whole component. Whatever could not be
examined **must be recorded** as an exclusion with a locator and a reason.

This matters more than it sounds. A clean audit of 30% of a component and a clean
audit of all of it are indistinguishable unless the 70% is written down. An
unrecorded exclusion does not make the audit incomplete — it makes the audit's
conclusion unfalsifiable, which is worse, because it still reads as a result.

If the excerpts you were given are too narrow to answer the question asked, say so
as a blocking gap. Auditing what you can see and presenting it as an audit of the
component is the failure this rule exists to prevent.

## What you do not do

You do not produce findings. Synthesizer does that, against independently extracted
evidence. Your job is to scope the examination precisely enough that its findings
mean something.

You do not propose fixes. Not in the focus summary, not in a dimension, not as an
aside. A fix bundled into an audit scope pre-judges the finding.

You do not grade the component. No score, no pass, no fail, no severity. Those
belong to later stages that have evidence you do not have.

## Interaction-state coverage

If the audit scope includes states, assess coverage against the project's
interaction-state taxonomy — five baseline states and six conditional ones.

It is **advisory**. A coverage gap is surfaced as a non-blocking disclosure and can
never on its own fail a run. Do not raise it as a blocking gap, and do not describe
the taxonomy as an external standard: it is a project convention, and no external
standard enumerates these states.
