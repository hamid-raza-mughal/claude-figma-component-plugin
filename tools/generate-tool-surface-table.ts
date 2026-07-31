/**
 * Generates §12.2's tool-surface-by-phase table FROM the normative transition
 * registry (`src/registry/transitions.ts`), so the contract's printed table
 * and the code cannot drift apart the way they already had once
 * (docs/phase2-decision-log.md PD-6: revision 4 added §10 row 20 — "any
 * non-terminal" — and the printed §12.2 table was never regenerated
 * afterward, so it under-stated `closeRun`'s real reachability).
 *
 * Exists for the same reason `tools/ledger-rollup.ts` exists: a table that is
 * retyped by hand from its own source is a second account of one fact
 * (defect class C3), and this repository's whole discipline is closing that
 * class structurally rather than by review.
 *
 * Usage:
 *   node tools/generate-tool-surface-table.ts             # print the table
 *   node tools/generate-tool-surface-table.ts --check <file>
 *     # exits 1 if the block between the sentinel comments in <file>
 *     # disagrees with the generated table.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NON_TERMINAL_PHASES,
  NON_PHASE_SCOPED_TOOLS,
  GUARD_ONLY_TOOLS,
  computeToolSurfaceByPhase,
  type ToolName,
} from '../src/registry/transitions.ts';

export const BEGIN_SENTINEL = '<!-- BEGIN GENERATED §12.2 TABLE (tools/generate-tool-surface-table.ts) -->';
export const END_SENTINEL = '<!-- END GENERATED §12.2 TABLE -->';

/** Canonical per-tool ordering for the printed rows — matches §13's own
 *  tool-interface listing order, not insertion order into a Set. */
const TOOL_PRINT_ORDER: readonly ToolName[] = [
  'resolveCommand',
  'beginRun',
  'prepareContext',
  'submitDraft',
  'openClarification',
  'answerClarification',
  'presentForApproval',
  'recordApproval',
  'buildHandoff',
  'closeRun',
  'failRun',
  'cancelRun',
  'expireRun',
  'resumeRun',
  'runMaintenance',
];

function orderedTools(tools: ReadonlySet<ToolName>): string {
  return TOOL_PRINT_ORDER.filter((tool) => tools.has(tool))
    .map((tool) => `\`${tool}\``)
    .join(', ');
}

/** §12.2's own distinction, not the registry's: `runMaintenance` is
 *  non-phase-scoped for the same *reason* `resolveCommand`/`beginRun`/
 *  `resumeRun` are (§12.2.1), but it never relates to a run at all, so the
 *  printed table gives it a separate row rather than folding it into
 *  "(pre-run)". `NON_PHASE_SCOPED_TOOLS` intentionally does not carry this
 *  finer distinction — it only answers "does G-11 apply" — so it is drawn
 *  here, not derived. */
const PRE_RUN_TOOLS: readonly ToolName[] = NON_PHASE_SCOPED_TOOLS.filter((tool) => tool !== 'runMaintenance');

export function generateTable(): string {
  const surface = computeToolSurfaceByPhase();
  const lines = ['| Phase | Tools registered |', '|---|---|'];
  lines.push(`| *(pre-run)* | ${orderedTools(new Set(PRE_RUN_TOOLS))} |`);
  for (const phase of NON_TERMINAL_PHASES) {
    lines.push(`| \`${phase}\` | ${orderedTools(surface.get(phase) ?? new Set())} |`);
  }
  lines.push(`| *(maintenance, no run)* | \`runMaintenance\` — §2.11; deliberately outside the phase model |`);
  lines.push(
    `| *(any, Guard-initiated)* | ${orderedTools(new Set(GUARD_ONLY_TOOLS))} — never model-callable |`,
  );
  return lines.join('\n');
}

function extractBlock(text: string, path: string): string {
  const startIndex = text.indexOf(BEGIN_SENTINEL);
  const endIndex = text.indexOf(END_SENTINEL);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`${path} does not contain both sentinel comments — nothing to check against.`);
  }
  return text.slice(startIndex + BEGIN_SENTINEL.length, endIndex).trim();
}

export function check(path: string): { readonly ok: boolean; readonly generated: string; readonly found: string } {
  const generated = generateTable();
  const found = extractBlock(readFileSync(path, 'utf8'), path);
  return { ok: found === generated, generated, found };
}

function main(): void {
  const checkIndex = process.argv.indexOf('--check');
  if (checkIndex === -1) {
    console.log(generateTable());
    return;
  }
  const path = process.argv[checkIndex + 1];
  if (path === undefined) {
    console.error('Usage: node tools/generate-tool-surface-table.ts --check <file>');
    process.exit(1);
  }
  const result = check(path);
  if (!result.ok) {
    console.error(`${path}'s §12.2 table disagrees with the transition registry.\n`);
    console.error('--- generated (the registry says) ---');
    console.error(result.generated);
    console.error('\n--- found (the file says) ---');
    console.error(result.found);
    process.exit(1);
  }
  console.log(`${path}'s §12.2 table matches the transition registry.`);
}

// Only when invoked directly, so `generateTable`/`check` stay importable by
// tests without the import itself printing or exiting the process.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
