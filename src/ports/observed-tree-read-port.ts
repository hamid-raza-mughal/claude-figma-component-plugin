/**
 * Read-plane port surface (§14.4, §5.4).
 *
 * Re-exported here so `src/ports/` is the single place a future adapter is wired
 * in. The types live with the contracts; this module exists so that "which ports
 * exist" is answerable by listing one directory.
 *
 * **No implementation, no credential, no write method.** Phase 1 may define ports
 * and fixtures but must not implement or grant live Figma access. Builder is the
 * only writer, and only to a sandbox target — and Builder is not in this phase.
 */
export type {
  ObservedTreeReadPort,
  ObservedTreeCapture,
  ObservedTreeExcerpt,
  FigmaDependencyId,
} from '../contracts/observed-tree.ts';
export { FIGMA_DEPENDENCIES } from '../contracts/observed-tree.ts';
