# Phase 1 Decision Log

Every entry is **closed**. Under the governance valve, a closed decision is recorded once and is not
re-litigated on this phase; reopening one requires new evidence, named here as the revisit trigger.

Inherited closed decisions D1–D5 live in P1-FINAL §6 and are not repeated. This log covers decisions taken
during planning and implementation of Phase 1.

---

## D-A · Repository location

**Decision.** The Phase 1 package lives at `/Users/apple/GIT/claude-plugins/claude-figma-component-plugin`
(remote `hamid-raza-mughal/claude-figma-component-plugin`) — **outside** the OneDrive-synced folder. The
curated JSON and all v1 design artifacts stay in OneDrive and are read through typed configuration; they
are **not** copied into the repository.

**Why.** `node_modules` is thousands of small files and the derived index is a live SQLite database. Both
inside a sync client invite sync thrash and database corruption. The project's own control layer already
mandates this separation for its memory database, and P1-FINAL §5.6's no-hard-coded-path rule makes the
split free.

**Consequence.** A duplicate clone that existed at `Manage_DS_Components/DS_Plugin/` was removed by the
user on 2026-07-29; `find` confirms no `.git` remains anywhere under the artifact bundle. Exactly one
working tree tracks `origin/main`.

**Revisit trigger.** A requirement that the index be shared across machines. That would be a hosted-resolver
decision, explicitly out of Phase 1 scope, not a relocation.

## D-B · Git

**Decision.** Git is used, in the non-synced repository only. Small reviewable commits after each
work-package gate passes.

**Operational rule discovered during implementation.** A git read from a mounted sandbox left a
`.git/index.lock` the sandbox could not unlink, which blocked commits until cleared manually. **Run `git`
from the host / Claude Code, not from a mounted session.** Consistent with P1-FINAL §1's stated execution
environment.

## D-A.1 · Repository layout *(defaulted, logged)*

**Decision.** Phase 1 code sits at repository root: `src/`, `schemas/`, `tests/`, `docs/`, `tools/`.

**Why not a monorepo shape.** `packages/coordinator-core/` was considered. Root-level matches P1-FINAL §10
as drawn and is the smallest correct thing. The repository *name* anticipates the eventual plugin, but
P1-FINAL §7.2 and §10 forbid packaging in this phase, so **no plugin manifest, marketplace file, agent
frontmatter, or command file is created.** Those land in a sibling directory in a later phase.

**Revisit trigger.** A second publishable package needing independent versioning. Cheap before WP2,
expensive after.

## D-C · Resolver port and cross-check

**Decision.** The Python prototype's ranking configuration is ported to TypeScript. The prototype is kept,
unchanged apart from two ground-truth corrections, and used **once** as a reference answer sheet to verify
the port. Nine binding requirements:

1. `resolver-prototype/` preserved unchanged beyond the corrupted `expected` entries.
2. Both implementations read **one shared** corrected ground-truth fixture.
3. Comparison asserts **case-specific rank windows**, not byte-identical ordering.
4. Also compares candidate **eligibility**, per-rule **score contributions**, **total scores**, and
   **materialized record IDs** — the dimensions where tokenizer differences cannot apply.
5. TypeScript adds a stable tiebreak: score → **normalized path** → **immutable record ID**.
6. `unicode61` tokenizer configuration pinned explicitly; **SQLite library version recorded in index
   metadata**.
7. recall@3 / recall@5 reported as **fractions with explicit `n`** — no percentages, no thresholds.
8. On Gate 2 pass, the committed TypeScript ground-truth fixtures become the permanent regression baseline.
9. The Python reference is then **frozen and archived** — removed from active CI, never deleted.

**Why.** The index schema needed no iterations; the ranking configuration needed three, and those three
(`sys/` +4 / `ref/` −3, 6-character prefix stemming +2, wrong-numeric-value −4) are what produced the
measured recall. A transcription error in any one lowers recall silently, and Gate 2 has no prior to fail
against. Requirement 3 exists because requirement 5 deliberately introduces a tiebreak the prototype lacks
— demanding identical ordering would produce false failures and the test would be discarded.

**Honest limit.** This catches transcription error, not overfitting to twelve cases. Small-`n` remains
small-`n` until Phase 2+ adds ground truth.

**Revisit trigger.** None for Phase 1. The cross-check retires itself at Gate 2 by design.

### D-C.1 · Three recorded divergences from a pure port

The cross-check bar is "at least the ported baseline", not "identical". Three places where the TypeScript
port deliberately does more than the prototype. Each is recorded because a silent improvement is as
untraceable as a silent regression.

| # | Divergence | Evidence | Effect |
|---|---|---|---|
| 1 | **1-hop alias resolution.** The prototype's `float(first)` yields `None` for any `VARIABLE_ALIAS` value. | Measured: 169 of 504 variables hold at least one alias, and **max chain depth is 1**. Numeric coverage rises from **142 → 282** variables. | The exact-value rule can now fire for records where it previously could not. Depth capped at 4 with cycle detection, so a future deeper or cyclic export degrades to "unresolved" rather than hanging. |
| 2 | **`PATH_SEGMENT_EXACT`** — a term matching a whole slash component outscores a substring match. | `sys/dark/expressions/warning` and `.../on_warning` both *contain* "warning", so they tied and the prototype's top-1 fell out of arbitrary SQLite row order. | Case 9 moves from a lucky tie to a win on merit. Matched on `/` components, not `[/_-]` segments — splitting on `_` would make `on_warning` contain "warning" and the tie would survive, discarding the foreground/background naming convention. |
| 3 | **`PATH_NUMERIC_MATCH` / `PATH_NUMERIC_MISMATCH`** — bare integers in the request matched against numeric path segments. | `[a-z_]{3,}` discards digits, so "warning 6 opacity" carried nothing distinguishing `opacity_6` from the other **nine** members of its family. All ten tied. | Case 4 moves from a lucky tie to a win on merit. Only scored when the request has a bare number *and* the path has a numeric segment, so a path without numbers is never penalised for a property it never claimed. |

**The finding that justifies all three.** The prototype's headline of 9/12 top-1 and 12/12 top-5 contained
**two ties resolved by chance** — it sorts by score with no `ORDER BY`, so equal scores fell out in whatever
order SQLite returned. Adding the deterministic tiebreak required by §12 *initially lowered* measured recall
to 9/12 top-1 and 11/12 top-5, because the luck was removed and nothing replaced it. The two new rules use
information the request actually contained and the prototype discarded.

**Measured result:** recall@1 **11/12**, recall@3 **12/12**, recall@5 **12/12** (n=12), against a prototype
baseline of 9/12 top-1 and 12/12 top-5.

**Remaining known miss.** `subhead/sm/emphasized` ranks 3 for "small emphasized subheading": the
discriminator is the abbreviation `small` → `sm`, which neither implementation maps. Recorded as a real
limitation with a window of 3 rather than papered over — an abbreviation table is a candidate improvement,
not a defect fix.

**This is why the cross-check was worth building.** Without it, the port would have reported 9/12 and 11/12,
matched a mis-remembered baseline of "9/12 and 11/12", and passed — while having silently lost a case.

## D-D · Interaction-state coverage

**Decision.** **Flag, do not block.** Missing interaction states are reported as findings and **cannot
independently fail a run.** The unverifiable "eight-state reference" is replaced by an authored project
artifact, `docs/interaction-state-taxonomy.md`.

**Why.** The cited reference was never enumerated anywhere in the project — `coordinator_agent_spec.md`
L493 points at a "project framework Section 16" that does not exist, and L513 already logs it as open. It
was a project convention described as a domain standard. No external standard rescues it: WCAG 2.2 AA
covers focus visibility and target size but enumerates no interaction-state set. **The count was also
wrong** — the agreed set is five baseline plus six conditional states, eleven in total, so "the eight-state
reference" was unverifiable in both source and number. A gate whose trigger cannot occur is worse than a
decision.

**Five locked consequences.**

1. P1-FINAL §5.2's condition **struck**, superseded wording retained inline, registered as `SA-23`.
2. Coverage stays visible in findings and on the rubric; cannot independently fail a run.
3. The **variant/property model is preserved** in `SemanticBrief` and `SemanticDelta` — without it the
   spec's own `modify` example (`state: [default, hover, pressed] → [+disabled]`) is inexpressible and the
   `modify` route regresses against v1.
4. The obsolete Reviewer 0–100 weighted model is **replaced** by the already-locked anchored 1–5,
   no-scalar policy.
5. Promotion to gating requires a later recorded decision supported by **a published anchor set and pilot
   evidence** — not a re-reading of the policy.

**Open input, non-blocking.** The applicability-by-component-class table is drafted and marked
`draft — awaiting design confirmation`. Because coverage is advisory, a draft table cannot cause a wrong
pass or fail.

**Revisit trigger.** Pilot evidence showing how often coverage findings would have fired, plus a published
anchor set. Then, and only then, gating is a recordable decision.

---

## Implementation choices made under P1-FINAL §1

> "When a detail is not specified here, choose the smallest runtime-neutral implementation that satisfies
> the contracts and tests. Record the choice in the Phase 1 decision log."

| # | Choice | Reason | Runtime-neutral? |
|---|---|---|---|
| I-1 | **`node:sqlite`** for the derived index, not `better-sqlite3` | Verified by execution: Node 22.22.3 bundles SQLite **3.51.3 with FTS5 working**. Removes a native compile step and a dependency. Satisfies §5.6 more cleanly than the alternative. | Yes — standard library |
| I-2 | **`node:test`** as the test runner | Built in; no Jest/Vitest dependency. §18 requires a deterministic suite, not a specific framework. | Yes |
| I-3 | **Native TypeScript type stripping** for execution; `tsc` for typecheck and build | Verified working. Avoids a transpiler dependency. Requires `erasableSyntaxOnly`, so no parameter properties or enums in source. | Yes |
| I-4 | **Ajv 2020** with `validateFormats: true` | §11.5 requires Draft 2020-12, format **assertion**, and closed objects. Format assertion is the setting whose absence let a non-UUID `run_id` pass the v1 schema. | Yes |
| I-5 | `engines.node >= 22.18.0` asserted in `package.json` | The built-in-sqlite and type-stripping assumptions fail loudly rather than silently on an older runtime. | Yes |
| I-6 | Portability enforced by a **static source scan test**, not only by lint | The rules are absences (no `claude -p`, no hard-coded path, no network, no Figma write, no plugin coupling). An absence claimed in prose rots; a test does not. | Yes |
| I-7 | Baseline manifest is **generated**, not typed | 39 hashes transcribed by hand is a defect waiting to happen, and a generated manifest can be re-run to detect drift in the artifact bundle. | Yes |
| I-8 | `*.db` git-ignored | The index is derived and rebuildable; committing it would create a second authority (§13.2). | Yes |
| I-9 | ajv/ajv-formats CJS interop normalised at the import site | Verified by execution: ajv's *named* `Ajv2020` is the constructor while its default is the module namespace; ajv-formats' default is callable. A known version-fragile boundary, tolerated in one expression rather than asserted. | Yes |

## Defaulted sub-choices *(logged, not re-litigated)*

| Choice | Default | Override cost |
|---|---|---|
| Candidate ceiling | 3 default / 5 maximum, per P1-FINAL §13.4.1 — an explicit override of the token-model doc's 7–10 broadening for description-bearing entries, justified because descriptions cover only 18% of entries and are formulaic | Low before WP2 |
| `Archive.zip` | Hashed as a single entry, left closed, with a test that no active glob reaches inside it | Low |
| Duplicate `warning-toast-run-001.md` | `Runs/` and `Specs/Outputs/` copies are byte-identical (same SHA-256); both retained as history, neither active | Trivial |
