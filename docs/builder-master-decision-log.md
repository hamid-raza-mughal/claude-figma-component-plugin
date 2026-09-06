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

**Ruling.** Every subschema inherited from the research schema that carries a type-implying keyword
(`pattern`, `minItems`, `required`, …) with no `type`, and every one naming a `required` property it
never declares, is corrected during promotion. Each correction states what the keyword already
implies — the implied `type`, or the name declared as the always-true schema `true` — and none adds
or removes a constraint.

*Audit cycle 2 corrected two claims here.* The first was "thirty-six … twenty … sixteen": no counting
method reproduces those figures — by unique ajv message it is 26 and 9, by distinct subschema
location 22 and 8 — and nothing in the suite recomputed them. They are gone rather than restated,
because a number in a ruling that no test anchors is the D-9 class again. The second was "every
affected gate carries a negative fixture": there are sixteen negative schema fixtures against thirty
or so corrected subschemas, so it was false by an order of magnitude. What is true, and is what the
fixtures actually establish, is that **every gate a `REP-*` rule names carries a negative fixture
asserting it still rejects there** — and, after cycle 2, asserting it by a contiguous run of path
segments rather than by unordered substrings, which is what that assertion had been doing.

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

---

## MB-9 · A `REP-*` row is declared only once something enforces it, and the gap is a ledger

**Ruling.** The `REP-*` registry carries only invariants that have an enforcement point today and a
positive **and** negative fixture proving it. The remaining research rules are recorded in
`src/representation/validation/promotion-ledger.ts` with the work package that lands each.

*Audit cycle 2 correction: this entry said "nineteen of the twenty-nine", and the ledger has never
held nineteen of anything. It is twenty-one `pending`, seven `promoted`, one `partially_promoted`.
The number was written from memory and nothing recomputed it — the D-9 class, in a ruling about
D-5. The count is now asserted by `invariant-registry.test.ts` rather than stated here, so the two
cannot drift again; that is why this paragraph names no number.* A test asserts the ledger covers every research id exactly once, that every
`promoted_to` names a declared row, that every declared row is either claimed by the ledger or listed
as new, and that lineage agrees in both directions.

**Why this is the smallest safe option.** The obvious alternative — declare all twenty-nine rows now
and fill in enforcement later — **is D-5, performed deliberately.** D-5 is a fixture manifest
asserting three rule ids the contract never declared while a fourth declared rule had no negative
fixture, and BP-6 exists specifically to make that condition a failing test. A registry that outruns
its enforcement would have to suppress its own bidirectional check to stay green, which is the one
thing this phase must not do. The other alternative — say nothing about the nineteen — makes a
dropped rule indistinguishable from a deferred one, and the research package is the evidence that
silence is what lets a rule rot. `CV-17` gets a fourth disposition, `partially_promoted`, because its
`authoringMode` leg is schema-enforced today while its legacy-state and migration-review legs are
not; recording it as plain `promoted` would overstate coverage by exactly the amount that matters.

**Revisit trigger.** The ledger reaching zero `pending` rows, at which point it becomes a lineage
record rather than a work list and its `pending_in` field should be dropped.

---

## MB-10 · An unchecked reference is a violation, not a skip

**Ruling.** `resolveReferences` reaches the filesystem through an injected `ArtifactReader`, never
`node:fs`. When a contract carries an `artifact` target and **no reader was supplied**, that is
reported as `REP_ARTIFACT_TARGET_UNRESOLVABLE` — a violation attributed to REP-13 — rather than
passing, warning, or being silently skipped.

**Why this is the smallest safe option.** The alternative that looks harmless is skipping: no reader,
nothing to check, move on. That produces a run in which an unverified artifact reference is
indistinguishable from a verified one, which is D-7's survival mechanism restated as a design. It is
also the same shape as this repository's `sourceOnlyExpectedSkips` discipline — a skip is legible
only while it is counted, and an uncounted skip stops being visible at all. Injecting the reader
rather than importing `node:fs` is what makes the negative cases testable: an artifact target exists
precisely because the artifact may be missing, and a validator bound to the real filesystem can only
be tested for absence by deleting a file. With a port, "absent" and "present but the wrong bytes" are
both ordinary fixtures, and both are covered.

**Revisit trigger.** A caller that legitimately validates structure without evidence available — at
which point it asks for that explicitly, by naming the check it is declining, and the decline is
recorded in the result rather than inferred from its absence.

---

## MB-11 · The promoted empirical corpus stays at `0.4.0-draft`, defects intact

**Ruling.** `tests/representation/fixtures/empirical/` carries the research contracts, evidence
artifacts and probes **unmigrated** — still `0.4.0-draft`, still carrying D-1, D-3, D-6 and D-11. The
promotion sanitizes and nothing else. Four tests assert each defect is still present.

**Why this is the smallest safe option.** The alternative — migrate the promoted contracts to
`0.4.1-draft` while promoting them — destroys the only thing they are for. These fixtures exist so
the production validator can be shown catching what the research tooling could not; a corrected
corpus proves nothing, and the suite would stay green over an empty claim. It would also merge two
independent operations, so a sanitization bug and a migration bug would be indistinguishable in the
diff. Keeping the corpus frozen also mirrors BP-7's treatment of the research directory itself: the
defects are corrected in the production promotion, which here means the schema, the registry and the
resolvers — not in the evidence.

**Revisit trigger.** A second research iteration producing a `0.4.1`-shaped corpus of its own, which
would be a new promotion beside this one rather than an edit to it.

---

## MB-12 · Promotion excludes by budget and by prefix, and both are reported by name

**Ruling.** The promotion tool leaves out screenshots and research tooling by extension, files above a
256 KB budget, and directories named by `--exclude`. Every exclusion is reported: the over-budget
files by their sanitized names, the prefix exclusions by count, and the whole set is written down in
`docs/builder-phase1-research-provenance.md` with a reason each.

**Why this is the smallest safe option.** Promoting the corpus whole was 15 MB, of which the two raw
Figma exports were 12 — bulk source captures already recorded by SHA-256 in the contracts'
`provenance.exportsUsed`, which nothing validates against. The rest of the excess was the research
package's own synthetic fixture set and its lineage archives; production fixtures for every declared
`REP-*` rule already exist, in both directions, so promoting a second set would add size without
adding a check. What makes this safe rather than convenient is that the exclusions are **named**: a
silent size filter is how a corpus quietly stops containing the thing a test claims to check, and
"something large was dropped" is exactly the fact that stops being visible once it is only a number.

**Revisit trigger.** A production check that needs an excluded artifact — at which point the artifact
is promoted individually and the budget stays where it is, rather than the budget being raised until
it stops excluding anything.

---

## MB-13 · Retired vocabulary is matched by substring inside a field logic reads, and by equality everywhere else

**Ruling.** `findRetiredVocabulary` treats one class of field — today, `detectionCondition` — as
machine-read, and matches a retired token anywhere inside it. Everywhere else a leaf must *equal* a
retired value to count. `RETIRED_VOCABULARY` carries retired **enum values**, transcribed from the
research package's own list, and no retired field names.

**Why this is the smallest safe option.** D-4 is whole-string equality applied everywhere, and it is
why D-1, D-2 and D-3 all survived a fully green suite: a retired token inside a sentence is never
equal to the sentence. The obvious correction — substring matching everywhere — is worse in practice
and I wrote it first. `buttons` is a retired scope token *and* an ordinary English word appearing
throughout a document about buttons, and a rule that fires on every sentence is a rule that gets
switched off within a week. Including retired field names made it worse again: the promoted schema's
own `description` fields say what `layoutStrategy` and `matrixAllocations` were replaced by, and
flagging a migration note for naming what it migrated is exactly the false positive that discredits
the check. The distinction that survives both failures is the one the defect is actually about: a
string a validator is meant to *interpret* versus a string it is meant to *display*.

**Revisit trigger.** A second machine-read field — at which point it joins the pattern rather than
the pattern being widened to "any string".

---

## MB-14 · A rule whose evidence is a test declares that in the fixture index, and the declaration is verified

**Ruling.** The fixture index accepts rows with `validator: "evidence"`, carrying no fixture file and
instead a `covered_by` naming the test that is the evidence. The bidirectional coverage check counts
them like any other row, and a separate assertion reads the named file and verifies a test with that
exact name exists.

**Why this is the smallest safe option.** REP-18 through REP-21 are checked against whole documents —
a contract, a probe set, a markdown file — not against a contract fixture, so there is no JSON to put
in `fixtures/`. Two alternatives were worse. Exempting these rules from the coverage check would put
four rules in the registry with nothing asserting they are covered, which is D-5 with a shorter list.
Writing synthetic fixtures for them would satisfy the check while proving the weaker thing: that the
comparison runs, rather than that the corpus needed it. What makes the declaration safe rather than
decorative is that it is **resolved**: rename or delete the test and the row fails, so a registry can
never report itself covered by evidence that has gone.

**Revisit trigger.** A third form of evidence appearing, at which point `validator` becomes a
discriminated union with its own per-kind verification rather than a growing string enum.

---

## MB-15 · The boundary scan reads code as code and documents as documents

**Ruling.** `tools/boundary-scan.ts` applies its two path rules — a constructed path into the research
corpus, and a path past the representation barrel — to `.ts`, `.js` and `.json` only. Markdown is
scanned for one rule: a filesystem call naming the corpus. Ten exemptions, each naming one file and
one rule with a reason, cover the guards that must write down what they forbid; a test asserts the
count, that every exemption still suppresses something, and that none is a glob.

**Why this is the smallest safe option.** The first version applied every rule everywhere and produced
**nineteen findings and zero defects** — every one a decision log citing the directory that BP-1 is
*about*. A scan that cannot distinguish a citation from a dependency is a scan that gets switched off
within a week, and `docs/builder-master-audit-cycle-1.md`'s own allowlist discipline exists because
this repository has already learned that. The discrimination that survives is real rather than
convenient: in code, a quoted path *is* a dependency; in prose, naming a directory is documentation,
and a document carrying a command that reads it is caught by the rule that still applies there. The
"still needed" test is what keeps the exemption list from outliving its reasons — an exemption that
suppresses nothing is one nobody will notice has stopped being justified.

**Revisit trigger.** A fourth boundary rule, or the first exemption that is not itself a guard — the
latter would mean something legitimately depends on the corpus, which is a request to change BP-1.

---

## MB-16 · The gated command is BP-10's literal string, and the refusal lives in the test

**Ruling.** `test:evidence` is exactly the command BP-10 fixes, character for character. The explicit
failure when `REPRESENTATION_EVIDENCE_DIR` is unset is asserted by the gated test file's first
assertion rather than by a wrapper script, and a tracked test asserts both: the script string, and
that the file refuses.

**Why this is the smallest safe option.** BP-10 writes the command out verbatim, so it is a locked
ruling rather than a suggestion, and a wrapper would have been a second thing to keep in agreement
with it — the two-representations failure mode again, over a one-line script. Putting the refusal in
the test is also where it belongs: `node --test` over a glob has no place to check an environment
variable, but the test that would read the pack does, and it fails there with a message saying what
is missing. Both directions are exercised: unset, four failures naming the variable; set, four
passes. `sourceOnlyExpectedSkips` is untouched at `7`, and a test asserts that too, because the
`.evidence.ts` suffix is what makes these tests invisible to the default glob without any skip,
exclusion or flag.

**Revisit trigger.** The pack becoming a standard part of the development environment, at which point
BP-10's own trigger applies and the suite folds into `test:strict` beside the artifact bundle.

---

## MB-17 · The curated baseline is re-pinned at `_latest.json`, and the drift flag is not used

**Ruling.** `CURATED_SOURCE_RELATIVE` points at `Agentic/adalfi-design-curated-tokens_latest.json`
and `BASELINE_SOURCE_SHA256` is `7f14d009…` over its 902,685 bytes. The 2026-07-28 export stays in
the bundle as `HISTORICAL_SOURCE_RELATIVE`, read by exactly one suite. `--allow-source-drift` and
`ADALFI_ALLOW_SOURCE_DRIFT` were not used at any point in this migration.

**Why this is the smallest safe option.** The drift flag exists to say "the measured numbers in
`docs/` no longer describe this source" — it is a way to keep working for one run, not a way to
adopt an export. Leaving it on would have converted a one-time re-measurement into a permanent
standing lie, and the flag's own remedy text says so. So the byte-exact check was allowed to fail,
which is what it is for, and every figure that cites the source was re-taken.

Two hidden copies of the source path surfaced while doing it. `tests/resolver/test-index.ts` and
`tests/unit/assembly.test.ts` each spelled out `Agentic/adalfi-design-curated-tokens.json`
themselves, so re-pointing the constant alone would have left the preflight pinning one file while
every resolver and assembly measurement was taken against another — **and both would have been
green**. Both now import the constant. `BASELINE_SOURCE_BYTES` was added for the same reason: the
byte count was hand-typed in three test files.

**Revisit trigger.** The next curated export. The procedure is the failure itself: let the preflight
fail, run `tools/measure-source-baseline.ts`, replace the numbers, then re-pin.

---

## MB-18 · A named token path resolves to itself or to nothing — never to a neighbour

**Ruling.** `resolveOne` now checks whether the reference text is *path-shaped* — one whitespace-free
token containing a `/` — before building a candidate pool. If it is, the exact path is looked up:
found, that record is returned alone with `ranking_reasons: ['exact-path-match']`; not found, the
result is empty with the new `no_match_reason: 'retired-or-unknown-path'`. Free-text queries are
untouched.

**Why this is the smallest safe option.** The 2026-09-06 export retired thirteen names, and the
retirement was not detectable by any existing test. Measured against the real new index *before* the
fix, **twelve of the thirteen still resolved**: `sys/dark/bg/on_bg_dim` to its rename at **high**
confidence, `sys/dark/bg/bg` to `sys/dark/surfaces/on_surface`, and `radius/round-shape/md`, `/sm`,
`/xs` and `/xl` all to `radius/round-shape/lg/lg` — a different size — at medium. The shape of the
rename is what makes this unavoidable rather than a ranking bug: `radius/round-shape/lg` and
`/reg` are now **strict prefixes** of live paths, and the other eight retired leaves have their final
segment surviving one level deeper. A ranker that scores path prefixes and whole segments — which
this one does, correctly, for design language — cannot help but hit them.

The narrow trigger is the whole point. A description invites ranking; a **name is a claim of
identity**, and the only honest answers to a claim of identity are "here it is" and "that does not
exist". Ranking a name produces the third answer — "here is something else, at medium confidence" —
which is the one that ships a wrong token. `isPathShaped` is deliberately conservative: a false
positive costs a ranked answer the caller could have had, a false negative restores exactly today's
behaviour, and none of the twelve committed ground-truth reference texts contains a slash.

The fix also covers the case that is easy to miss. Two *live* paths were being outranked by
neighbours — `radius/round-shape/lg/md` returned `radius/round-shape/lg/lg` first, and
`lg-scale/base` returned `radius/cta/base` first. Being outranked by a neighbour is the same defect
as being replaced by one, so an exact hit returns one candidate and no alternatives. `high` here
still means "ranked strongly", never "verified" — materialization remains the authority (§13.5).

**Revisit trigger.** A legitimate caller that passes a slash-bearing *description* and wants ranking,
or a second identifier syntax that is not slash-delimited.

---

## MB-19 · The rename suite keeps `sourceOnlyExpectedSkips` at exactly 7

**Ruling.** `tests/resolver/retired-names.test.ts` registers no `{ skip: true }` placeholder. In
source-only mode it runs its bundle-independent assertions — the `isPathShaped` behaviour, and the
well-formedness and disjointness of the retired/live tables — plus one test asserting that the
bundle is absent and the index-backed half did not run. The skip figure stays at `7`.

**Why this is the smallest safe option.** Every other source-backed suite declares one skipped
placeholder, so an eighth suite would ordinarily mean an eighth skip. But `sourceOnlyExpectedSkips`
is a standing equality in this repository's rules, and moving it — even upward, even for a good
reason — is exactly the move the rule exists to prevent someone making for a bad one. Nothing is
weakened by declining: the strict gate still demands every assertion in the file with **zero** skips
allowed, which is where this evidence is required. What source-only mode loses is the one-line
"suite did not run" marker, and that is replaced by a test that says so and asserts it.

**Revisit trigger.** The owner, or a rule change, permitting the figure to move — at which point this
file adopts the ordinary placeholder convention and the figure becomes 8.
