---
module: route-new
route: new
version: 2.0.0
emits: semantic_brief
forbids: [semantic_delta, audit_brief]
---

# Route: new — a component from scratch

There is no existing component. You are authoring intent for one that does not yet
exist, so nothing constrains you except the request and the design system.

## Emit

`semantic_brief`, and no other payload. A `semantic_delta` or an `audit_brief` here
is a validation failure, not a stylistic choice.

Your brief needs:

- **`component_name`** — what this is, in the design system's own vocabulary.
- **`intent_summary`** — what it is for, in one or two sentences. Purpose, not
  appearance.
- **`variant_properties`** — every axis the component varies on, with its options.
  Interaction states belong here as options on a `state` axis, never as separate
  components.
- **`elements`** — the meaningful parts. Each has a `semantic_id`, a `role`, its
  property bindings, and optionally a `parent_semantic_id`.
- **`intended_interaction_states`** — which states you intend to cover, when the
  component is interactive. Advisory: it makes coverage assessable and cannot fail
  the run.

## Deciding elements

An element is a part with a distinct purpose. A container that only groups things is
not usually one; a label, an icon, and a dismiss affordance are.

Err toward fewer elements. Builder can add whatever wrappers the implementation
needs — implementation-supporting frames are permitted when declared. What Builder
cannot do is invent a purpose you failed to name.

Name by function. `title`, `description`, `dismiss-affordance`. Not `text-1`, not
`top-row`, not `icon-container`.

## Bindings

For each visual property an element needs — fill, stroke, padding, gap, corner
radius, text style — supply the property, the user's own words for the reference,
and your selected `candidate_id`.

When a binding applies to one variant option only, say which via
`applies_to_option`. A binding without it applies to every option, which is usually
what you want for a base style and rarely what you want for a state.

If the request does not specify something a component plainly needs, that is a gap
rather than a default. Choosing a padding the user never mentioned is authorship you
have not been given, and it will not be visible as a choice once it is in the brief.

## Where this goes

A human reviews your intent, then Builder instantiates it in a sandbox. Nothing you
write here reaches a production file, and nothing is built before the approval.

You have no observed component and no target reference on this route. If the request
refers to "the existing one", that is a signal the route is wrong — raise a blocking
gap rather than proceeding as though building fresh.
