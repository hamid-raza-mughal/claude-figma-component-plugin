# Builder Master Decision Log — `MB-*`

Decisions taken by the executing session under `docs/builder-agent-master-implementation-plan.md`
§1.1, which forbids stopping to ask. Each entry carries three fields and nothing else: **the ruling**,
**why it is the smallest safe option**, and **its revisit trigger**.

Parallel to, and never overriding, `docs/phase1-decision-log.md` (D-A…D-G),
`docs/phase2-decision-log.md` (PD-1…PD-9) and `docs/builder-phase1-decision-log.md` (BP-1…BP-10).
Precedence is the master plan's §1.2 order; an `MB-*` entry that contradicts a higher source is wrong
by construction and is corrected here rather than argued.

**Prefix discipline (BP-4).** `MB-*` is this log. `BP-*`, `PD-*`, `D-A…D-G` are taken; `REP-*`,
`INV-*`, `G-*`, `FD-*`, `SA-*` and `CV-*` are taken for invariants and rules.

---

## MB-1 · Maintenance operations reach the plugin surface as aliases, not as new operations

**Ruling.** `source.refresh` and `source.validate` gain the slash-command aliases `/refresh-source`
and `/validate-source` on their **existing** rows in `src/registry/operations.ts`. No operation ID is
added, no `RunType` is added, and `RUN_TYPES` stays closed at three.

**Why this is the smallest safe option.** The plugin surface is a filesystem of command files, so a
maintenance operation the owner can run needs a slash name; the registry's current `publicName` for
both rows is the bare operation ID, which is not a command. §2.7's own table writes the public-name
column for both maintenance rows as literally **"provisional"** — so supplying one fills a blank
rather than contradicting the locked contract, and **no edit to `docs/host-turn-workflow-contract.md`
is required**. An alias costs one array element and reuses every existing guarantee: G-18's alias
invariance, G-14's unknown-name refusal, and G-2's refusal of a non-route `operation_id` at
`beginRun`, which is exactly §2.11's "maintenance operations do not enter the authoring pipeline"
already enforced. The rejected alternative — a fourth and fifth operation ID for the slash forms —
would create two operation IDs per maintenance capability, which is the two-accounts-of-one-fact
failure mode `tests/contracts/schema-agreement.test.ts:1–9` names as this project's known defect.

**Revisit trigger.** A maintenance operation that needs its own arguments, phase behaviour or record
shape distinct from the one it aliases — at which point it is a new capability under §17.2, not a
name.

---

## MB-2 · The host turn reaches the engine through a deterministic CLI, not an MCP server

**Ruling.** The 15 Guard-mediated tools are exposed to the host turn by a single deterministic
command-line entry point that takes a tool name plus JSON arguments and writes one JSON object to
stdout — accepting or refusing with the Guard's own named codes. The command instructions drive it
through the host's shell. **No MCP server is added, no dependency is added, and no second model
invocation exists anywhere in the path.**

**Why this is the smallest safe option.** "Enforcement is by refusal at a tool boundary" is satisfied
by either shape: the refusing code is the same `CoordinatorEngine`, and the Guard cannot be talked
past through a shell any more than through a protocol. What differs is cost and risk. An MCP server
means either a new runtime dependency — against a `package.json` that today carries exactly two, both
schema libraries — or a hand-rolled JSON-RPC transport whose protocol defects would surface as "the
owner cannot run the plugin", which is the one outcome M1 exists to prevent. The CLI needs no
protocol: it is `argv` in, JSON out, it is testable by spawning a real process (the pattern
`tools/two-process/` and `tests/tools/cancel-run-cli.ts` already establish in this repository), and
the owner can run it by hand to distinguish an engine defect from a host-integration defect — which
is precisely the discrimination his defect list will need to make.

**Revisit trigger.** The owner's defect list reporting that the model constructs malformed
invocations, skips the tool boundary, or cannot surface a refusal legibly — at which point the same
engine gains an MCP façade over the same entry points, with the CLI retained as the by-hand path.

---

## MB-3 · The plugin surface agrees with the registry by generated check, not by convention

**Ruling.** The set of shipped command files, their names, and each file's declared `operation-id`
frontmatter field are checked against `src/registry/operations.ts` **in both directions** by
`tools/command-surface.ts`, asserted by `tests/plugin/command-surface.test.ts`. The engine does not
read the command directory: the plugin layout is named only in `tools/` and `tests/`, never in
`src/`.

**Why this is the smallest safe option.** `tests/unit/portability.test.ts` already bans the literal
`.claude-plugin` and `allowed-tools:` from every file under `src/` — "no plugin hooks, frontmatter or
command invocation inside the shared engine" — so a binding module in `src/` that reads the command
directory would fail an existing gate, correctly. Putting the check in a tool with a test is the
shape this repository already uses for exactly this problem: `tools/generate-tool-surface-table.ts`
plus `tests/registry/contract-table-agreement.test.ts`, written after §12.2 and the transition
registry silently drifted apart (PD-6). Bidirectionality is BP-6's ruling applied to a second
registry: a one-way check cannot see an orphaned command file **or** a registry row with no command,
and D-5 records both directions failing at once in the research package.

**Revisit trigger.** A command that legitimately has no registry row — which would mean the plugin
has grown a surface the engine does not model, and needs its own design pass under §17.2.
