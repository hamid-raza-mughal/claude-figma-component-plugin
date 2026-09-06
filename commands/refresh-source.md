---
description: Rebuild the derived index from the curated design-system JSON. Maintenance — never enters a run.
argument-hint: (no arguments)
operation-id: source.refresh
allowed-tools: Bash, Read
---

# `/refresh-source` — maintenance operation `source.refresh`

**Binding.** An alias of the maintenance operation `source.refresh` (MB-1,
`docs/builder-master-decision-log.md`). §2.7's public-name column for this row reads "provisional";
this alias fills it without adding an operation ID or a `RunType`.

| Field | Value |
|---|---|
| Operation ID | `source.refresh` |
| Kind | **maintenance** |
| `RunType` | **none** — maintenance operations carry none (§2.11) |

**This never becomes a run.** A maintenance operation executes only its own bounded, deterministic
workflow: no authoring run, no stage phase, no gate, no repair budget (§2.11). It gets its own record
(§11.5). `beginRun` refuses this operation ID at **G-2**, because it has no canonical route mapping —
that refusal is §2.11 enforced, not a defect. The tool that runs it is `runMaintenance`, which sits
deliberately outside the phase model.

**What a refresh can invalidate, and why it never re-pins.** A refresh that changes `source_sha256`
appends a `source-invalidated` event to **every non-terminal run pinned to the old hash**, in the same
transaction as its own maintenance record (§2.11.1). Those runs can then only be closed `blocked` or
cancelled (**G-21**); nothing is silently re-pinned and no recorded approval is ever reused against
new source data. Report the invalidated runs to the designer in §16.2's form — *the design-system
data changed, so this proposal must be regenerated* — and never in terms of hashes or event kinds.

## How to run it

One call, no run, no phase:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/runtimes/claude-code/cli.ts" run-maintenance --operation-id source.refresh
```

It returns `{ ok, outcome, invalidated_run_ids }`. Report the outcome, and report every id in
`invalidated_run_ids` in §16.2's designer-facing form — *the design-system data changed, so that
proposal must be regenerated* — never as a hash or an event kind.
