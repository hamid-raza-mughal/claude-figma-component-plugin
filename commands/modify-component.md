---
description: Modify an existing design-system component. Capability-gated — unavailable until the Figma read plane exists.
argument-hint: <the component to modify and what should change>
operation-id: component.modify
allowed-tools: Bash, Read
---

# `/modify-component` — operation `component.modify`

**Binding.** Bound to the stable operation ID `component.modify`, never to the string
`/modify-component` (§2.7, §2.8).

| Field | Value |
|---|---|
| Operation ID | `component.modify` |
| Kind | route |
| `RunType` (derived, never supplied) | `modify` |
| Capability gate | **G-3a — refused today** |
| `target` | required by §2.4, and unreachable while the gate holds |

**This command is registered and refuses.** It is registered so that typing it produces a *named*
refusal rather than an unknown-command error or an obscure failure deeper in the run. `beginRun`
refuses it at **G-3a**, naming the unmet dependency: FD-1…FD-4, the Figma read-plane connector, which
nothing in this repository implements (`src/contracts/observed-tree.ts` — "interfaces and synthetic
fixtures only… no token, no credential, no write method exists").

The refusal is the correct behaviour and must not be worked around. Surface it to the designer in the
form §16.3 requires — what happened and what to do next — and stop. `/create-component` is not gated
by this dependency.
