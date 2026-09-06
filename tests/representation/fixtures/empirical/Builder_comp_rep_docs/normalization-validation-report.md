# Normalization Validation Report — v0.4.0-draft

Covers the breaking implementation of C-1 … C-11 on top of v0.3.1-draft, its migration, and the checksum lock.

All checks in this report were run as executable commands against the actual files in this directory, immediately before writing the report — not asserted by inspection. Command and output are quoted together in each section.

## 1. What changed and why

v0.3.1-draft could not represent a second component without distortion. The Pill R-2 experiment made that measurable: upgrading Pill's evidence from name-parsing to the Figma Plugin API left the v0.3.1 violation counts completely unchanged (6/4/0/2 for contract, probe A, probe B, probe C). Evidence quality was never the problem; representation was.

Eleven changes were implemented — see `CHANGELOG.md` for the full inventory and the renamed-field table. In summary: `layoutRepresentations[]` with typed dimensions and recomputable allocation evidence; typed finding scope separated from corroboration; a remodelled theme layer; discriminated coverage metrics; structured enumeration provenance; tiered naming rules with an operational locator table; and the CV-2 build-frame fix.

Prototype and motion behaviour are **out of scope for v0.4** by decision; the proposed C-12 was removed from the inventory rather than left undefined.

## 2. Schema self-check

```
python3 -c "import json; from jsonschema import Draft202012Validator as V; V.check_schema(json.load(open('component-representation-contract.schema.json')))"
  -> valid against Draft 2020-12; 24 top-level required properties, 40 $defs
```

## 3. Contract validation

```
python3 semantic_validator.py component-representation-contract.schema.json component-representation-contract.json
  -> PASS: 0 violations                                     (migrated Buttons)

cd ../non_button_validation/pill && python3 ../../Builder_comp_rep_docs/semantic_validator.py \
    ../../Builder_comp_rep_docs/component-representation-contract.schema.json non-button-experimental-contract.json
  -> PASS: 0 violations                                     (migrated Pill R-2)
```

Both migrate to **zero schema and zero semantic violations**. Neither is approved: Buttons carries 9 blockers and Pill carries 12. Zero *violations* is not zero *blockers*, and the two must not be conflated.

## 4. Fixture suite

```
python3 generate_fixtures.py
  -> Wrote 52 fixtures + manifest.json
       pass: 10   schema_reject: 17   semantic_reject: 25

python3 semantic_validator.py --test-fixtures fixtures/manifest.json
  -> 52/52 fixtures behaved as expected
```

Counts are read from `fixtures/manifest.json`, not asserted. Every C-1 … C-11 rule has at least one positive and one targeted negative. `semantic_reject` fixtures must be schema-clean, which the harness enforces.

## 5. Regression suites

```
python3 tests/test_schema_conditionals.py   -> TOTAL: 42/42 passed, exit 0
python3 tests/test_validator_hardening.py   -> TOTAL: 44/44 passed, exit 0
python3 tests/test_naming_resolver.py       -> TOTAL: 19/19 passed, exit 0
```

`test_naming_resolver.py` is new. It exercises what a document validator structurally cannot: stale node ids, ambiguous scoped fallback matching, tiered enforcement on update, and the `duplicates_allowed` disambiguation path that two sibling `content` blocks depend on.

## 6. Generated-table drift

```
python3 generate_tables.py --check builder-grounding-pack.md component-representation-analysis.md normalization-validation-report.md
  -> CHECK PASSED: 3 file(s), all expected generated tables present, well-formed, and drift-free
```

Two new generated tables were added this round (`NAMING_TABLE`, `COVERAGE_METRIC_TABLE`) and `generate_tables.py` gained a `--fill` mode, so generated regions are produced by the generator and then proven byte-identical by `--check` rather than hand-maintained.

## 7. Cross-document consistency — and its limits

Identical id sets across documents remain **necessary but not sufficient** for semantic consistency. What actually prevents drift is that `VR_TABLE`, `CV_TABLE`, `BLK_TABLE`, `EVIDENCE_LEVEL_TABLE`, `NAMING_TABLE`, `COVERAGE_METRIC_TABLE` and both `SF_TABLE` embeddings are generated verbatim and mechanically checked. Prose explanations and hand-written tables are spot-read, not mechanically diffed, and could still drift in a future edit; this report does not claim otherwise.

## 8. Retired-key/enum check

```
python3 check_retired_structure.py
  -> STRUCTURAL CHECK PASSED: 0 retired keys, 0 retired enum values,
     14/14 active enum sets confirmed exact, across contract.json and schema.json
```

The retired list grew from six keys and one enum value to nineteen keys and six enum values. Markdown prose remains deliberately out of scope: this changelog and the analysis doc legitimately discuss retired names historically.

This check caught a real defect during implementation. The new `$defs` object for structured enumeration provenance was initially named `enumerationMethod` — quietly reusing the name of the very string field being retired. It was renamed to `enumerationMethodRecord` so the retirement stays meaningful.

## 9. Structural findings register

<!-- GENERATED:SF_TABLE:START -->
| ID | Finding | Applies to | Corroboration |
|---|---|---|---|
| SF-01 | comp_build internal shape (variant-band annotations -> COMPONENT_SET -> y-axis legends -> build_description) held identically across all 10 comp_build instances. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-02 | comp_build_var_description grammar '{key} - {value}' repeated, joined by a dot-separator glyph, held identically across all 40 annotation bands. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-03 | en_dash text nodes contain a literal hyphen (U+002D), never a typographic en dash (U+2013), across all 80 occurrences. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-04 | The specific pairing {Center - Fill <-> Optional, Left - Hug <-> Leading/Trailing/Both} is the exact Layout/Symbol correlation observed in every one of the 10 Button component sets. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-05 | The general principle that declared VARIANT axes on a COMPONENT_SET may be correlated rather than independently combinable, and that naive Cartesian expansion can overstate the real design space, is a Figma-level phenomenon (not a Button API detail) but is only evidenced here via Buttons. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-06 | Disabled-restricted component sets (State limited to one value) omit the x-axis legend row but retain build_description (headline + divider), for both of the 2 observed disabled sets. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-07 | Theme is implemented by binding the same variable to different container frames, which resolve to different mode-specific literal values, for both of the 2 observed theme containers in this file. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-08 | The general principle that Figma variable modes (rather than duplicate named styles) can implement theme switching is a file/Figma-level mechanism, not Button-specific, but is only evidenced here via the Buttons page's two theme containers. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-09 | The top-level page order (intro -> divider -> representation -> divider -> builds) occurs exactly once in this file (one component_box); it has not been observed to repeat, even within Buttons. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
| SF-10 | The partition into exactly 3 semantic families (Primary/Secondary/Disabled) with hr dividers between them is specific to this one component_builds_section; the comp_build_section internal shape (headline + builds_container) does repeat 3/3 times. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
| SF-11 | Naming-convention violations exist and are not schema/lint-enforced: 4/38 var_col-title-role nodes are named 'Label' instead of 'var_col_title'; 4 comp_pan-role wrapper frames are named 'container'; the light-mode theme heading is named 'Subheading' vs. the dark-mode 'rep_title'; a capital-I typo ('Center - FIlled') ships in both theme panels. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-12 | All 196 exported INSTANCE nodes are located inside components_representations; 0 are located inside any comp_build. INSTANCE.variantProperties data therefore proves specific axis combinations exist as real components, but only for the combinations shown in the representation gallery, not for the matrix cells inside each COMPONENT_SET. | contract:NAME-0001-buttons-component-representation-contract | single_component_observed |
| SF-13 | The mechanism by which dark_rep_container and light_rep_container resolve an identical bound variable to different literal values (explicit per-frame mode override vs. inherited vs. some other Figma mechanism) is not observable from either export; explicitVariableModes occurs 0 times anywhere in the terminal export. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
| SF-14 | The v0.2.0-draft contract treated the get_screenshot(NODE-0557) result as component_children_verified-level evidence and claimed physical completeness for NODE-0313. That evidence level has been split (visual_matrix_verified vs. component_children_enumerated) and the screenshot correctly reclassified as visual_matrix_verified only, which does not meet the completeness bar. Net effect: 0 of 10 component sets now meet the bar (previously reported as 1 of 10). This finding exists purely for cross-version traceability. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
| SF-15 | The v0.3.0-draft contract and validator claimed 5/5 enforceability but had five real enforcement gaps: fully_enumerated was label-based (an artifact could be fabricated/reused across sets); ownerConfirmations resolution was one-directional (an orphan confirmation record passed silently); layoutRepresentations[].allocation coverage only checked for zero coverage, not exactly-one, and its axis check unioned declared axes across referenced variants instead of requiring every one; the qualifying-evidence-levels policy field was unconstrained; and generate_tables.py had no drift-detection mode. All five are closed in v0.3.1-draft (CV-11 added; CV-3/CV-6/CV-7 corrected; CV-1 gained a schema-enforced floor restriction; generate_tables.py --check added). This finding exists purely for cross-version traceability. | contract:NAME-0001-buttons-component-representation-contract (review) | single_component_observed |
<!-- GENERATED:SF_TABLE:END -->

## 10. Migration

```
python3 migrate_v031_to_v040.py --source versions/0.3.1-draft/... --out ... --report ...
  -> MIGRATED: 21 unresolved state(s)
python3 migrate_v031_to_v040.py --source ... --out <already-migrated>
  -> REFUSED: already at 0.4.0-draft. Use --verify to check equivalence.   (exit 2)
python3 migrate_v031_to_v040.py --verify --out component-representation-contract.json
  -> VERIFY PASSED: byte-identical to a fresh migration of the pinned source; migration is idempotent
```

The three modes are distinct by design: migrate, refuse, verify. The migration performs no evidence or approval upgrades — every fact it cannot establish mechanically becomes an explicit, approval-blocking unresolved state, recorded in a hash-pinned report that CV-17 checks in both directions.

## 11. Checksums and coverage audit

```
python3 verify_checksums.py
  -> CHECKSUM VERIFICATION PASSED: 185 canonical file(s) match, manifest correctly excludes itself;
     external evidence 2 present / 0 explicitly unavailable; coverage audit found 0 unclassified files
```

Coverage is now classified rather than manifest-only. v0.3.1's verifier walked the manifest, so a file on disk that was listed nowhere was invisible to it — `screenshots/` and the two raw exports were silently uncovered. v0.4 adds `screenshots/` to the canonical manifest, delegates the two git-ignored raw exports to `versions/EXTERNAL-EVIDENCE.json` (itself canonically checksummed), and fails on any unclassified file. The audit was verified to discriminate by planting a stray file and confirming a specific failure before removing it.

## 12. Readiness verdict

**`validation_ready`. Checksum-pinned and change-controlled. Not production-approved.**

Every gate passes and both contracts validate cleanly, but validity is not approval. The Buttons contract carries 9 approval blockers and Pill carries 12; `ownerConfirmations` is empty in both; no owner decision was resolved by this work. Any subsequent structural change requires `0.4.1-draft` or later — the locked v0.4.0-draft package must not be silently mutated.
