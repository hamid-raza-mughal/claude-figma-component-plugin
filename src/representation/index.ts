/**
 * The representation module's only importable entry point (BP-9).
 *
 * `package.json` declares no `exports` field and TypeScript imposes no module
 * encapsulation, so a barrel is a naming convention that the first
 * `import { … } from '../representation/validation/…'` quietly defeats. B6 adds
 * the ESLint pattern and the static scan that make this boundary real; until
 * then, this file is still the declared surface and everything under
 * `contracts/`, `validation/`, `evidence/` and `selection/` is internal.
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
