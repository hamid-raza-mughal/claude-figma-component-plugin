/**
 * The representation module's only importable entry point (BP-9).
 *
 * `package.json` declares no `exports` field and TypeScript imposes no module
 * encapsulation, so a barrel is a naming convention that the first
 * `import { … } from '../representation/validation/…'` quietly defeats. B6 adds
 * the ESLint pattern and the static scan that make it real, so everything under
 * `contracts/`, `validation/`, `evidence/` and `selection/` is internal by
 * enforcement rather than by convention.
 *
 * What Builder Phase 2 may couple to is exactly what is re-exported here.
 */
export {
  REPRESENTATION_CONTRACT_SCHEMA_ID,
  REPRESENTATION_CONTRACT_VERSION,
  REPRESENTATION_CONTRACT_SCHEMA_PATH,
  TARGET_KINDS,
  LAYOUT_STRATEGIES,
  parseSchemaIdVersion,
} from './contracts/representation-contract.ts';

export type {
  TargetKind,
  LayoutStrategy,
  RuleTarget,
} from './contracts/representation-contract.ts';

export {
  REPRESENTATION_INVARIANTS,
  REPRESENTATION_INVARIANTS_BY_ID,
} from './validation/invariant-registry.ts';

export type { RepresentationInvariant } from './validation/invariant-registry.ts';

export { PROMOTION_LEDGER, NEW_IN_PROMOTION } from './validation/promotion-ledger.ts';

export type {
  PromotionLedgerRow,
  PromotionDisposition,
} from './validation/promotion-ledger.ts';

export { resolveReferences } from './validation/reference-resolver.ts';

export type {
  ArtifactReader,
  ReferenceViolation,
  ReferenceResult,
  ResolveInput,
} from './validation/reference-resolver.ts';

export { checkSemantics, NAMESPACES } from './validation/semantic-validator.ts';

export type {
  SemanticViolation,
  SemanticResult,
} from './validation/semantic-validator.ts';

export {
  RETIRED_VOCABULARY,
  findRetiredVocabulary,
  checkProbesDiffer,
  checkDocumentStatus,
  checkDeclaredEnumeration,
  LOGIC_BEARING_FIELD,
} from './evidence/evidence-checks.ts';

export type {
  EvidenceViolation,
  EvidenceResult,
  Probe,
} from './evidence/evidence-checks.ts';
