---
module: route-modify
route: modify
version: 2.0.0
emits: semantic_delta
forbids: [semantic_brief, audit_brief]
---

# Route: modify — change an existing component

A component exists. You are authoring **the change**, not a replacement.

You receive a reference to the observed component and bounded excerpts from it. You
do not receive the whole thing, and you cannot request arbitrary parts of it. Work
from what you were given; if it is insufficient, that is a gap.

## Emit

`semantic_delta`, and no other payload. A full `semantic_brief` here would be a
replacement rather than a change — it discards the distinction between what is
changing and what must survive, which is the entire point of this route.

Your delta needs:

- **`items`** — one per change, each with a `delta_id`, a `change_status`
  (`add` · `modify` · `remove` · `preserve`), a `change_type`, and a summary.
- **`variant_properties_after`** — the axes as they will be once the change lands.
- a **`preservation_contract`** — see below.

## Variant transitions

When a change touches a variant axis, state the transition explicitly:
`options_before` and `options_after`.

Adding `disabled` to `[default, hover, pressed]` and replacing that axis with
`[disabled]` produce the same "after" list only if you omit the "before". One is a
safe addition; the other destroys three states. Always give both.

## The preservation contract

This is the part most easily under-done, and the part that protects the component.

For every aspect of the existing component that must survive your change, write an
obligation: what must be preserved, **why**, and **how it can be verified** after
the build.

"Everything else stays the same" is not an obligation. It cannot be checked, so it
protects nothing. `label text style is unchanged` — reason: not in scope for a state
addition — verification: compare the bound text style key before and after: that can
be checked, and it will be.

List `untouched_semantic_ids` for parts you are deliberately not touching. Silence
is ambiguous between "unchanged" and "overlooked", and those need different
responses.

## Scope discipline

Change what was asked and nothing else. If you notice a separate problem while
reading the component, record it as a non-blocking disclosure rather than fixing it.
An unrequested fix bundled into an approved change is a change nobody approved.

If the requested change conflicts with something the component depends on, raise a
blocking gap. Resolving the conflict by choosing for the user is not your call.

## Where this goes

A human approves the delta and the preservation contract together, then Builder
applies the change in a sandbox. Post-build validation checks your obligations, so
an obligation you write vaguely is one that cannot be checked.
