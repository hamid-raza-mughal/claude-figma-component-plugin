---
description: Audit an existing design-system component against the curated source. Capability-gated — unavailable until the Figma read plane exists.
argument-hint: <the component to audit>
operation-id: component.audit
allowed-tools: Bash, Read
---

# `/audit-component` — operation `component.audit`

**Binding.** Bound to the stable operation ID `component.audit`, never to the string
`/audit-component` (§2.7, §2.8). `/review-component` is an **alias** of this same operation, not a
fourth route — there is no `component.review` operation (§2.7.0).

| Field | Value |
|---|---|
| Operation ID | `component.audit` |
| Kind | route |
| `RunType` (derived, never supplied) | `audit` |
| Capability gate | **G-3a — refused today** |
| `target` | required by §2.4, and unreachable while the gate holds |

**This command is registered and refuses**, for the same reason and with the same named code as
`/modify-component`: `beginRun` refuses at **G-3a** naming FD-1…FD-4. Surface the refusal per §16.3
and stop.

**Not the Reviewer.** `audit` and the `reviewer` `StageName` share a word and nothing else (§2.7.0.1).
An `audit` run can never reach Builder: `AuditReadyOutput.next_route` is the literal `'synthesizer'`
and the composer writes the literal rather than reading the draft (§2.10.2).
