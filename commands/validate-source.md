---
description: Validate the curated design-system JSON without rebuilding the index. Maintenance — never enters a run.
argument-hint: (no arguments)
operation-id: source.validate
allowed-tools: Bash, Read
---

# `/validate-source` — maintenance operation `source.validate`

**Binding.** An alias of the maintenance operation `source.validate` (MB-1,
`docs/builder-master-decision-log.md`), filling the "provisional" public name §2.7 leaves blank.

| Field | Value |
|---|---|
| Operation ID | `source.validate` |
| Kind | **maintenance** |
| `RunType` | **none** (§2.11) |

**This never becomes a run**, for the same reason as `/refresh-source`: `beginRun` refuses the
operation ID at **G-2**, and `runMaintenance` is the tool that executes it, outside the phase model.

Unlike `/refresh-source` it writes nothing to the index and therefore invalidates nothing — it reports
whether the curated source is structurally valid, and that is all.

## How to run it

One call, no run, no phase:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/runtimes/claude-code/cli.ts" run-maintenance --operation-id source.validate
```

It returns `{ ok, outcome, invalidated_run_ids }`. Report the outcome, and nothing else.

**`invalidated_run_ids` is always empty here, and you must not report it as though it might not be.**
This operation writes nothing, so it invalidates nothing — the engine returns `[]` unconditionally
for `source.validate`. Telling a designer "the design-system data changed" after an operation that
changed no data is a false statement about their design system. That sentence belongs to
`/refresh-source`, which can actually produce one.
