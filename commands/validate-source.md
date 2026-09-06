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
