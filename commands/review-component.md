---
description: Alias of /audit-component. Resolves to the same operation; capability-gated today.
argument-hint: <the component to review>
operation-id: component.audit
allowed-tools: Bash, Read
---

# `/review-component` — alias of operation `component.audit`

**This is an alias, not a route.** It resolves through the registry to `component.audit`, the same
`OperationRow` `/audit-component` resolves to, so the run configuration is identical by construction —
there is no separate code path for an alias to diverge through. **G-18** refuses an alias producing a
run configuration differing from its canonical name in anything but `invoked_as` (§2.7.0).

There is no `component.review` operation and `RUN_TYPES` stays closed at three (§2.7.0, §2.7.1).
Whether this alias should ever be promoted to its own route is §18.5's open question, gated on
measuring whether review and audit ever produce different output shapes — it is **not** decided here.

**Everything else — the capability gate, the G-3a refusal, the `target` requirement — is
`/audit-component`'s, unchanged.** Read that file; this one adds a name and nothing more.
