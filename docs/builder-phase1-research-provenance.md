# Builder Phase 1 — research provenance

What `tests/representation/fixtures/empirical/` is, where it came from, and what was deliberately
left behind. Written under BP-5, which permits **relative source paths and aggregate hashes only**:
no identifier values, no real-to-placeholder mapping, and no per-kind counts that could act as a
fingerprint of the source design system.

---

## What the corpus is

A deterministic pseudonymized promotion of the research package's **contracts, evidence artifacts and
probes**. It is tracked so the production validator can be proved against real-shaped data rather
than only against synthetic fixtures written to make it pass.

**These are v0.4.0-draft documents and they are not migrated to 0.4.1-draft.** That is deliberate.
They are the *before*: the corpus the production validator has to catch defects in (WP B5). Repairing
them here would delete the evidence and leave a green suite over nothing. `component-representation-
contract.json` still names three retired vocabulary tokens inside a rule's sentence (D-1); the
non-Button contract's `VR-1` still targets `LR-1`, a `list` representation, while the matrix is
`LR-2` (D-3); `probe-C-shared-build-frame.json` is still byte-identical to the contract it was
supposed to differ from (D-6); `v0.4.0-draft-change-plan.md` still declares two contradictory
statuses in its first eight lines (D-11). Each is asserted present by
`tests/representation/empirical-corpus.test.ts`, so a future sanitizer that quietly repaired one
would fail rather than pass.

## How it was produced

`tools/promote-representation-evidence.ts`, invoked with the corpus root as an **argument**. No
tracked file names the research directory (BP-1, BP-2), which is why this document does not either.

```
node tools/promote-representation-evidence.ts \
  --source <research corpus root> \
  --out tests/representation/fixtures/empirical \
  --mapping "$REPRESENTATION_EVIDENCE_DIR" \
  --redact <design system name> --redact <corpus directory name> \
  --exclude <the research package's own fixture set> \
  --exclude <the research validator's test suite> \
  --exclude <the lineage archives, both packages>
```

**Aggregate over the promoted bytes:** `b464e818cd03bed71e4b9877b63b1e1519ac16c94118b39541c94a52eeca4434`

That is the SHA-256 of the sorted list of `<relative path> <sha256 of file>` lines, one per promoted
file, joined by newlines. Re-running the promotion over the same corpus reproduces it exactly; a
promotion that is not reproducible is not evidence of anything.

## What was left behind, and why

| Left behind | Why |
|---|---|
| **Screenshots** | The research package's own `knownLimitations` says they establish visual evidence only and back no structural claim. Nothing depends on them, and they are the largest identifying payload in the corpus. |
| **Raw Figma exports** | Bulk source captures, over the promotion's size budget. They are already recorded by SHA-256 in the contracts' `provenance.exportsUsed`, and no production check validates against them. |
| **Research tooling** (`.py`) | Frozen by BP-7. A validator is not a fixture, and promoting one would create a second implementation of rules the `REP-*` registry already owns. |
| **The research package's own fixture set** | Synthetic fixtures for the research validator. `tests/representation/fixtures/` already carries production fixtures for every declared `REP-*` rule, in both directions. |
| **Lineage archives** (`versions/`) | Earlier drafts of the same documents. They demonstrate lineage, which `docs/builder-phase1-decision-log.md` BP-3 records in prose, and no check reads them. |

## The sanitization rules

Applied in this order, because a compound identifier contains a simple one and replacing the simple
one first would leave a half-real value that looks sanitized:

1. literals supplied by the operator, case-insensitively — a name is written more than one way, and
   this corpus writes one of them three ways;
2. variable collection ids, then variable ids, then style keys;
3. SHA-256 values;
4. remaining 40-hex component and style keys;
5. Figma node ids;
6. **file and directory names**, by the same map — a tracked path carries its identifier as durably
   as a tracked field.

Placeholders are assigned in **two phases**: everything is collected first, then frozen, then
substituted. The one-phase version of this was wrong in a way worth recording, because it passed
every test written for it: placeholder numbers follow sorted order, so every number shifts when a new
value is discovered, and assigning during substitution wrote numbers that were correct at the time
and stale a moment later. Three distinct hashes ended up sharing one placeholder. It is not a leak —
it is a silent merge of identifiers the corpus distinguished, and a mapping that no longer describes
the text beside it. What caught it was an assertion about the *output*, not about the mechanism.

## Hashes

Every SHA-256 in the promoted corpus is one of exactly two things, and
`tests/representation/empirical-corpus.test.ts` asserts there is no third:

- **the hash of a promoted file**, recomputed over the sanitized bytes, so hash validation stays
  genuine over the bytes actually tracked;
- **`sha256("unpromoted:<placeholder>")`**, where the original hash referred to something not
  promoted. Anyone can recompute it from the tracked bytes alone, so it cannot be mistaken for
  evidence about content.

Resolution is a fixpoint over the placeholder-to-hash map rather than over the text. Substituting
into the text terminates after one round and leaves documents whose recorded hashes do not match the
bytes beside them — a hash that validates nothing, which is the failure this promotion exists to
avoid. A document recording its own hash could never converge; that case is detected and named rather
than papered over.

## The mapping

The real-to-placeholder mapping is written **only** to `$REPRESENTATION_EVIDENCE_DIR`, outside the
repository tree. The tool refuses an output path that resolves inside the repository, checked on the
resolved path so `../../<repo>/evidence` is refused too. A committed mapping would make every
placeholder trivially reversible, which is sanitization in name only.

**The mapping is never committed, and its contents are never quoted — here or anywhere else.**

## What is asserted about the corpus

`tests/representation/empirical-corpus.test.ts` scans every tracked byte for every identifier shape,
for the redacted names, for the research directory's own name, and for identifier-shaped file names.
It asserts no screenshot and no research tooling was promoted, that every hash is accounted for, and
that at least one hash really does resolve to a promoted file — because a corpus in which every hash
had become an `unpromoted:` marker would satisfy the accounting check while making "hash validation
stays real" false.

`tests/unit/identifier-leakage.test.ts` scans the whole repository independently, and now reads
**paths as well as lines**: the `.gitignore` case earlier in this phase was a node id in a filename,
which every content rule read straight past.
