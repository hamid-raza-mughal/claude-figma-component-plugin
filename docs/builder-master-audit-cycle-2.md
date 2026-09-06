# Audit cycle 2 — Track B

Run under the master plan §5 after Track B (`37390e4`…`80b4199`). Four adversarial reviewers, one per
dimension group, each instructed to find defects rather than confirm correctness. Every finding was
verified against the artifact before being acted on, and the rejected ones are reported too — a cycle
that reports only confirmations is not evidence of a clean system.

**Scope, and what it could not reach.** §5 schedules cycle 2 after Track D and names its focus as
"Builder inputs, intake refusals, extraction, structural validation, the data boundary". Track D is
not built and Track C is parked on an external dependency only the owner can supply, so this cycle
covers **structural validation** and **the data boundary** genuinely and reaches **Builder inputs,
intake refusals and extraction not at all**. Those three are uncovered, not passed. Cycle 3 inherits
them.

**The headline.** The sanitized corpus I committed at `fcc25e1` was materially reversible, and every
gate I had written to prove otherwise reported clean over it. Three identifier shape classes passed
the sanitizer, both tracked suites, and the repository-wide identifier scan. That is not a near miss:
it was pushed to a public remote and stood for about three hours.

---

## Part 1 — the data boundary

### AC2-1 · CONFIRMED · Node ids written with a hyphen survived in file *content*

203 occurrences of eleven distinct real node ids. `sanitiseFileName` handled the hyphen form for
paths; `sanitiseText` applied only the colon-form shapes, so every filename quoted **inside** a
document kept its real id.

Worse than the count: one evidence manifest pairs the hyphen form (in a `path` field) with its own
placeholder (in `sourceNodeId`) on adjacent lines of the same object — **a partial real-to-placeholder
mapping, published**. That is precisely what `tools/promote-representation-evidence.ts` refuses to
write to disk, arriving by another route.

**Fixed.** A hyphen shape whose `canonical` maps it to the colon form, so both notations receive one
placeholder. **Covered by** `tests/representation/empirical-corpus.test.ts`, `no promoted file carries
a Figma node id written with a hyphen`, and by an independent value-based check in the gated suite.

### AC2-2 · CONFIRMED · Hex abbreviated with an ellipsis passed every rule

Twelve distinct real values across 29 sites, including a real SHA-256 prefix over bytes that were
never promoted, and *half-sanitized compounds* — a real key prefix followed by an already-substituted
node placeholder. Every rule required a full 40 or 64 hex, and an 8-hex prefix matched none of them
while still resolving to exactly one real value.

**Fixed.** A `TRUNC` shape, applied before the compound forms. **Covered by** `no promoted file
carries a hex identifier abbreviated with an ellipsis`, and by a new `truncated-hex` rule in
`tools/identifier-scan.ts` with falsifiers in both directions.

### AC2-3 · CONFIRMED · A single-digit node id slipped a narrowed rule 36 times

A real mode id, past `\d{2,6}:\d{1,6}`. The rule had been narrowed to two digits so it would not eat
ISO timestamps — a narrowing that bought nothing and cost this.

**Fixed.** Timestamps are set aside before the shapes run and restored afterwards, so the node rule
is as wide as a real node id actually is. **Covered by** the corpus scan, which now excludes
timestamp context by looking at the text around a match rather than by narrowing the pattern.

### AC2-4 · CONFIRMED · Literals were substituted before shapes, and every boundary was `\b`

Two mechanisms, one class. Every shape rule was boundary-anchored, and a placeholder ending in a
digit destroys the boundary the next rule needs — so a redacted name immediately followed by an
identifier glued the placeholder to the digits and the identifier passed through intact, with nothing
raising. Separately, `\b` treats `_` as a word character, so an id embedded between underscores was
untouched; that is where a real node id was still sitting after the hyphen rule was added.

**Fixed.** Shapes before literals, and every boundary is a character-class lookaround. **Covered by**
`a compound identifier is replaced whole, never half` and the corpus scan.

*A footnote worth keeping.* The lookahead was first written `(?![\d.])`, which rejects an identifier
at the end of a sentence — and the corpus writes them that way. Two revisions, in the same sitting,
to get one lookaround right.

### AC2-5 · CONFIRMED · Placeholder numbering leaked a rank over the real values

Numbering followed sorted order, so the index *is* a rank: given two anchors whose real values are
known — and AC2-1 published ten — every placeholder numbered between them is bracketed to the numeric
band between those values. A handful of anchors constrains hundreds of ids.

**Fixed.** Numbering by order of first sight over a sorted file walk: reproducible, and saying only
"seen earlier". A hash-derived scheme was considered and rejected — node ids are small integers, so
any pseudonym derived from one is brute-forceable by whoever guesses the id, which is everyone.
**Covered by** `placeholder numbers are order of first sight, not rank among values`, which asserts
the smallest value is *not* the first placeholder.

### AC2-6 · CONFIRMED · The mapping guard had two working bypasses

Both executed against the real function, not inferred. A **symlink** into the repository was accepted,
because `resolve()` does not follow links — the mapping would have landed in the working tree, one
`git add -A` from full reversibility. And a **case-varied** in-repository path was accepted, because
the comparison was byte-exact and this repository lives on a case-insensitive filesystem.

**Fixed.** `realpathSync` on the nearest existing ancestor, and a case-folded compare, with the
requested path checked as well as the resolved one. **Covered by** `a symlink into the repository is
refused` and `a case-varied in-repository path is refused`.

### AC2-7 · CONFIRMED · Every gate was blind to AC2-1, 2 and 3 by construction

- `tests/representation/empirical-corpus.test.ts` reused the sanitizer's own regexes. That is a
  tautology: it can only ever confirm the sanitizer replaced what the sanitizer knows how to find.
- `tools/identifier-scan.ts` ran its hyphen rule only over *paths*; its content rules were
  colon-only. Its `TEXT_EXTENSIONS` omitted `.sha256` and `.xml`, so a checksums manifest carrying
  real ids on 21 lines was never opened. A dotfile has `lastIndexOf('.') === 0`, so `.gitignore` —
  the file the path rule was written from — was never opened either.

**Fixed.** The corpus scan is rewritten with independently authored, deliberately **wider** patterns,
plus a test asserting it never imports the tool's. The identifier scan gained a hyphen-in-content
rule and a truncated-hex rule, reads dotfiles and the two missing extensions, and reads paths for
every file rather than only readable ones.

Both new rules are narrowed against the false positives that would have retired them within a week:
UUID groups are node-id-shaped and this repository *requires* UUIDs (INV-02), and prose ranges are
too. The narrowings are a leading-digit rule, a seven-digits-across-the-pair rule, and an
`excludeWithin` for hyphen-separated hex runs — each with a falsifier and a must-not-fire case.

### AC2-8 · CONFIRMED · An abbreviation of a tracked value is not a disclosure, and the suppression lived in one entry point

The truncated-hex rule fired on a document abbreviating a hash printed in full eight lines above it.
Whether an abbreviation discloses anything is a fact about the **set** of documents, and the
suppression was written into `scanRepository` only — so `scanText`, which another test calls
directly, disagreed with it.

**Fixed.** `scanDocuments` is the shared path both entry points go through. **Covered by**
`tests/plugin/owner-docs.test.ts`, which now passes both documents together.

### AC2-9 · CONFIRMED · A real key prefix in four tracked files, pre-existing

A 40-hex variable-key prefix whose full value exists only in the untracked corpus, in
`docs/phase1-handoff-evidence.md`, `docs/v1-baseline-manifest.md`,
`tests/fixtures/active/resolver-ground-truth.json` and `tools/build-baseline-manifest.ts`. All four
are prose provenance notes, not load-bearing data.

**Fixed** by redaction in the working tree, which is the treatment AL-6 already established. The
published history is untouched, per the AL-4/AL-5 ruling.

---

## Part 2 — structural validation

### AC2-10 · CONFIRMED · The gate anchoring was lexical while claiming to be structural

`expected_schema_path_contains` was matched with `includes()` per segment, independently and
unordered. Several segments are a single character, so `['allOf','2','then',…]` was satisfied by
`#/allOf/12/…`, `#/allOf/20/…` and `#/allOf/32/…` alike. This file's own header claimed the assertion
existed so that correcting the schema for strict mode "could not have silently moved a gate" — and a
gate moving from `allOf/1` to `allOf/21` passed.

This is the `JSON.stringify`-replacer defect this project already paid for once: an assertion that
looks structural and is lexical.

**Fixed.** Segments are matched as a **contiguous run of path segments**. Making it strict exposed
that several recorded gates were wrong and had been passing on the substring soup; every one was
re-derived from the validator's actual output and corrected. **Covered by** `containsRun` and the
thirteen re-anchored fixtures.

### AC2-11 · CONFIRMED · An enforced schema gate that no rule declared

`#/allOf/3` — `readinessStatus == ready_for_production` requires a `1.0.0` version and an approved
status — is enforced by the schema and was declared by nothing. That is D-5's **third** direction: an
enforced rule nothing accounts for, and the one direction the bidirectional check was not looking in.

**Fixed.** Declared as `REP-22`, with fixtures in both directions, and `CV-10` in the ledger now
names three descendants rather than two.

### AC2-12 · CONFIRMED · REP-03 was half-tested, and rule-id-level coverage cannot see that

REP-03 has two clauses — zero blockers **and** a resolvable confirmation reference. Only the blockers
clause had a fixture. The bidirectional coverage check works at rule-id granularity, so a rule with
two clauses passes on one.

**Fixed.** A second negative for the confirmation clause, and `SCHEMA_TYPE_MISMATCH` added to REP-03's
declared codes.

### AC2-13 · CONFIRMED · REP-18 could not fire on any production contract, and its positive evidence was a document that violates it

Three findings that are one. `LOGIC_BEARING_FIELD` is `/\/detectionCondition$/`, and a `0.4.1-draft`
contract has no such field — MB-7 removed the rule catalogue. So over every document the production
schema can describe, the rule degraded to exactly the whole-leaf equality that **is** D-4.

Its registry statement claimed substring matching *anywhere in a contract*, which was true of no
promoted contract. And its declared positive fixture was `findRetiredVocabulary(theProductionSchema)`
— a document whose own text reads "No magic strings such as `__treatment__`", which is
`RETIRED_VOCABULARY[0]`. The positive evidence for REP-18 was a document containing retired
vocabulary, passing because the equality branch is what ran.

**Fixed** three ways. The statement now says what is enforced: substring inside an interpreted field,
equality everywhere else. The positive is a real v0.4.0-shaped catalogue whose conditions are written
in live vocabulary, paired with a twin differing by one token. And a third test states the **limit**
explicitly — that over a 0.4.1 contract only the equality half applies, and that this is correct
rather than degraded, because REP-09 confines all prose to `narrative` and nothing reads it.

### AC2-14 · CONFIRMED · Ten declared error codes were emitted by nothing; eight emitted codes were declared by nothing

The registry's `error_code` was fiction for half its rows: ten `REP_*` strings occurred exactly once
in the repository — in their own declaration. Schema-owned rules are enforced by ajv, which emits the
`SCHEMA_*` vocabulary, and the fixture index recorded *that*. Two accounts of one fact, each
separately green. Going the other way, eight codes were emitted by real code paths and named in no
row, one of them with no test at all.

**Fixed.** `error_codes` is plural and observed rather than invented, reconciled in **three**
directions: against the fixture index, against the literals in `src/representation/**`, and back
again — so neither a dead code nor an unwitnessed one survives.

### AC2-15 · CONFIRMED · `owner` and `enforced_by` were two accounts with nothing binding them

Changing a rule's `owner` to another legal `ENFORCEMENT_OWNERS` member left both existing tests
passing while the emitter kept stamping the old one.

**Fixed.** `enforced_by` is typed as `EnforcementOwner` rather than as one literal, and a test
reconciles emitter and registry per code at the source. Schema-owned rules are exempt by nature — ajv
violations carry no `enforced_by` — and a companion test asserts a schema-owned rule declares only
`SCHEMA_*` codes, so the exemption is stated rather than assumed.

### AC2-16 · CONFIRMED · The layout-strategy vocabulary was declared three times, agreement asserted for one

`LAYOUT_STRATEGIES`, `layoutRepresentation.strategy` and `ruleTarget.requiredStrategy`, with no
`$ref` between the last two. A fourth strategy added to the covered copy would have passed the
agreement test and made REP-12's D-3 guard silently unexpressible for it.

**Fixed.** `$defs/layoutStrategy`, referenced from both, plus `$defs/layoutRepresentationId` for the
`^LR-` shape which was duplicated the same way. **Covered by** `the strategy enum is declared once
and referenced, never repeated`, which counts occurrences in the document.

### AC2-17 · CONFIRMED · One schema document defined `scopeType` twice with disjoint vocabularies

`$defs/scopeType` and `ownerConfirmationRecord.scopeType`: same field name, nine values between them,
one in common. A resolver transcribing "the scopeType vocabulary" was transcribing one of two, and
nothing said which.

**Fixed** by renaming the owner-confirmation pair to `confirmationScopeType` / `confirmationScopeRef`.
One name, one meaning.

### AC2-18 · CONFIRMED · The semantic validator's namespace map fails *silent* where the resolver fails loud

Both transcribe the schema's property and key names. If a key drifts, the resolver's id set empties
and every target stops resolving — loudly. The semantic validator's filter drops every row,
`duplicates([])` is `[]`, and a contract with duplicate identifiers reports clean. A duplicate check
that has quietly stopped checking is D-5's shape in another file.

**Fixed** two ways: a test reconciling `NAMESPACES` against the schema — which is the real guard,
since the schema closes every object so only the *checker* can drift — and a runtime
`REP_NAMESPACE_KEY_UNREADABLE` that reports the check did not run rather than that it passed.
Mutation-confirmed: renaming one key fails the agreement test.

### AC2-19 · CONFIRMED · The barrel's internal directory list was declared four times

ESLint config, scan regex, test, and the filesystem — with agreement asserted only between the two
hardcoded copies. A fifth directory under `src/representation/` would have been permitted by both
halves of the BP-9 boundary with every test green.

**Fixed.** Ground truth is the filesystem; both enforcers are checked against it and the hardcoded
list is gone. Mutation-confirmed by creating a fifth directory.

### AC2-20 · CONFIRMED · The boundary scan could not see a dot-directory, and never scanned four tracked surfaces

`entry.startsWith('.')` skipped whole *directories*, not just dotfiles, so `src/.hidden/` was
invisible — cycle 1's planted-file shape, one directory deeper. And `SCANNED_DIRS` omitted
`commands/`, `skills/`, `.claude-plugin/` and every root-level file, including `eslint.config.js` and
`.gitignore`.

`research-corpus-read` also read past three real forms: `readFile` and `open` were not in its
alternation, `[^)]*` stopped at the first inner `)` so a nested `join(getRoot(), …)` hid one, and in
markdown a runnable line matched nothing.

**Fixed.** Only explicitly skipped directories are skipped; four surfaces added; the call pattern runs
to the statement end. Markdown gets its own rule that fires **only inside a fenced block** and only
for consuming verbs — a fenced `git status` showing the corpus untracked is evidence it is *not* a
dependency, and the first version of that rule flagged it. Each widening has a falsifier.

### AC2-21 · CONFIRMED · `covered_by` was a substring check on file text

It passed if the name appeared in a comment, inside a `test.skip`, or in any unrelated string. Eight
rows depend on it — including both REP-18 rows, which is what let AC2-13 stand while the registry
reported REP-18 covered in both directions.

**Fixed.** Names are extracted from actual `test(...)` calls; `test.skip` and `test.todo` are
deliberately not matched. Mutation-confirmed.

### AC2-22 · CONFIRMED · The registry had no size floor

Nine assertions iterate it, and every one is vacuously true over an empty array. The sibling registry
pins a floor and the ledger pins an exact count; this had neither. **Fixed** — floor of 22.

### AC2-23 · CONFIRMED · The promotion tool printed an unconverged document and exited 0

An unconverged document carries a recorded hash that does not match the bytes beside it — a hash that
validates nothing. The header called that a condition which "must be visible"; visible meant one line
of stdout on a manual run. **Fixed** — it exits 1 and names them on stderr.

### AC2-24 · CONFIRMED · A fixture named a real repository file beside a fabricated hash

`rep-08-pinned-artifact-target.json` pinned `tests/representation/fixtures/positive/minimal-contract.json`
with 64 `b`s, and the index claimed "the path here resolves in this repository" — which nothing
asserted, and which a schema-validated fixture never reaches anyway. A real path with a fake pin, in
a fixture set whose subject is unpinned artifact references. **Fixed** — the path is now plainly not a
repository file, and the row says which rule actually checks pins.

### AC2-25 · CONFIRMED · A contract *target* accepted a value the schema and the registry both forbid

The resolver let a `contract` target resolve by the contract id. A *scope* may do that — the schema
says so — but a target is pinned to the literal `self`. Harmless only while the schema stays stricter
than the resolver. **Fixed** — the two vocabularies are separated, with a test covering both.

### AC2-26 · CONFIRMED · Two counts in the decision log that nothing recomputed

MB-8's "thirty-six … twenty … sixteen" reproduces under no counting method — 26 and 9 by unique ajv
message, 22 and 8 by subschema location. MB-9's "nineteen of the twenty-nine" has never been true;
the ledger is 21 pending, 7 promoted, 1 partially promoted. MB-8 also claimed "every affected gate
carries a negative fixture", which is false by an order of magnitude.

This is the D-9 class — a hand-written count nothing recomputes — inside two rulings *about* that
class of defect. **Fixed** by removing the numbers rather than restating them, and by adding a test
that counts the ledger dispositions. What the rulings now claim is what the artifacts support.

### AC2-27 · CONFIRMED · Three claims in the provenance document the artifact did not support

"No per-kind counts that could act as a fingerprint" — the highest placeholder index of each kind *is*
that count. "No tracked file names the research directory" — twelve do, and naming it is how the rules
about it are written down. And the sanitization rule list omitted the three shapes AC2-1…AC2-3 added.

**Fixed.** Each correction quotes the old claim and names it false rather than silently replacing it.
The cardinality disclosure is now stated as inherent, with the reason a value-derived scheme cannot
replace it.

### AC2-28 · CONFIRMED · AC-28 from cycle 1, root-caused and half-fixed

The `artifact` table's primary key is `(run_id, artifact_sha256)`, and both inserts in
`appendEventAndPutArtifact` were wrapped by one catch classifying **any** `UNIQUE|PRIMARY KEY` failure
as a CAS conflict. So a run re-composing **byte-identical** output — a repair loop producing the same
artifact, or a retry — tripped the artifact key, was told `cas-conflict`, and was instructed to
"re-read `getMaxSeq` and retry". The retry recomputes the same hash and fails identically.

**Fixed** for the two contained defects: the insert is idempotent on identical content, and
`cas-conflict` is claimed only for a `run_event` constraint, so a third write added to one of these
transactions cannot inherit the label. Two tests, one for each direction.

**Not fixed, and still open:** the third defect, that a CAS conflict is refused as `G-20b` at ~14 call
sites while §11.0.3 defines G-20b as *append failure* and requires the run to terminate
`hard-dependency-failure`. A CAS conflict is not an append failure, so this is a contract-vs-code
disagreement over a locked contract (PD-1). It needs a work package and an owner decision, not an
audit-cycle patch. Carried forward as **AC2-OPEN-1**.

### AC2-29 · CONFIRMED (mine) · B1's acceptance item had no test

B1 requires the eleven v0.4 changes to be carried, and nothing checked it. **Fixed** —
`tests/representation/v04-changes-carried.test.ts`, twelve structural tests, none of which greps the
schema's own `description` fields for a change id, because a document asserting a change was made is
not the change.

*And a defect in my own test.* The C-11 assertion said `buildFrameId` is optional; the schema makes it
**required and nullable**, which is the stronger arrangement — every set must state whether it has a
build frame, and `null` is a real answer rather than an absence someone has to interpret. The
assertion was wrong, not the schema. That is the "nine of eleven failures are test defects" pattern,
on schedule.

### AC2-30 · CONFIRMED (mine) · The path rule read only text-extension files

Added in B4, `node-id-in-path` ran over `collectFiles`, which filters to text extensions because it
exists to read *contents*. The path rule reads no contents, so a screenshot named for the node it
shows was invisible — the largest class of offender the rule was written for. **Fixed** —
`collectPaths` returns every path.

---

## Recorded, not fixed

| Id | Finding | Why not now |
|---|---|---|
| **AC2-OPEN-1** | A CAS conflict is refused as `G-20b`, which §11.0.3 defines as *append failure* requiring `hard-dependency-failure` termination. ~14 call sites. | A contract-vs-code disagreement over a locked contract (PD-1). Changing termination semantics needs its own work package and tests; changing the contract needs an owner decision. |
| **AC2-OPEN-2** | The client's name appears **186 times in 62 tracked files** — the npm package name, every coordinator schema `$id`, six environment-variable prefixes, the CI workflow, the README. | Architectural and pre-existing. It is the load-bearing API surface of the package, not a stray identifier, and renaming it is a breaking change across the whole repository. **Escalated to the owner**: this is the single largest disclosure on a public remote, and it is not in the corpus at all — it is in the places no BP-5 check has ever looked. |
| **AC2-OPEN-3** | `docs/v1-baseline-manifest.md` carries 39 real SHA-256 over real client bytes and 44 real artifact paths, regenerated mechanically by `tools/build-baseline-manifest.ts`. | This is AL-4, already escalated and ruled "report, do not rewrite". Quantified here because cycle 2 was asked to; the ruling stands. |
| **AC2-OPEN-4** | The promotion collects file-key literals only from `.json`, only via one field spelling, with no minimum length. A key in Markdown, in a URL, or under `fileId`/`key` would never be collected. | Latent — it did not fire. Fixing it properly means a shape rule for a 22-character base64 key, which needs a false-positive study this cycle did not have room for. |
| **AC2-OPEN-5** | `representation-deep-reach` misses `from '../representation/validation'` (no trailing slash) and a `@/` path alias. | Latent: no path aliases are configured and `moduleResolution: NodeNext` rejects extensionless directory imports. Becomes live the day either changes. |
| **AC2-OPEN-6** | Builder inputs, intake refusals and extraction — three of cycle 2's five focus areas. | Track D is not built. Uncovered, not passed. |

---

## Rejected

Reported because a cycle that reports only confirmations is not evidence of a clean system. Each was
suspected, checked against the artifact, and disproved by what is named.

- **`TARGET_KINDS` vs the schema enum** — genuinely asserted, order-sensitive, element-by-element.
- **`$id` / version / schema document version** — asserted three ways including a round-trip and a
  null-rather-than-guess test. The D-12 lesson correctly applied.
- **The 22-character file key** — every `fileKey` value extracted from the real corpus, grepped
  against all tracked files: zero hits. No `figma.com/(file|design|proto)/…` URL in any tracked file.
- **The 64-hex accounting claim** — re-verified independently rather than by re-running its test: 222
  occurrences, 192 matching a promoted file, 30 matching the `unpromoted:` marker, zero unaccounted.
- **The mapping file** — not tracked anywhere; only the three source files naming the *variable*.
- **Screenshots and research tooling** — none promoted.
- **The aggregate corpus hash** — recomputed over all 46 files: matches.
- **"52/52 fixtures", "185 files", D-9's "ten rows against eleven", D-11's "lines 1 and 8", MB-15's
  "ten exemptions", MB-16's "four failures / four passes", MB-7's and MB-8's file:line citations** —
  every one resolves.
- **All twelve reference and all six semantic negatives fail for exactly one reason** — each produces
  exactly one violation, at the intended code, attributed to the intended rule and owner.
- **`try/catch` around `statSync` in the boundary scan** — reachable only if a scanned directory is
  missing, and the reach test then fails. Nothing hides there.
- **REP-19's "and from every other probe"** — implemented; the reviewer had read only the subject
  comparison.
- **The 64-hex and bidirectional-coverage checks passing vacuously** — both carry explicit
  non-vacuity guards, and both are live.
- **Shared `/g` regexes leaking `lastIndex`** — `matchAll` clones the regex.
- **`ae40356a…` in the M1 verification record** — hashes a tracked synthetic fixture, absent from the
  real corpus. Allowlisted with that reason.

---

## Gate

`npm run typecheck` · `npm run lint` · `npm run build` · `npm run test:source` — **1020 tests, 0 fail,
exactly 7 skips**, floor 1020. `sourceOnlyExpectedSkips` unchanged at 7. `npm run test:evidence` with
the pack present: 4 pass; with it absent: 4 failures naming the variable.

The corpus was re-promoted and verified by a check written from the **real values** rather than from
the sanitizer — every mapping value in both notations, every shape authored independently and
deliberately wider than the tool's. Zero.
