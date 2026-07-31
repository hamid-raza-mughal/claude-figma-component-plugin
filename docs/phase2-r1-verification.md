# R-1 (Claude Code) HD-2 verification run

**Date:** 2026-07-31. **Tool:** `tools/verify-r1-hd2.ts`. **Configuration verified:**
Claude Code — local process execution, filesystem write, deterministic tool calls (§1.6.1) —
against a writable local directory and the real curated-source bundle (sha256
`2222a2b8eff4224f76ddad591cf6f46c6e8bb25ec7f96aebbf13941876356627`).

**What this is.** §1.6.6: *"Until a run writes state, is interrupted, and resumes from that
state on a given configuration, HD-2 is assumed on it... Fill the cell with the run, not
with the argument."* This is that run, for R-1. It is **not** the R-2 (Desktop/Cowork)
run, which stays `verification pending` — nothing here says anything about that
configuration.

**Not claimed by this document:** Builder activation, any consequential Figma operation,
verified human authorization (HD-1 remains unmet — every approval below is model-relayed
and unverified), or R-2/pilot readiness. This is HD-2 evidence only.

## Command

```
ADALFI_ARTIFACT_DIR="<bundle>" node tools/verify-r1-hd2.ts <approved-data-dir>
```

## Raw output

```
R-1 HD-2 verification run — §1.6.6
started_at: 2026-07-31T15:52:12.242Z
approved_data_directory: <scratchpad>/phase2-r1-verification/run-store

--- step 1: write (fresh process) ---
beginRun -> run_id=9c9c3894-2a4b-4959-bb40-e68d48bd9168 display_id=new-KJE3H51A phase=received
prepareContext -> phase=drafting, 5 candidate categories
(engineA reference now dropped — no explicit close() — simulating a process that stops)

--- step 2: interruption + resume (fresh engine instance, same config) ---
resumeRun (fresh engine) -> phase=drafting, pending_action="awaiting a submitted draft"

--- step 3: continue the resumed run to completion ---
submitDraft -> outcome=accepted
presentForApproval -> artifact_sha256=0df253f21efec77a…
recordApproval -> outcome=advance
buildHandoff -> next_route=builder
closeRun -> outcome=completed
final resumeRun -> phase=terminal, pending_action="terminal: completed"

finished_at: 2026-07-31T15:52:12.388Z
RESULT: PASS
```

## What "interruption" means here, precisely

`engineA` (one `CoordinatorEngine` instance, one `RunStore`, one open `IndexReader`) wrote
events at `seq` 1–3 and was then discarded — no reference retained, no `close()` called,
matching a process that stops without a clean shutdown. `engineB` is a **second, independent**
`CoordinatorEngine` constructed fresh against the same `Phase1Config`, which opens its own
new `RunStore`/`DatabaseSync` handle against the same file. `engineB.resumeRun` folded the
event log written by `engineA` and correctly reported `drafting` — proving the run's state
lived in the file, not in `engineA`'s memory. `engineB` then carried the same run through to
`completed`.

## The actual event log, read back from the store file after the run

| seq | at | kind | from_phase | to_phase |
|---|---|---|---|---|
| 1 | 2026-07-31T15:52:12.287Z | `run-begun` | — | `received` |
| 2 | 2026-07-31T15:52:12.306Z | `context-preparation-started` | `received` | `preparing` |
| 3 | 2026-07-31T15:52:12.306Z | `context-preparation-succeeded` | `preparing` | `drafting` |
| 4 | 2026-07-31T15:52:12.383Z | `draft-submitted` | `drafting` | `validating` |
| 5 | 2026-07-31T15:52:12.385Z | `approval-presented` | `validating` | `awaiting-approval` |
| 6 | 2026-07-31T15:52:12.386Z | `approval-recorded-approved` | `awaiting-approval` | `handoff-ready` |
| 7 | 2026-07-31T15:52:12.387Z | `handoff-built` | — (marker) | — (marker) |
| 8 | 2026-07-31T15:52:12.388Z | `run-completed` | `handoff-ready` | `terminal` |

Events 1–3 were written by `engineA`; events 4–8 were written by `engineB`, after the
interruption, against the state `engineB` read back from the file — not from anything
carried over in memory.

## The store-identity.json witness (§11.0.7), written at initialization

```json
{
  "store_uuid": "9e90714e-3fc7-4e79-9953-e213dd668c20",
  "created_at": "2026-07-31T15:52:12.243Z",
  "store_schema_version": "1.0.0"
}
```

## Disposition

Per §1.6.4 rule 2, this is recorded per verified configuration, not as a bare product name:

> **Claude Code (R-1)** — local process execution, filesystem write, deterministic tool
> calls, against a writable local directory — **HD-2: verified 2026-07-31**, evidence
> above. **HD-1 and HD-3 remain unmet on this configuration** — no claim of verified
> human authorization or authoritative command metadata is made by this run, and none is
> implied by it.

This document is additive evidence. It does not itself edit
`docs/host-turn-workflow-contract.md`'s §1.6.5 support matrix — that is normative contract
text, and this session's mandate keeps contract prose frozen except where a failing
implementation test exposes a specific contradiction (none did here). Whether and how to
fold this evidence into the contract's own matrix is the user's call.
