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

---

## MB-4 · Installing the plugin copies the whole repository, and that is accepted for M1

**Ruling.** `claude plugin install` copies the entire working tree into
`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` — 79 MB, including `node_modules/`,
`dist/` and the 24 MB research corpus. No files-allowlist mechanism was found in the plugin manifest
format. The cost is accepted for M1 and **documented** in the owner testing guide's §1 rather than
worked around.

**Why this is the smallest safe option.** The copy is local to the owner's own machine, so it is not
a disclosure and BP-5 is not breached — the corpus is already on that disk, in the directory being
copied from. The two things that *do* change behaviour are the ones the guide now states plainly:
the installed plugin is a copy, so editing the repository does not change it; and the copy is pinned
at a commit, so testing after a push requires `claude plugin marketplace update`. Both were
discovered by installing rather than by reading, and a defect report filed against a stale copy is
worse than no report. The alternative — restructuring the repository so the plugin root is a
subdirectory holding only what ships — is a large change with its own failure modes, taken to save
disk on one machine.

**Revisit trigger.** A files-allowlist appearing in the plugin manifest format, or the plugin being
distributed to anyone other than the owner — at which point what the installer copies stops being a
local matter.

---

## MB-5 · The research corpus is git-ignored, because BP-1's "stays untracked" must be enforceable

**Ruling.** `plugin_explore_phase/` is added to the working-tree `.gitignore`. The line is **not
committed**, exactly like the `CLAUDE.md` and `AGENT-CHANNEL.md` entries the owner added on the same
basis, so nothing about the committed tree changes.

**Why this is the smallest safe option.** The master plan's §2 says "do not `.gitignore`-away" the
three dirty-tree items, and that note is about preserving WP0's recorded baseline. BP-1 — a tracked
decision log, and therefore higher in the §1.2 precedence order — rules that the directory **stays
untracked**. An ignore line *enforces* that ruling rather than contradicting it, and the baseline is
untouched because the file is not committed.

What made this urgent rather than tidy: audit cycle 1 established that the tree was untracked **and
unignored** — 234 files, 24 MB, containing a real Figma file key in 38 files, roughly 2,000 real node
ids, real variable and style keys, and seven screenshots of the client's live canvas — one
`git add -A` from a remote that resolves without authentication. The plan's own §4A says that makes
BP-5 "load-bearing rather than cautious". A rule whose enforcement is "remember to use path-scoped
`git add`" is not enforcement.

The ignore line protects one machine, so it is **not** the whole fix: `tools/identifier-scan.ts` and
`tests/unit/identifier-leakage.test.ts` are the durable half, and they work in any clone.

**Revisit trigger.** A decision to track any part of the corpus, which would be a change to BP-1.

---

## MB-6 · An unrecorded confidence is `low`, and the broadening is disclosed rather than implied

**Ruling.** Where no per-resolution confidence was recorded, composition treats it as `low`, not
`medium`. And every `new` run emits a `broadened_retrieval` disclosure naming why its candidates are
low-confidence, rather than leaving the designer to infer it from the score.

**Why this is the smallest safe option.** Three options existed once AC-1 established that the
aggregate was a constant. Suppressing the field entirely — the treatment `token_metrics` gets — was
rejected because the value genuinely is derivable and now is derived; removing a real signal to avoid
explaining it is the wrong trade. Leaving `medium` as the unknown value was rejected because it reads
*higher* than the truth, which is the direction that hides a problem, and because
`aggregateConfidence` already answers "no resolutions at all" with `low` — so `low` is the module's
own existing answer to an absent value, applied consistently rather than invented here. What remained
was the honest gap a reviewer then named: with PD-7's broadened listing the only retrieval path,
`low` is the only reachable value, so the number alone is uninformative. The disclosure is what makes
it informative, and it is free — `Disclosure.actionable` is the literal `false`, so it can never
block a run.

**Revisit trigger.** `resolveBatch` being wired behind `prepareContext` (Track C/D), at which point
confidence becomes genuinely multi-valued and the disclosure should stop firing on runs that did not
broaden — and AC-25 and AC-26, recorded in audit cycle 1, become load-bearing and must be fixed
first.

---

## MB-7 · The contract instance carries no rule catalogue of its own

**Ruling.** The promoted `0.4.1-draft` schema drops the two top-level rule arrays the research
contract carried, `validationRules` (`VR-*`) and `contractIntegrityRules` (`CV-*`). The normative
rule catalogue is the single `REP-*` registry in `src/representation/` (WP B2), where each row names
exactly one `EnforcementOwner` and records the research rule it descends from. A contract instance is
data; the rules that validate it are code.

**Why this is the smallest safe option.** BP-6 already decides this and the ruling only follows it
through: "Every production representation invariant is one `REP-*` row in a single registry." Leaving
the arrays in place would put a second, per-document copy of every rule beside that registry — two
representations of one contract, which `tests/contracts/schema-agreement.test.ts:1–9` names as this
project's known failure mode, and which the research package demonstrates rather than hypothesises.
**D-5 is that failure, already realised:** three ids (`CV-4`, `CV-9`, `CV-19`) were asserted by
fixtures against rules the contract never declared, while `CV-3` was declared with no negative
fixture at all — a divergence only possible because the declaration and the enforcement lived in
different files with nothing reconciling them. One declaration makes both directions of D-5
structurally unreachable rather than merely tested for. The rejected alternative — keeping the arrays
and adding a check that they agree with the registry — buys the same guarantee at the cost of a third
artifact that can itself drift.

**Revisit trigger.** A contract that legitimately needs a rule no other contract has. That would be
the first evidence the catalogue is per-document rather than shared, and it would need a written
account of how the per-document rule is enforced before it is added.

---

## MB-8 · The promoted schema is corrected for `ajv` strict mode, and the correction is proved by compilation

**Ruling.** Thirty-six subschemas inherited from the research schema are corrected during promotion:
twenty carrying a type-implying keyword (`pattern`, `minItems`, `required`, …) with no `type`, and
sixteen naming a `required` property the subschema never declares. Each correction states what the
keyword already implies — the implied `type`, or the name declared as the always-true schema `true` —
and none adds or removes a constraint. Every affected gate carries a negative fixture asserting it
still rejects at that gate.

**Why this is the smallest safe option.** `SchemaRegistry.register` is `ajv.addSchema`, which defers
compilation: the uncorrected schema **registers without complaint and throws on first use**, at
whichever call site validates first. A registration test would therefore have passed over a schema
that cannot validate anything — the shape of self-asserted trust this repository exists to remove.
The alternative, relaxing `strict` for this schema, was rejected outright: format assertion and
strict typing are the settings whose absence let a non-UUID `run_id` pass the v1 schema
(`src/validation/schema-validator.ts:1–15`), and B1's own acceptance is that the schema registers
**unchanged** with the existing registry. Worth recording plainly: the research package's suite is
fully green and could not see any of the thirty-six, because its Python validator enforces neither
rule. That is the same class as D-4 — a checker that cannot observe the defect it is pointed at.

**Revisit trigger.** A future `ajv` major changing what `strictTypes` or `strictRequired` accept, at
which point the corrections are re-derived by compiling rather than by editing to taste.
