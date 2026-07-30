# Assertion run — 2026-07-30T09:41:12.726Z

Registered: 16 · passed 16 · failed 0 · not-executed 0 · historical (not migrated) 5
Clean: yes

| case | status | statement | note |
|---|---|---|---|
| WB-PATH-01 | passed | A required run_type is enforced before anything else; there is no model route classifier. |  |
| WB-PATH-02 | passed | audit routes to synthesizer; new and modify route to builder. |  |
| WB-GUARD-R3-01 | passed | A fabricated candidate_id does not verify: ids derive from the source hash and cannot be constructed. |  |
| WB-GUARD-R3-02 | passed | A placeholder source hash is refused at identity construction. |  |
| WB-GUARD-R11-01 | passed | Identity changes when the source hash or the index format changes. |  |
| WB-CONF-01 | passed | Aggregate confidence takes the weakest child, never an average. |  |
| WB-BLOCK-01 | passed | An active blocking gap is detected; a resolved one is not. |  |
| WB-TREE-01 | passed | An authored implementation tree is detected, including a bare Figma node-type literal. |  |
| WB-OPS-01 | passed | An operational field in a model draft is detected at any depth. |  |
| WB-OPS-02 | passed | A clarification gap's own lifecycle state is not an operational field — the exemption is path-scoped. |  |
| WB-SCHEMA-01 | passed | Every canonical valid output fixture validates with format assertion on. |  |
| WB-SCHEMA-02 | passed | Every canonical invalid output fixture is rejected. |  |
| WB-PROMPT-01 | passed | The always-loaded core stays within its stated word ceiling. |  |
| WB-PROMPT-02 | passed | The word-counting rule excludes frontmatter and fenced code. |  |
| WB-CTX-01 | passed | Exactly one route module is assembled, and the assembled input is leak-free. |  |
| WB-INV-01 | passed | Every registered invariant names exactly one enforcement owner and a unique error code. |  |
| V1-RESULTS-18 | historical | The 18 first-pass Results rows (89% batch pass rate). | depends-on-live-model |
| V1-FIXTURE-WARNING-TOAST | historical | warning-toast-run-002 graded PASS as the canonical output example. | depends-on-contaminated-fixture |
| V1-SCHEMA-OPEN | historical | Cases asserting the v1 output schema accepted a given payload. | depends-on-open-schema |
| V1-SCORE-80-100 | historical | Reviewer cases asserting an 80/100 pass threshold. | depends-on-scalar-scoring |
| V1-BUILDER-SYNTH | historical | Cases asserting Builder or Synthesizer behaviour. | depends-on-unbuilt-stage |
