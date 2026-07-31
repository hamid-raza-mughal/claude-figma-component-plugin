# Phase 2 Decision Log

Phase-2-scoped, parallel to `docs/phase1-decision-log.md` (D-A…D-G, Phase 1 only — v4 §F's
note that Phase 2 decisions get their own log, since appending here would make the Phase 1
log describe decisions taken after its own gate closed). Each entry: the ruling, why it is
the smallest safe choice, and its revisit trigger. Recorded once; not re-raised absent new
implementation evidence exposing a concrete contradiction.

---

### PD-1 · The v4 lock

**Ruling.** Revision 4 of `docs/host-turn-workflow-contract.md` is approved and locked as
the normative Phase 2 implementation contract, authorizing the four registered §11.7
widenings and the start of Phase 2 work. Given in chat 2026-07-31 by the repository's user
(git identity: Hamid Raza), in these words:

> Revision 4 of `docs/host-turn-workflow-contract.md` is approved and locked as the
> normative Phase 2 implementation contract. This is the governance-valve decision
> authorizing the four registered §11.7 widenings and the start of Phase 2.

**Why this is the record the contract's own process requires.** v4 §F's Sequencing clause
states that if review rejects the replacement invariant, the contract must be rewritten
"before any code is committed against it" — so the four §11.7 widenings, and every Phase 2
work package that depends on them, needed exactly this ruling recorded before WP1 could
start. This entry is that record.

**Revisit trigger.** Implementation evidence exposing a concrete contradiction in revision
4's text — not a general prose re-review, and not a preference. Per the user's explicit
instruction, no pass-03 ledger and no further general review are in scope; contract work is
frozen except where a failing implementation test names a specific contradiction.

---

### PD-2 · G-20a vs G-20c for witness-classified `lost`/`foreign` stores

**Question.** §11.0.7's four-state table cites "G-20a" for both the `lost` and `foreign`
witness classifications. §12.1's Guard-rule list separately defines **G-20c**, scoped
exactly to "any run-bearing tool when the store classifies as `lost` or `foreign`." §18.9's
own closure text agrees with G-20c ("witness without database → lost, refused by G-20c;
database without witness → foreign, refused"). The table and the rule list disagree on the
label.

**Ruling.** Implement **G-20c** as the refusal for both witness-classification failures.
**G-20a** stays scoped to plain store preflight failure — directory doesn't resolve, DB
won't open, or a committed write isn't readable after reopen (§11.0.1/§11.0.2) — which is
a distinct failure mode from "the store opened fine but its identity doesn't match what's
expected."

**Why this is the smallest safe choice.** G-20c is the newer, more specifically-scoped rule
(added in revision 4 alongside D-2, per §19), and two of the document's three
self-consistent citations (§12.1's rule definition, §18.9's closure prose) already agree
with it — §11.0.7's table is the one holdout, and it reads as documentation drift rather
than a deliberate second ruling. Treating G-20a as *also* applicable would give one failure
two refusal codes with no rule distinguishing when each fires, which is exactly the kind of
two-accounts-of-one-fact defect this contract otherwise goes out of its way to close (§11.1,
§5.3.1).

**Revisit trigger.** None expected from implementation; a future contract revision should
correct §11.0.7's table text to read G-20c, but that is documentation, not a code decision.

---

### PD-3 · The `run_event.kind` vocabulary

**Question.** The contract names two load-bearing event kinds explicitly —
`source-invalidated` (§2.11.1, enforced by G-21) and `handoff-built` (§11.2, feeding §9.2.1's
value 4) — but never closes the full set. Every other §10 transition needs a recorded event
kind too, and nothing enumerates them.

**Ruling.** `run_event.kind` is a closed union **generated one-to-one from
`src/registry/transitions.ts`'s own row list** — one kind per transition-table row — plus
the two named additions, which are appended to a run's log without necessarily changing its
current phase. A test asserts every §10 row has exactly one registered kind and every
registered kind maps back to exactly one row (or one of the two named additions).

**Why this is the smallest safe choice.** Hand-maintaining a separate kind enum invites the
exact defect this contract keeps finding and closing (§11.1's "no materialized state," D-F's
"derivation so the two cannot drift," §17.3's structural test that the registry is data and
nothing branches around it) — a second account of the same 18-row fact, checked nowhere
against the first. Generating it from the one normative transition registry the user's own
rules require removes the drift by construction rather than by discipline.

**Revisit trigger:** a future §10 amendment that adds or removes a row — the generated kind
set updates with it, by construction, with no separate edit.

---

### PD-4 · The Guard's caller-identity literal

**Question.** `'controller'` is a naming leftover from a retired "Runtime Controller" role
(SA-32: no standalone Controller process is built; the concerns it would have owned are
retained in the Guard). §11.7 row 3 registers retargeting three sites —
`list-by-category.ts`'s `CALLER_CONTROLLER`, and the `ClarificationGap.owner` /
`Disclosure.owner` union member — to "the Guard," without specifying the literal string.

**Ruling.** One literal, `'run-guard'`, reused verbatim across all three sites **and** as
the new seventh `EnforcementOwner` value (§8.5, §12.1). `CALLER_CONTROLLER` becomes
`CALLER_RUN_GUARD = 'run-guard'`; the `owner` union member `'controller'` becomes
`'run-guard'` in both `ClarificationGap` and `Disclosure`; the stale "Phase 2 Runtime
Controller" docstring reference in `run-envelope.ts:6` is removed.

**Why this is the smallest safe choice.** §2.8's own discipline is "the registry is data,
not branches" — one string for one identity, reused everywhere that identity appears,
rather than inventing a second name for the same actor depending on which file is looking at
it. `'run-guard'` is also already the literal the contract itself uses for the enforcement
owner (§12.1), so no new vocabulary is introduced.

**Revisit trigger:** none — this is a naming choice with no behavioral content to drift.

---

### PD-5 · `ApprovalRecord`'s three new fields: literal `false` or `boolean`

**Question.** §7.4 shows Phase 2's approval record carrying `response_source:
'model-relayed'`, `verified: false`, `authorizing: false`. Should `verified`/`authorizing`
be typed as the literal `false`, or as `boolean` with Phase 2 code always writing `false`?

**Ruling.** `verified` and `authorizing` are typed `boolean`. `response_source` is typed as
a single-member literal union, `'model-relayed'`, extensible later the same way `RunType` or
`FailureClass` are — a closed set that widens by adding a member, not by loosening to a bare
`string`.

**Why this is the smallest safe choice.** G-9b is written as a **Guard-enforced runtime
refusal** — "any approval row with `verified` or `authorizing` true in Phase 2" — which only
does work if the type can represent `true` in the first place; a literal `false` type would
make G-9b's own refusal condition unreachable and untestable. D-7's stated revisit trigger
("HD-1 landing, which replaces the claim with verified identity and retires the exemption")
also anticipates a future phase legitimately writing `true`. Phase 2 code itself always
constructs `false`/`false`/`'model-relayed'`; G-9b is what makes that a enforced fact about
every Phase 2 run rather than an accident of what today's code happens to write.

**Revisit trigger:** HD-1 landing (per D-7) — at that point `authorizing`/`verified` gain a
real path to `true`, exercised through a different, verified `response_source` member.

---

### PD-6 · `closeRun blocked`'s reachability vs. the printed §12.2 table

**Question, surfaced while building the transition registry (WP2), not by general
review.** §10's last row — `closeRun blocked` on a `source-invalidated` event — is one of
the two rows revision 4 added. Its `From` column reads "any non-terminal," and G-21's prose
independently confirms `closeRun blocked` and `cancelRun` are "the only remaining exits" for
an invalidated run, naming no phase restriction. But the printed §12.2 tool-surface table
lists `closeRun` under only three phases — `validating`, `awaiting-clarification`,
`handoff-ready` — not under `received`, `preparing`, `drafting` or `awaiting-approval`. A
run can genuinely be sitting in any of those four when a refresh invalidates it: §8.4 notes
drafting has no detectable deadline, and `awaiting-approval` is a named pause phase, so
`source.refresh` racing either is an ordinary case, not an edge case requiring a special
ruling.

**Ruling.** §12.2.1 states its own derivation rule: "every phase-scoped tool appears here
iff §10 lists it as a trigger from that phase." The transition registry (`src/registry/transitions.ts`)
therefore derives the tool surface **mechanically from §10**, exactly as instructed — which
means `closeRun` is reachable from every non-terminal phase (to serve row 20's `blocked`
exit), not only the three phases the printed table shows. `src/registry/transitions.ts` is
the one normative source; the printed §12.2 table is that derivation's own output, and
where the two disagree the derivation wins, per the contract's own stated rule.

**Why this is the smallest safe choice.** This is not a new ruling — it is applying §12.2.1's
existing rule to a row (§10's last one) that was added in revision 4 without the printed
table being regenerated afterward. No behavior is invented; the registry's own equality
test (computed surface vs. a literal transcription of §12.2) is what surfaced the gap, and
resolving it means trusting §10 over a stale rendering of its own derivation.

**Revisit trigger:** none for code. A future contract revision should regenerate §12.2's
printed table from the registry so the two stop disagreeing in text.

---

### PD-7 · `prepareContext`'s candidate source for a `new` run

**Question, surfaced while wiring WP6.** `prepareContext` (§4.1) must return bounded
candidates, but for a `new` run there is no target and no semantic elements yet — those
are authored during `drafting`, which comes *after* `prepareContext`. The deterministic
query planner (`query-planner.ts`) needs `PlanRequestItem[]` — a `property` plus
`reference_text` per semantic element — which does not exist at this point in the flow.
Nothing in the contract specifies how `prepareContext` should form queries with no
structured signal to plan from.

**Ruling.** `prepareContext` calls `listByCategory` — already built and already
documented as "the capped escape hatch... for when the deterministic planner could not
form a safe narrow query" — across a fixed set of standard property categories (`color`,
`typography`, `spacing`, `effect`, `corner-radius`), capped at 5 candidates per category
rather than `listByCategory`'s own default cap of 25. The model then selects specific
`candidate_id`s from this bounded, low-confidence spread during drafting.

**Why this is the smallest safe choice.** This reuses a mechanism the codebase already
built and named for exactly this situation, rather than inventing a new broadening
heuristic or misusing `resolveBatch`'s per-item pipeline against ungrounded generic text
(which would produce lower-quality, less-attributable matches, since `resolveBatch`'s
scoring is tuned for a specific `reference_text` naming one property, not a whole
free-text intent compared against every property). The smaller cap (5, not 25) keeps the
payload proportionate to §13.5's "compact by contract" discipline.

**Revisit trigger:** `modify`/`audit` gaining a real target once FD-1…FD-4 are satisfied —
at that point, target-derived semantic elements can feed `resolveBatch`'s narrower,
item-level queries, and this ruling should be revisited for those routes specifically.
`new` has no target by definition (§2.4) and will keep needing this mechanism regardless.

---

### PD-8 · G-21 checked in `prepareContext`/`submitDraft`, not only the five named tools

**Question.** §2.11.2's literal text lists five tools G-21 refuses on a `source-invalidated`
run: `resumeRun`, `presentForApproval`, `recordApproval`, `buildHandoff`, `closeRun
completed`. `prepareContext` and `submitDraft` are not named, even though a run can carry
`source-invalidated` while sitting in `received`, `preparing`, or `drafting` — phases with
no detectable deadline (§8.4: "a hung drafting step is not detectable").

**Ruling.** `prepareContext` and `submitDraft` also refuse (citing G-21) when the fold
reports `sourceInvalidated: true`, matching `resumeRun`'s check. `submitDraft` additionally
gets this for free at the materialization layer — `materializeSelection`'s
`assertIdentityFresh` already refuses a candidate resolved against a superseded source
(`MATERIALIZE_STALE_SOURCE`/`MATERIALIZE_STALE_INDEX`) — but `prepareContext` has no such
built-in backstop, since it is the *first* thing to resolve against the index.

**Why this is the smallest safe choice.** The five named tools are exactly the ones that
matter *after* a draft or artifact already exists; the underlying principle — never let an
invalidated run make forward progress — is the same one G-21 exists to enforce, just
reachable one phase earlier than the literal list anticipated. Refusing here is consistent
with §2.11.2's own "nothing is ever silently re-pinned" rule; silently letting
`prepareContext` resolve fresh candidates for a run whose identity is pinned to a
superseded hash would be exactly that.

**Revisit trigger:** a future contract revision naming `prepareContext`/`submitDraft`
explicitly (confirming this reading) or explicitly excluding them (overriding it) — either
resolves the ambiguity this entry currently carries.

---

### PD-9 · A latent Phase 1 defect: `generateSchemaCard`'s real body fails its own leakage assertion

**Question, surfaced by WP6 integration, not by general review.** `src/ingestion/schema-card-generator.ts`'s
real output always renders `source_sha256: <hash>` and `index_version: <version>` into its
`SNAPSHOT` block (lines 58–59) — legitimate, necessary provenance: the card is telling the
model which snapshot it describes. But `src/coordinator/leakage-assertion.ts`'s
operational-field check (§15.6, check 5) flags **any** section containing a `field: value`
match against `OPERATIONAL_FIELD_NAMES` — except `output-contract`, which is exempted
because it *names* the forbidden fields in order to prohibit them. No exemption exists for
`schema-card`. Every existing Phase 1 test that exercises `assertNoLeakage` (`tests/unit/assembly.test.ts`)
uses a **hand-written** `SchemaCard` fixture whose body happens not to contain these
substrings — so this defect was never triggered before WP6 called the two real functions
together for the first time.

**Ruling.** `assertNoLeakage` gains a second, narrower exemption: the `schema-card` section
is exempt from the operational-field check for exactly `source_sha256` and `index_version` —
not the whole section, and not every field. The card's provenance header does not become
exempt from checks 1–4 (raw source bytes, sentinels, exact-record fields, inactive-route
content), and no other section gains any exemption.

**Why this is the smallest safe choice.** The check's purpose is to catch the model being
handed operational-shaped text it might echo back as if authored; the schema card is
read-only reference material the model never reconstructs or returns, structurally the same
justification the existing `output-contract` exemption already rests on. Widening the
exemption to the whole section, or to every `OPERATIONAL_FIELD_NAMES` entry, would hide a
genuine future leak (e.g. `approved_by` appearing in a schema card would still be worth
catching); narrowing it to exactly the two fields that are actually, legitimately present
keeps the check as strict as it was everywhere else.

**Revisit trigger:** a future schema-card field that is itself operational-shaped and not
one of these two — that should get its own named exemption with its own justification, not
a silent widening of this one.
