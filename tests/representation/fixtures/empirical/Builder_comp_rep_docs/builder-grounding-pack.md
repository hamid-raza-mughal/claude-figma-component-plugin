# Builder Grounding Pack — Component Documentation Scaffold

**Status:** v0.4.0-draft revision, regenerated from `component-representation-contract.json` (`contractVersion: "0.4.0-draft"`, `authoringMode: "migrated"`, `readinessStatus: "validation_ready"`). Validation-ready and checksum-pinned; **not** production-approved. Every rule below traces to the contract; this pack introduces no independent policy.

Full evidence: `component-representation-analysis.md`. Executable rules: `component-representation-contract.json` + `component-representation-contract.schema.json`, checked further by `semantic_validator.py`. This pack is a short operational summary.

## The durable representation principle

> **Preserve the documentation grammar; adapt the component vocabulary.**

The scaffold is what a Builder reproduces structurally. The *content* — axes, cardinalities, valid pairings, labels, and now the *layout strategy itself* — must come from inspecting the real component, never from a template default or another component's example.

## Authoritative-source hierarchy

1. **`componentPropertyDefinitions` on the real `COMPONENT_SET`** — component API truth. Always wins for axis names, types, defaults, canonical options.
2. **Real `INSTANCE.variantProperties`/`componentProperties`** — physical component truth, only for the specific combination demonstrated. Never extrapolate coverage from an instance count.
3. **Structural child enumeration** (`component_children_enumerated`) — the *only* evidence level, besides an owner confirmation, that may back a physical-completeness claim. A screenshot (`visual_matrix_verified`) is real evidence but categorically different, not a weaker version of enumeration — never treat it as sufficient.
4. **Documentation-scaffold structure** — layout truth. Governs *where* things go, not *what values* they hold.
5. **Scaffold caption text** — editorial truth. Lowest authority; a fallible, independently-authored display layer.

## Required adaptive inputs

1. **Component identity, semantic families and membership** — families remain optional; a component may declare none, and membership is validated bidirectionally.
2. **`layoutRepresentations[]`** — a component may document itself in several ways at once, each independently scoped to its own schema variants, component sets and evidence nodes. `strategy` is `matrix | list | scenario_gallery`; only `matrix` carries an `allocation`. A schema variant that no representation covers must be named in `undocumentedSchemaVariantIds[]` — silence is explicit, never inferred.
3. **Component sets and property schema variants** — model two sets as distinct schema variants when they share every property except one restricted axis, as Buttons does.
4. **`buildFrameId` vs. `id`** — the documentation-wrapper FRAME and the real `COMPONENT_SET` are different node types with different ids; never conflate them.
5. **Canonical values, kept separate from display labels.**
6. **`correlatedAxisTuples`** — `observedCombinations` / `proposedValidCombinations` / `approvedCombinations` are three distinct fields; only the third gates a Figma write, and only after a real approval path (see guardrails).
7. **`allocation` + `allocationEvidence`** — dimensions are a tagged union (`variant_property`, `component_set_identity`, `fixed_filter`), never magic strings. A `verified` allocation must point at an evidence artifact the validator RECOMPUTES per source documentation block (CV-12); it is never taken on trust. `legacy_unverified` is migration-only and blocks approval.
8. **Theme collection/mode identity** — read from the file, never assume `Dark`/`Light`.
9. **Coverage policy**, per component set, with an explicit evidence level and an explicit `enumerationEvidence` record — never left implicit.
10. **`readinessStatus`** — never claim `ready_for_production` outside the schema-enforced gate (version `1.0.0`, `approvalStatus.overall == "approved"`, zero blockers, a real contract-level owner confirmation).

## Hard guardrails (condition → action)

### VR (validationRules) — Builder runtime behavior

<!-- GENERATED:VR_TABLE:START -->
| Rule | Description | Severity | Detection | Action | Recovery/Escalation |
|---|---|---|---|---|---|
| VR-1 | Naming drift with an unambiguous structural role. | warning | A node's literal name differs from the conventional name for its structural role, but the role is still unambiguous from node type, position, and sibling context. | Log the mismatch as a finding; continue processing using the structural role, not the literal name. | No escalation required; include in the build's finding report for human awareness. |
| VR-2 | Ambiguous structural role. | blocker | A node's name, type, and position are jointly insufficient to determine its structural role with confidence. | Halt processing of that subtree. | Escalate to human review before continuing; do not guess the role. |
| VR-3 | Unresolved axis correlation must not gate a write. | blocker | A correlatedAxisTuples entry has approvalBasis == 'unresolved', and a downstream operation would use its proposedValidCombinations/observedCombinations to restrict or expand a variant matrix. | Do not use this tuple to allocate a matrix or to gate any Figma write operation. | Escalate for owner confirmation (approvalBasis -> owner_confirmed) or structural enumeration (approvalBasis -> fully_enumerated) before use. |
| VR-4 | A 'fully_enumerated' approval must be re-checked at use time, not just trusted from the contract. | error | A correlatedAxisTuples entry has approvalBasis == 'fully_enumerated' and a Builder is about to rely on its approvedCombinations for a write, without independently re-confirming that every relevant component set still shows component_children_enumerated coverage (data can go stale between contract authoring and Builder use). | Re-verify coverage before trusting the approval; do not treat a past 'fully_enumerated' label as a standing guarantee. | If re-verification fails or cannot be performed, escalate to human review before proceeding. |
| VR-5 | Physical completeness claims require component-child-level evidence. | blocker | coveragePolicy.perComponentSetCoverage[i].physicalCompletenessClaimed=true while physicalCoverageEvidenceLevel is schema_only, observed_instances, or visual_matrix_verified. | Reject the claim; downgrade physicalCompletenessClaimed to false. | Obtain component_children_enumerated evidence (a real structural descent/API listing of the COMPONENT_SET's children, not merely a screenshot) or owner_confirmed sign-off before re-claiming. |
| VR-6 | Matrix allocation requires explicit human approval before use. | blocker | Any layoutRepresentations[].allocation[] entry's approvalStatus is not 'approved'. | Do not generate or write any documentation matrix based on that allocation. | Route to a human reviewer for explicit approval with a resolvable ownerConfirmationRef; re-check status before any Figma write. |
| VR-7 | Theme mode names must be read from the file, never assumed. | error | Any logic assumes theme mode names 'Dark'/'Light' (or any fixed pair) without reading themeModel.modes for the specific file being processed. | Reject the assumption. | Re-derive theme handling from themeModel.modes for the specific file being processed. |
| VR-8 | Canonical values and display-label captions must not be interchanged. | warning | A caption string sourced from var_col_title, variant_value, or build_title is passed as the canonical property value to a Figma write operation. | Block the write; substitute the canonical value from componentSets/propertySchemaVariants. | Log the substitution and continue. |
| VR-9 | Button-scoped findings must not be silently generalized to other components. | error | A structuralFindings entry with appliesToScopes=buttons or classification=button_specific_pattern is applied to a non-Button component without a corresponding candidate_cross_component_invariant or owner_declared_standard entry covering that same finding. | Reject the generalization. | Re-scope the finding to owner_declared_standard only after explicit confirmation, or re-derive the rule for the new component from its own evidence. |
<!-- GENERATED:VR_TABLE:END -->

### CV (contractIntegrityRules) — contract-document validity, checked before any of the above even applies

<!-- GENERATED:CV_TABLE:START -->
| Rule | Description | Severity | Detection | Action | Recovery/Escalation | Enforced by |
|---|---|---|---|---|---|---|
| CV-1 | Weak evidence must not be paired with a physical-completeness claim. | blocker | physicalCompletenessClaimed==true while physicalCoverageEvidenceLevel is outside {component_children_enumerated, owner_confirmed}, or is absent from the declared qualifying set. | Reject the document. | Downgrade the claim, or obtain the required evidence level. | schema_and_semantic_validator |
| CV-2 | Duplicate identifiers within a namespace. | blocker | Two entries in the same array share an id. componentSets[].id must be unique; buildFrameId is a many-to-one REFERENCE and may repeat freely, but must never equal any componentSets id. | Reject the document. | Assign a unique id; re-run the validator. | semantic_validator |
| CV-3 | Broken or inconsistent cross-references. | blocker | familyId / schemaVariantId / coverage references do not resolve, or bidirectional membership disagrees. | Reject the document. | Fix the reference on both sides. | semantic_validator |
| CV-3b | Layout-representation and typed-scope reference integrity, and explicit representation of undocumented schema variants. | blocker | A layoutRepresentations appliesTo / namingRuleRef, a typedScope scopeRef, a treatment propertyKey or a nonVariantPropertyCoverage key fails to resolve; OR a schema variant is covered by no representation and is not listed in undocumentedSchemaVariantIds. | Reject the document. | Fix the reference, or declare the variant undocumented explicitly. | semantic_validator |
| CV-5 | Incomplete or duplicate correlated-axis tuple entry. | blocker | A combination's keys do not equal the tuple axes, a value is not canonical in every referenced variant, or two combinations are semantically duplicate. | Reject the document. | Fix the combination or the tuple scope. | semantic_validator |
| CV-6 | Owner approval without a resolvable, bidirectionally-agreeing confirmation record. | blocker | Any owner-gated claim references a confirmation that does not resolve, or whose scopeType/scopeRef does not point back at the same object; or a confirmation is orphaned. | Reject the document. | Add a real confirmation, or downgrade the claim. | semantic_validator |
| CV-7 | Allocation dimension referencing something that does not exist or is out of scope. | blocker | Dispatched on dimension kind: variant_property/fixed_filter must name a VARIANT property declared in EVERY referenced schema variant with canonical values; component_set_identity must reference real component sets inside the representation's appliesTo scope and real naming rules. | Reject the document. | Correct the dimension or the representation scope. | semantic_validator |
| CV-8 | Unauthorized promotion into approvedCombinations. | blocker | Non-empty approvedCombinations without owner confirmation, or with approvalBasis='fully_enumerated' but not equal to the intersection of enumerated combinations across all in-scope sets. | Reject the document. | Obtain confirmation, or set approvedCombinations to the true intersection. | semantic_validator |
| CV-10 | Version/readiness/approval promotion gate. | blocker | contractVersion, readinessStatus, approvalStatus.overall, blockers and the contract-level owner confirmation do not all agree. | Reject the document. | Align all legs. | schema_and_semantic_validator |
| CV-11 | Enumeration evidence must be artifact-backed and internally consistent. | blocker | status='enumerated' without a contained, existing, hash-matching, shape-valid artifact whose componentSetId/fileKey/enumerationMethodClass agree, whose capturedAt parses, whose componentIds are unique, and whose derived combinations and count exactly match the declaration. | Reject the document. | Produce a real artifact, or downgrade to not_enumerated. | schema_and_semantic_validator |
| CV-12 | Matrix allocations must be RECOMPUTABLE from evidence, per source documentation block. | blocker | allocationEvidence.status='verified' without a contained, existing, hash-matching, shape-valid artifact; OR zero observations; OR observations referencing out-of-scope sets; OR rows/columns/bands/fixedFilters recomputed per source block that differ from the declared allocation; OR parallel source blocks that do not derive the same semantic allocation. | Reject the document. | Recapture the allocation evidence, or correct the declared allocation to match it. | semantic_validator |
| CV-13 | Enumeration-provenance class rules. | blocker | class='node_name_parse' backing physicalCompletenessClaimed=true without a resolvable corroborating owner confirmation; or class='owner_supplied' without both a resolvable confirmation and a rawCaptureRef artifact. | Reject the document. | Re-capture via an API class, or obtain the corroborating confirmation. | semantic_validator |
| CV-14 | Competing display-label mappings within one effective scope. | blocker | Two canonicalValueDisplayLabelMap entries share an (axis, canonicalValue) pair AND the same relationship class with overlapping effective scopes (including the unscoped case); OR two entries for one (axis, canonicalValue) with overlapping scopes declare the same display surface with different labels. An editorial_mapping and a typo entry for the same value are complementary, not competing, and are preserved separately by design. | Reject the document. | Scope the mappings disjointly, or reconcile the conflicting surface. | semantic_validator |
| CV-15 | Corroboration must resolve to hashed external contracts. | blocker | level='multi_component_corroborated' with no external contract; a corroborating entry naming the current contract; or an artifact that is missing, hash-mismatched, unparseable, or declares a different contractId. | Reject the document. | Add a real, hashed external contract, or downgrade to single_component_observed. | semantic_validator |
| CV-16 | Coverage metrics must be discriminated and non-duplicated. | blocker | Two classified metrics of the same kind within one (component set, representation) scope, or a matrix_cells metric whose representationId does not resolve. | Reject the document. | Merge or rescope the metrics. | semantic_validator |
| CV-17 | Migration provenance, legacy states and migration-review gate. | blocker | authoringMode='authored' with a migrationReportRef or any legacy_*/migrationReviewRequired state; OR authoringMode='migrated' without a resolvable hash-verified migration report (required even when zero legacy states remain); OR a report that fails to pin the source contract or the migration tool by hash; OR any mismatch in either direction between emitted unresolved states and reported ones; OR unresolved states coexisting with approvalStatus='approved', readinessStatus='ready_for_production', or a missing blocker of the matching blockerClass; OR a legacy state backing a completeness claim or an approved allocation. | Reject the document. | Emit a complete migration report, or resolve the states. | schema_and_semantic_validator |
| CV-18 | Representation node bindings (the operational locator table). | blocker | A binding whose layoutRepresentationRef does not resolve; a duplicate containerNodeId; a rootNodeId equal to its own containerNodeId; or a verified matrix allocation with a source documentation block that no binding covers. | Reject the document. | Add or correct the binding. evidenceNodeIds is provenance and must never be used as an operational locator. | semantic_validator |
<!-- GENERATED:CV_TABLE:END -->

Every field above (including full `detectionCondition`/`action`/`recoveryOrEscalation` text) is generated verbatim from `component-representation-contract.json`'s own `contractIntegrityRules`/`validationRules` arrays via `generate_tables.py` — not hand-condensed. Run `python3 generate_tables.py --check builder-grounding-pack.md` to verify this table hasn't drifted from the contract.

## Evidence sufficiency

<!-- GENERATED:EVIDENCE_LEVEL_TABLE:START -->
| Level | Meaning |
|---|---|
| `schema_only` | Read from componentPropertyDefinitions only; no instance/child proof. |
| `observed_instances` | At least one real INSTANCE demonstrates it. |
| `visual_matrix_verified` | A screenshot/visual render was inspected. Does NOT establish structural child completeness. |
| `component_children_enumerated` | The COMPONENT_SET's real children were structurally listed/counted (API descent), not merely viewed. |
| `owner_confirmed` | The file owner explicitly confirmed it, backed by a resolvable ownerConfirmations record. |

`visual_matrix_verified` and `component_children_enumerated` are deliberately not an ordered pair — a screenshot never upgrades to enumeration.
<!-- GENERATED:EVIDENCE_LEVEL_TABLE:END -->

Do not require any of the following as universal — the contract explicitly does not: Dark/Light as theme names, `Size` rows or `State` columns as matrix axes, correlated bands, a fixed number of semantic families, exactly one `COMPONENT_SET` per build, or `strategy: matrix` itself. All of these were true for Buttons and are recorded at `buttons` or `specific_node` scope, never higher.

## Known limitations (verbatim from `contract.knownLimitations`)

- Only the terminal export self-reports validation statistics; basic-tree counts were independently recomputed.
- Reference-resolution validation is only possible from the terminal export.
- `explicitVariableModes` occurs 0 times in the export — the theme-mode mechanism is unverified.
- Physical coverage at `component_children_enumerated` exists for **0 of 10** component sets. `NODE-0313` reached only `visual_matrix_verified` — a real but categorically weaker kind of evidence than the prior draft assumed.
- The 8 previously-unrecorded `buildFrameId`s were derived by script extraction, cross-checked by an independent review pass.
- The screenshot artifact for `NODE-0313` was originally only in an ephemeral scratch path; it is now preserved at `evidence/comp_build_750-2443_screenshot.png`.
- Corroboration is explicit: a finding is `single_component_observed` unless at least one hashed EXTERNAL contract corroborates it. The Buttons baseline has none, so every finding here is single-component.
- `CAT-1` was derived by automatic pattern detection; it is not owner-confirmed and must not be treated as approved (VR-3/CV-6/CV-8).
- Identical rule/finding id sets across documents are necessary but not sufficient for semantic consistency — the CV/VR tables here are generated verbatim from the contract specifically to close that gap; other prose was not mechanically diffed.

## Layer naming (namingRules)

Layer names are first-class contract data: a Builder needs them to create documentation, locate existing documentation, check conformity, rename malformed layers and update an existing structure. A name is never the sole semantic or referential identity — resolve nodes through `representationNodeBindings[]`, never through `layoutRepresentations[].evidenceNodeIds`, which is provenance.

Enforcement is tiered. `required` roles carry a semantic value and are enforced. `recommended` roles are used when **creating**, and a mismatch on **update** is reported, never a structural failure. `observed_only` roles are recorded and never enforced. `uniquenessPolicy` is conditional on enforcement: `required`/`recommended` must declare `required_within_scope` or `duplicates_allowed`; `observed_only` must declare `not_applicable`.

<!-- GENERATED:NAMING_TABLE:START -->
| Rule | Role | Template | Enforcement | Uniqueness | Scope |
|---|---|---|---|---|---|
| _(none declared)_ | | | | | |
<!-- GENERATED:NAMING_TABLE:END -->

## Explicit blockers (verbatim from `contract.approvalStatus.blockers`)

`overall: "blocked"`.

<!-- GENERATED:BLK_TABLE:START -->
| Blocker | Class | Description | Must be resolved before |
|---|---|---|---|
| BLK-1 | owner_decision | correlatedAxisTuples CAT-1 (Layout x Symbol) has approvalBasis='unresolved'; it is neither owner-confirmed nor fully-enumerated. | Any Figma write that relies on restricting axis combinations for this or any other component. |
| BLK-2 | owner_decision | Neither layoutRepresentations[].allocation entry (LR-1, LR-2) has approvalStatus='approved' with a resolvable ownerConfirmationRef. | Generating or writing any documentation matrix based on either allocation. |
| BLK-3 | owner_decision | 0 of 10 component sets have reached component_children_enumerated coverage; 1 of 10 (NODE-0313) reached only visual_matrix_verified, which does not qualify. The other 9 remain schema_only. | Claiming physical completeness for any of the 10 sets, or using any of them as a coverage template for a new component. |
| BLK-4 | owner_decision | The theme-mode resolution mechanism (explicit per-frame override vs. inherited vs. other) is unverified; explicitVariableModes was not found anywhere in the export. | Generalizing the theme-binding mechanism to any other component or file. |
| BLK-5 | owner_decision | No second, non-Button component has been analyzed; every candidate_cross_component_invariant classification in this contract remains an unverified hypothesis. | Treating any candidate_cross_component_invariant finding as a default Builder behavior. |
| BLK-6 | owner_decision | ownerConfirmations is empty; no owner-confirmed record exists anywhere in this contract. | Any approval path (correlatedAxisTuples, layoutRepresentations[].allocation, coveragePolicy, or contract-overall) that depends on owner_confirmed evidence. |
| BLK-7 | owner_decision | approvalStatus.overall cannot become 'approved' without a resolvable contract-level owner confirmation (scopeType=contract_overall), which does not yet exist. | Setting approvalStatus.overall to 'approved', and therefore before contractVersion can ever become 1.0.0. |
| MIG-1 | legacy_migration_state | Migrated from v0.3.1-draft with unresolved legacy states (allocation evidence, coverage metric kinds, theme mode provenance). Each is listed in the migration report with its owner and resolution condition. | approval or any production-readiness claim |
| MIG-2 | migration_review | Migration could not mechanically infer some finding scopes and node bindings; those are flagged migrationReviewRequired and need human review before approval. | approval or any production-readiness claim |
<!-- GENERATED:BLK_TABLE:END -->

These are pass/fail gates, not open design questions. Resolve them by producing the missing evidence (owner confirmation, structural enumeration, a second-component analysis) or by explicitly re-scoping the affected contract fields — never by reasoning around them at the pack level.
