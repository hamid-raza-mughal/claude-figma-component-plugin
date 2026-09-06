# M1 verification — the Coordinator is runnable

**Executed 2026-09-06, on the owner's Mac, at commit `3a7b4f7` of
`builder-phase1-representation-contract`.** Written in the style of
`docs/phase2-r1-verification.md`, including its discipline of stating what was *not* proven.

**M1's definition (master plan §3):** the owner installs this repository as a plugin in Claude Code,
types `/create-component` with a component request, and drives a real run through
`received → preparing → drafting → validating → awaiting-approval → handoff-ready → terminal`,
seeing the rendered approval view and the built handoff.

**Verdict: the run half is verified end to end against the installed plugin copy. The typed-slash-
command half is verified as far as this session can reach — see §D, which states the remaining gap
precisely rather than rounding it off.**

---

## A · What was installed, and where it actually runs from

The install used the plugin CLI, not a hand-edited settings file. Output verbatim:

```
$ claude plugin marketplace add "$(pwd)"
Adding marketplace…✔ Successfully added marketplace: manage-ds-components-local (declared in user settings)

$ claude plugin install manage-ds-components@manage-ds-components-local
Installing plugin "manage-ds-components@manage-ds-components-local"...✔ Successfully installed plugin: manage-ds-components@manage-ds-components-local (scope: user)

$ claude plugin details manage-ds-components
manage-ds-components 0.1.0
  Description: Manage DS Components — the Coordinator stage of the design-system component pipeline. …
  Source: manage-ds-components@manage-ds-components-local

Component inventory
  Skills (7)  audit-component, coordinator-run, create-component, modify-component, refresh-source, review-component, validate-source
  Agents (0)
  Hooks (0)
  MCP servers (0)
  LSP servers (0)

Projected token cost
  Always-on:   ~293 tok   added to every session
```

All six commands and the orchestration skill are recognised by the host's own inventory. **Zero MCP
servers, zero hooks, zero agents** — which is the shape MB-2 chose, and here confirmed from outside
rather than asserted from inside.

The host recorded the install as:

```json
{
  "scope": "user",
  "installPath": "/Users/apple/.claude/plugins/cache/manage-ds-components-local/manage-ds-components/0.1.0",
  "version": "0.1.0",
  "installedAt": "2026-09-06T11:51:18.050Z",
  "gitCommitSha": "3a7b4f7893f5ae7739036fa6e27182e0c4a7994e"
}
```

**Two facts this exposes, both of which change how the owner must test.** Installing takes a *copy*
into that cache path, so the working tree and the installed plugin are different things and editing
one does not change the other. And the copy is pinned at a commit, so every push after this one
requires `claude plugin marketplace update manage-ds-components-local` before testing. Both are in
the testing guide §1 because a defect report filed against a stale copy is worse than no report.

**Every command below was run against the installed copy**, not the working tree — that is the point
of running it at all.

---

## B · The run, verbatim

Configuration for this run: a synthetic curated export (`tests/tools/fixtures.ts`'s minimal valid
export, written to a scratch path outside the repository), a scratch derived directory, and a scratch
approved-data directory. **No real Figma identifier appears anywhere in this document** (BP-5): every
key and node reference below is the synthetic fixture's, already tracked in `tests/tools/fixtures.ts`.

### 1 — resolve the command

```
$ node "${CLAUDE_PLUGIN_ROOT}/src/runtimes/claude-code/cli.ts" resolve-command --public-name /create-component
{
  "ok": true,
  "tool": "resolveCommand",
  "result": {
    "operation_id": "component.create",
    "kind": "route"
  }
}
exit: 0
```

### 2 — begin the run

```
$ … begin-run --operation-id component.create --user-intent "A dismissible warning toast that uses our warning surface colour"
{
  "ok": true,
  "tool": "beginRun",
  "result": {
    "run_id": "22e0cadf-90d1-4b4f-b28c-1e169c698331",
    "display_id": "new-4BGCNQWG",
    "run_type": "new",
    "phase": "received"
  }
}
exit: 0
```

`run_type` was derived from the operation ID; `run_id` and `display_id` were minted. None of the
three was supplied, and the boundary declares no flag through which they could be.

### 3 — prepare context (deterministic)

```
$ … prepare-context --run-id 22e0cadf-90d1-4b4f-b28c-1e169c698331
exit: 0
```

Shape returned (candidate payload elided for length):

```json
{
  "ok": true,
  "tool": "prepareContext",
  "result": {
    "candidate_categories": ["category:color", "category:typography", "category:spacing", "category:effect", "category:corner-radius"],
    "candidates_per_category": { "category:color": 2, "category:typography": 1, "category:spacing": 1, "category:effect": 0, "category:corner-radius": 0 },
    "schema_card": "<snapshot, body, byte_length, generated_from_index>",
    "route_module": "route-new",
    "assembled_bytes": 11843
  }
}
```

The one paint-style candidate, verbatim — **note its `confidence`, which §C returns to**:

```json
{
  "candidate_id": "c_75533d77cdb75c40bb986e6a",
  "source_record_ref": "paint-style:S:paint1",
  "source_sha256": "ae40356ad5c7a49456ef60880f502e58ff42cbc9719d2b64e55636e04d76bbae",
  "index_version": "1.0.0",
  "ref_class": "paint-style",
  "property_category": "color",
  "path": "surface/warning",
  "key": "paintkey1cafef00dcafef00dcafef00dcafef00d",
  "normalized_id": "S:paint1",
  "confidence": "low",
  "ranking_reasons": ["broadened-retrieval"]
}
```

### 4 — submit the draft (the one authoring act)

```
$ … submit-draft --run-id 22e0cadf-90d1-4b4f-b28c-1e169c698331 --draft-file <path>
{
  "ok": true,
  "tool": "submitDraft",
  "result": {
    "outcome": "accepted",
    "artifact_sha256": "24a2c65ab950cd2ce779f5a2713f62f4a4c4f5bae121c268b3fe370b796162ca"
  }
}
exit: 0
```

### 5 — the rendered approval view

```
$ … present-for-approval --run-id 22e0cadf-90d1-4b4f-b28c-1e169c698331
exit: 0
```

`approval_view.title`:

```
Approve semantic intent — new
```

`approval_view.body`, **verbatim and complete**:

```
Run 22e0cadf-90d1-4b4f-b28c-1e169c698331
Route: new   Status: ready
Design-system snapshot: ae40356ad5c7… (schema 1.1, index 1.0.0)

NOTHING HAS BEEN BUILT. No Figma artifact exists. You are approving intent only.

Component: Warning Toast
Intent: A dismissible warning notification that uses the warning surface colour.

Variant axes:
  state: default (default) · dismissed

Semantic elements:
  root — container
    fill ← "our warning surface colour"

Resolved references — every field verified against the pinned snapshot:
  - paint-style surface/warning
    key paintkey1cafef00dcafef00dcafef00dcafef00d · ref paint-style:S:paint1

Aggregate confidence: medium
  (the weakest individual resolution, not an average)

Approving binds this exact artifact: sha256 24a2c65ab950cd2ce779f5a2713f62f4a4c4f5bae121c268b3fe370b796162ca
```

### 6 — record the approval

```
$ … record-approval --run-id 22e0… --decision approved --approved-by "Hamid Raza"
{
  "ok": true,
  "tool": "recordApproval",
  "result": { "outcome": "advance", "phase": "handoff-ready" }
}
exit: 0
```

### 7 — build the handoff

```
$ … build-handoff --run-id 22e0…
{
  "ok": true,
  "tool": "buildHandoff",
  "result": {
    "next_route": "builder",
    "machine_handoff": {
      "source_object_sha256": "24a2c65ab950cd2ce779f5a2713f62f4a4c4f5bae121c268b3fe370b796162ca",
      "handoff_version": "1.0.0",
      "next_stage": "builder",
      "run_id": "22e0cadf-90d1-4b4f-b28c-1e169c698331",
      "run_type": "new",
      "status": "ready",
      "payload": "<the composed output, elided for length>",
      "approval": {
        "gate": "gate-1-semantic",
        "gate_mode": "observe-only-validation",
        "approved_artifact_sha256": "24a2c65ab950cd2ce779f5a2713f62f4a4c4f5bae121c268b3fe370b796162ca",
        "approved_at": "2026-09-06T11:53:54.143Z",
        "approved_by": "Hamid Raza",
        "decision": "approved",
        "response_source": "model-relayed",
        "verified": false,
        "authorizing": false
      }
    }
  }
}
exit: 0
```

`response_source: model-relayed`, `verified: false`, `authorizing: false` — HD-1 is untouched and
unclaimed, exactly as §9 of the plan requires. `next_route: builder` is **recorded and not followed**;
no Builder exists and nothing was built.

### 8 — close, and the terminal record read back

```
$ … close-run --run-id 22e0… --outcome completed
{ "ok": true, "tool": "closeRun", "result": { "outcome": "completed" } }
exit: 0

$ … resume-run --run new-4BGCNQWG
{ "ok": true, "tool": "resumeRun", "result": { "phase": "terminal", "pending_action": "terminal: completed" } }
exit: 0
```

The final `resume-run` used the **`display_id`**, not the UUID — the short reference a designer can
read back (§2.2.1), resolving the same run.

### The persisted event history, read back from the store file

```
1 | 2026-09-06T11:52:45.961Z | run-begun                    | —                  -> received
2 | 2026-09-06T11:52:57.647Z | context-preparation-started  | received           -> preparing
3 | 2026-09-06T11:52:57.647Z | context-preparation-succeeded| preparing          -> drafting
4 | 2026-09-06T11:53:40.314Z | draft-submitted              | drafting           -> validating
5 | 2026-09-06T11:53:40.496Z | approval-presented           | validating         -> awaiting-approval
6 | 2026-09-06T11:53:54.143Z | approval-recorded-approved   | awaiting-approval  -> handoff-ready
7 | 2026-09-06T11:53:54.326Z | handoff-built                | —                  -> —
8 | 2026-09-06T11:53:54.576Z | run-completed                | handoff-ready      -> terminal
```

Every one of §3's seven phases is present, in order. The wall-clock gaps between events 1→2 (12s),
3→4 (43s) and 5→6 (14s) are real: each is a separate `node` process, invoked by hand, with a human
composing the next step in between. That is what "a run spans turns" looks like in the record.

Tool invocations recorded for this run, all successful, one per call (§13.2):

```
prepareContext | ok=true
submitDraft    | ok=true
presentForApproval | ok=true
recordApproval | ok=true
buildHandoff   | ok=true
closeRun       | ok=true
```

---

## C · One confirmed functional defect, found by running it

**`aggregate_confidence` is a hardcoded `medium`, disconnected from the resolutions it claims to
summarise.** The master plan §9 lists this as suspected. It is now confirmed against the artifact.

**The evidence, in three parts:**

1. The run's only resolution is `c_75533d77cdb75c40bb986e6a`, whose candidate record reads
   `"confidence": "low"` with `"ranking_reasons": ["broadened-retrieval"]` (§B step 3, verbatim).
2. The approval view the owner would read says `Aggregate confidence: medium`, under the line
   *"(the weakest individual resolution, not an average)"* (§B step 5, verbatim). The weakest — and
   only — individual resolution is `low`.
3. The cause is one expression. `src/coordinator/compose-trusted-output.ts:246–247`:
   `input.perResolutionConfidence?.get(resolution.candidate_id) ?? 'medium'`. A repository-wide grep
   for `perResolutionConfidence` returns three hits: the type declaration, that line, and **one
   adversarial test**. `submitDraft` never passes the map, so the `?? 'medium'` fallback is what
   every real run gets, for every resolution, regardless of what the resolver actually said.

`aggregateConfidence()` itself is correct — it takes the weakest child and its comment explains why.
It is simply never given the children's real values.

**Why this is worth naming as more than a wrong string.** It is a self-asserted trust field: the
artifact states a confidence about itself that nothing measured. It reads *higher* than the truth,
which is the direction that hides a problem rather than surfacing one. And the renderer prints an
explanation of a rule the value does not follow, so the screen actively argues for its own
correctness. That is the defect class §5 of the plan tells me to hunt.

**Not fixed in this work package, deliberately.** A4's job is to record what the system does, and a
verification document that quietly fixed what it was verifying would be worth nothing. It is
finding **AC-1** of audit cycle 1, which runs next.

---

## D · What this does and does not establish

**Established, by execution:**

- the plugin installs through the host's own CLI, and the host recognises all six commands and the
  orchestration skill (§A);
- the installed copy — not the working tree — runs every tool in the surface (§B);
- one `new` run traverses all seven phases in order and terminates `completed`, with the full event
  history readable back from the store file by a later process (§B);
- the approval view renders in full, carrying the not-built line, the resolved references, and the
  binding hash (§B step 5);
- the handoff embeds an approval that is explicitly unverified and non-authorizing (§B step 7);
- `display_id` resumes the run (§B step 8).

**Not established, and not claimed:**

- **Typing `/create-component` in an interactive Claude Code session has not been driven by me.**
  This session cannot install into and then drive itself. What is verified is that the host loads
  the command definitions (§A's inventory) and that every command they instruct the turn to run
  works against the installed copy (§B). The remaining, unverified step is the host's dispatch of the
  typed string into those instructions. **That is the first thing the owner's run will test**, and
  it is why the testing guide's §3 spells out what each pause should look like.
- **The strict gate was not run.** `ADALFI_ARTIFACT_DIR` is not available in this environment, so
  `npm run verify` and its 84 bundle-gated tests did not execute. The source-only gate did: 725
  tests, 718 pass, 0 fail, exactly 7 known skips.
- **No Figma access of any kind occurred**, because none exists. `/modify-component` and
  `/audit-component` refuse at G-3a naming FD-1…FD-4.
- **HD-1, HD-3, R-2, `token_metrics` and a trustworthy `model_id` are all untouched** and none of
  them is implied anywhere above.
- **This run used a synthetic curated export**, not the owner's real design system. The reference
  names and keys above are the tracked test fixture's. Whether the resolver picks the *right* tokens
  from the real curated JSON is precisely what the owner's own run will answer, and is the highest-
  value defect class he can report.
