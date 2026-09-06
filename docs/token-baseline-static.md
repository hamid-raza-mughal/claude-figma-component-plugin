# Static Token / Byte Baseline

**Satisfies** P1-FINAL §11.6–§11.10 and Gate 0 ("static measurements are separated from estimates").
**Date:** 2026-07-29 · re-measured 2026-09-06 against the new curated export · **Phase 1 model calls: zero.**

The single rule this document exists to enforce: **a measurement and an estimate never share a column.**
Section 1 is measured. Section 2 is estimated and labelled. Section 3 is a user-reported historical figure
that has never been decomposed. Section 4 defines telemetry fields and deliberately leaves them empty.

---

## 1. Measured — exact bytes on disk

Byte counts from `stat`; SHA-256 in `v1-baseline-manifest.md`. Reproduce with:

```
node tools/build-baseline-manifest.ts <artifact-dir>
```

| Artifact | Bytes | Notes |
|---|---|---|
| `Agentic/adalfi-design-curated-tokens_latest.json` | **902,685** | The authoritative curated source since 2026-09-06 (MB-17). **Contributes zero bytes to any model input by architecture** (P1-FINAL §18). |
| `Agentic/adalfi-design-curated-tokens.json` | 876,098 | The 2026-07-28 export, retained as the historical baseline. Read by `tests/resolver/retired-names.test.ts` only. Its character count is 876,096 — 2 bytes of multi-byte UTF-8 — recorded because an earlier note carried 876,096 as a *byte* count. |
| `Specs/coordinator_system_prompt_v1.2.md` | 24,720 | Most recent v1-line prompt. Superseded by WP4; measured as the "before" figure. |
| `Specs/coordinator_system_prompt_v1_with_fewshot.md` | 36,181 | Inlines the contaminated few-shot. Never an active prompt source. |
| `Specs/coordinator_output.schema.json` | 20,780 | v1 schema, superseded by `schemas/coordinator/` (WP3). |
| `resolver-prototype/schema_card.txt` | 1,541 | Hand-maintained card, superseded by the WP2 generator. Its size is the budget reference for the generated card. |
| Full v1 artifact bundle | 3,094,680 | 42 files. Bounds the corpus a future run could accidentally ingest. |

### Pending measurement — artifacts that do not exist yet

Not estimated, not guessed. Each is measured when its work package lands, using the same method.

| Artifact | Measured in | Ceiling |
|---|---|---|
| `src/judgment/coordinator-core.md` | WP4 | **≤1,500 words** hard (700–1,200 target). Counting rule: whitespace-delimited tokens in body prose; frontmatter and fenced code excluded. |
| `src/judgment/routes/{new,modify,audit}.md` | WP4 | Exactly one is ever assembled. |
| Generated schema card | WP2 | Regeneration must be byte-identical; budget referenced against the 1,541-byte hand-maintained card. |
| Active fixtures (`tests/fixtures/active/`) | WP3 | — |
| Observed-tree samples | WP3 | Synthetic only. The real payload size is unmeasured and is the next bottleneck after the JSON. |
| Assembled model input, per route | WP4 | Must contain **zero** raw curated-source bytes. |

---

## 2. Planning estimates — targets, not measurements

**None of the following is a measurement.** Each is a planning figure, retained because it justified the
architecture, and each is labelled so it cannot be quoted as evidence.

| Figure | Status | Basis and caveat |
|---|---|---|
| Curated JSON ≈ 258,000 tokens | **estimate** | 902,685 bytes ÷ ~3.5 chars/token. No tokenizer was run. A real count needs the model's tokenizer, which arrives with the Phase 2 adapter. |
| Curated JSON ≈ 96% of per-run spend | **estimate** | Derived from the estimate above against the unverified ~1M figure in §3. An estimate divided by an unverified number. |
| ~61% saving from prompt caching | **planning estimate / ceiling** | Arithmetic ceiling for a 4-pass run, not a tuning result: for `N` passes over a cached block `B`, effective = `B×1.25 + B×0.1×(N−1)`. The floor is **1.25×B paid once, at any hit rate**. Caching is a *cost* lever, not a *token* lever — cached tokens still occupy the window. A human approval gate mid-run exceeds the 5-minute TTL and forces a fresh write, so this architecture is structurally a poor caching candidate. |
| ≤50,000 tokens/run | **target** | A design goal, not an achieved result. |
| ~33,000 tokens/run after indexing | **prototype estimate** | From the Python prototype's own accounting, with no live model call and no telemetry. Not a Phase 1 claim. |
| Recall 9/12 top-1, 11/12 top-5 | **measured, contaminated ground truth** | Real measurement, but taken against a fixture containing a fabricated path. Re-measured in WP2 against corrected ground truth and reported as fractions with explicit `n`. |

---

## 3. User-reported historical baseline

**≈1,000,000 tokens per run.**

Status: **user-reported, historical, undecomposed.** Never instrumented, never split by payload section,
no run id, no date range, no model version. It is recorded because it motivated the work — it is not
evidence, and no percentage derived from it should be quoted as one. Superseded the moment Phase 2
telemetry produces a real number.

---

## 4. Telemetry field definitions — defined, deliberately unpopulated

Field names and units are fixed now so Phase 2 wiring has a contract to satisfy. **No values are
fabricated**; every field below requires the model adapter that P1-FINAL §7.2 places out of scope.

| Field | Unit | Populated by |
|---|---|---|
| `input_tokens` | count | Phase 2 model adapter |
| `output_tokens` | count | Phase 2 model adapter |
| `cache_creation_tokens` | count | Phase 2 model adapter |
| `cache_read_tokens` | count | Phase 2 model adapter |
| `latency_by_stage_ms` | ms per stage | Phase 2 Runtime Controller |
| `model_id` | string | Phase 2 model adapter |
| `prompt_version` | string | WP4 assembler (available earlier; still recorded via the envelope) |
| `payload_section_contribution` | bytes and % per assembled section | WP4 assembler — **measurable in Phase 1** without a model, since assembly is deterministic |

`payload_section_contribution` is the one field Phase 1 can populate honestly, because it measures what
the assembler produced rather than what a model consumed. It is reported in bytes, with token figures
withheld until a tokenizer is available.

---

## 5. What this document may not be used to claim

Per P1-FINAL §20: no "token reduction achieved", no "prompt caching effective", no per-run cost claim.
Phase 1 proves that raw curated JSON contributes **zero bytes** to assembled model input — a structural
property provable without a model — and nothing further about spend.
