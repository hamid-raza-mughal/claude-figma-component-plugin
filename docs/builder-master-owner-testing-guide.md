# Owner testing guide — Manage DS Components, milestone M1

**Written 2026-09-06 · for the design owner, not for a developer.**

This tells you how to install the plugin, what to type, what you should see at each pause, and how
to write down anything that is wrong. It assumes nothing about reading code.

**What M1 is.** The Coordinator stage runs end to end: it reads your curated design-system JSON,
proposes a component's semantic intent, shows you a proposal to approve, and builds a machine
handoff. **Nothing is built in Figma. No Figma file is read or written at any point.** That is not a
limitation you have to remember — the plugin says it on screen, and every route that would touch
Figma refuses by name.

**What you are testing.** Whether the thing behaves. §6 of the master plan says your defect list is
the highest-authority input in this repository, above every document in it. Please be blunt.

---

## 1 · Install — two commands

Run these in a terminal, from anywhere:

```bash
claude plugin marketplace add ~/GIT/claude-plugins/claude-figma-component-plugin
```

```bash
claude plugin install manage-ds-components@manage-ds-components-local
```

Verify it landed:

```bash
claude plugin details manage-ds-components
```

You should see version `0.1.0`, and a component inventory listing seven items:
`audit-component, coordinator-run, create-component, modify-component, refresh-source,
review-component, validate-source`.

**Two things about installing that will bite you if nobody says them.**

1. **Installing takes a *copy*.** The plugin runs from
   `~/.claude/plugins/cache/manage-ds-components-local/manage-ds-components/0.1.0/`, not from the
   repository you pointed at. Editing the repository does **not** change the installed plugin.
2. **After I push new work, you must update.** Otherwise you are testing an old copy and your defect
   report will be about code that no longer exists:

   ```bash
   claude plugin marketplace update manage-ds-components-local
   ```

To remove it all again, at any time:

```bash
claude plugin marketplace remove manage-ds-components-local
```

---

## 2 · Configuration — three paths, none of them guessed

The plugin refuses to invent a file location. Three environment variables must be set, and it will
tell you by name which one is missing rather than silently using a default.

| Variable | What it points at |
|---|---|
| `ADALFI_CURATED_SOURCE` | your curated design-system JSON export — the **authoritative** source |
| `ADALFI_DERIVED_DIR` | a scratch directory for the rebuildable index. Safe to delete at any time |
| `ADALFI_APPROVED_DATA_DIR` | where your runs are stored. **Not** safe to delete — this is the durable record, and it must not be the same directory as `ADALFI_DERIVED_DIR` |

Set them once, for every session, by adding an `env` block to `~/.claude/settings.json`:

```json
{
  "env": {
    "ADALFI_CURATED_SOURCE": "/absolute/path/to/your-curated-tokens.json",
    "ADALFI_DERIVED_DIR": "/absolute/path/to/ds-components/derived",
    "ADALFI_APPROVED_DATA_DIR": "/absolute/path/to/ds-components/runs"
  }
}
```

Use absolute paths. `~` is not expanded, and a relative path is rejected.

**What happens if you skip this.** The first command you type answers, in full:

```json
{
  "ok": false,
  "tool": "resolveCommand",
  "error": {
    "code": "ConfigError",
    "enforced_by": null,
    "message": "curatedSourcePath is required and has no default. Supply it explicitly or set ADALFI_CURATED_SOURCE. Phase 1 forbids hard-coded paths (P1-FINAL §5.6)."
  }
}
```

That is the correct behaviour, not a crash. If you ever see it, the fix is the variable it names.

### About `ADALFI_ARTIFACT_DIR`

You do **not** need it to run the plugin, and the plan's mention of it is about the test suite, not
the product. It points at the external artifact bundle that the strict developer gate
(`npm run verify`) needs in order to run 84 extra tests. Without it the suite runs source-only and
says so out loud. It has no effect on anything you type below.

---

## 3 · The first command to type

In Claude Code:

```
/create-component a dismissible warning toast that uses our warning surface colour
```

Everything after the command is your request, in your own words. It is passed through **verbatim** —
if you see it tidied, summarised or expanded anywhere, that is a defect worth writing down.

### What should happen, in order

**Pause 1 — nothing yet.** The command resolves and a run starts. You may be shown a short reference
like `new-4BGCNQWG`. **Write it down.** It is how you pick this run back up later, and it is the only
thing you need to.

**Pause 2 — the proposal.** This is the one you actually review. You should see something with all of
this in it:

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
    key paintkey1cafef00d… · ref paint-style:S:paint1

Aggregate confidence: medium
  (the weakest individual resolution, not an average)

Approving binds this exact artifact: sha256 24a2c65ab950cd2c…
```

**Read four things carefully, because they are the ones most likely to be wrong.**

- The **`NOTHING HAS BEEN BUILT` line must be there.** If it is missing or softened, that is a
  serious defect. Report it as blocking.
- **Every resolved reference must be a token that actually exists in your design system.** They were
  looked up against your curated JSON, not invented — if a name or key is wrong, that is the most
  important kind of defect you can find.
- **The aggregate confidence is a known-suspect field.** It is supposed to be the *weakest*
  individual resolution, never an average. If it reads higher than the worst reference on the list,
  say so — I already have one confirmed instance of this and want to know if you see others.
- **The `sha256` is what your approval binds to.** If you change your mind and the proposal is
  re-composed, that number changes and the old approval stops counting. You do not need to check it;
  you just need to know that is what it is for.

**Pause 3 — your response.** Approve, reject, or ask for changes.

**Important, and stated plainly rather than buried:** your approval is **recorded, not verified**.
The system cannot prove a human typed it. Anything attributed to you should say *"attributed to
Hamid — unverified"* and never *"approved by Hamid"*. If you see the second wording anywhere, write
it down — that is a defect, not a rounding of words.

**Pause 4 — the result.** A machine handoff is built and the run closes `completed`. The handoff
records `next_route: builder`. **It is recorded and not followed**: there is no Builder yet. If
anything claims a component was created, that is a blocking defect.

---

## 4 · The other commands

| Type this | What happens |
|---|---|
| `/create-component <your request>` | the only route that runs today |
| `/modify-component …` | **refuses by name.** It needs a Figma read connection that does not exist yet. The refusal is correct |
| `/audit-component …` | same — refuses by name |
| `/review-component …` | the same thing as `/audit-component`, under a second name |
| `/refresh-source` | rebuilds the index after you change your curated JSON. Tells you which in-progress runs it invalidated |
| `/validate-source` | checks your curated JSON is structurally valid. Changes nothing |

**A refusal is the system working.** `/modify-component` refusing is the designed behaviour, not a
bug — but *how* it refuses is fair game. If it fails obscurely, or crashes, or says something you
cannot act on, that is a defect.

### Picking up a run later

Runs survive across conversations, days and restarts — the record is on disk, not in the chat. Give
Claude the short reference you wrote down (`new-4BGCNQWG`) and ask it to resume. It will tell you
what the run is waiting for.

A run nobody touches for **72 hours** is closed as timed-out — but only the next time something looks
at it, so a run cannot expire while you are still thinking about it.

### If you change your curated JSON mid-run

Any run still open is invalidated. It can only be closed or cancelled — it will not quietly
re-attach itself to the new data, because that would move the ground under a proposal you already
approved. You should be told *the design-system data changed, so this proposal must be regenerated*.
If you are told anything about hashes or events instead, that is a defect.

---

## 5 · How to record a defect

One block per defect. Do not tidy it; the raw version is more useful.

```
DEFECT n
Command typed:
What I expected:
What happened:
Screenshot / output:
Severity (blocks the run / wrong result / cosmetic):
```

**Please include the raw output even when it looks like noise.** The most valuable defects in this
project's history were found by looking at what a tool actually returned, not at a description of it.

**Things that are worth reporting even though they are not crashes:**

- wording you would never say to a designer — phase names, rule codes like `G-11`, sequence numbers
- a proposal whose references are real but wrong for what you asked
- a confidence that reads higher than the weakest reference under it
- anything that claims something was built, verified, or approved-by
- a refusal you cannot act on
- your request coming back reworded

**Things that are working as designed, so not defects:**

- `/modify-component` and `/audit-component` refusing
- `next_route: builder` appearing but nothing being built
- an approval described as unverified
- a proposal coming back `blocked` with questions — that is a legitimate result, not a failure

---

## 6 · If it will not run at all

| What you see | What it means | What to do |
|---|---|---|
| `"code": "ConfigError"` | one of the three variables is unset | set the one it names, in `~/.claude/settings.json` |
| `"code": "G-20a"` or `"G-20c"` | the run store is unreachable, or the directory does not belong to this install | check `ADALFI_APPROVED_DATA_DIR` points where you think, and that it is not the same as `ADALFI_DERIVED_DIR` |
| `command not found: claude` | the CLI is not on your `PATH` | open a new terminal |
| the command is not offered at all | the plugin is not installed or not enabled | `claude plugin list`, then `claude plugin enable manage-ds-components` |
| a stale-looking result after I said I fixed something | you are running the installed copy from before the fix | `claude plugin marketplace update manage-ds-components-local` |

**None of these need a developer.** If you hit something not on this list, it goes on the defect list
as-is — an error I did not anticipate is more informative than one I did.
