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
