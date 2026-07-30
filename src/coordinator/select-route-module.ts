/**
 * Route-module selection (§15.3).
 *
 * **Deterministic code loads exactly one module, from the required `run_type`.**
 * The model never classifies and never changes the route. A missing or invalid
 * route blocks *before* assembly, so a misrouted request cannot reach a model at
 * all.
 *
 * Loading all three modules and letting the model pick would be the natural
 * shortcut, and it is the one this design refuses: it triples the always-loaded
 * payload and hands the model a decision it has no evidence for.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN_TYPES, isRunType, type RunType } from '../contracts/invocation.ts';

const JUDGMENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'judgment');

export const CORE_MODULE_FILE = 'coordinator-core.md';

/** Paths are relative to `src/judgment/`; route modules live in `routes/`. */
export const ROUTE_MODULE_FILES: Readonly<Record<RunType, string>> = {
  new: join('routes', 'new.md'),
  modify: join('routes', 'modify.md'),
  audit: join('routes', 'audit.md'),
};

/** Word budget for the always-loaded core (§15.2). */
export const CORE_WORD_TARGET_MIN = 700;
export const CORE_WORD_TARGET_MAX = 1200;
export const CORE_WORD_HARD_CEILING = 1500;

export class RouteSelectionError extends Error {
  override readonly name = 'RouteSelectionError';
  readonly code: 'ROUTE_MISSING' | 'ROUTE_INVALID' | 'MODULE_UNREADABLE';

  constructor(message: string, code: 'ROUTE_MISSING' | 'ROUTE_INVALID' | 'MODULE_UNREADABLE') {
    super(message);
    this.code = code;
  }
}

export type JudgmentModule = {
  readonly module_id: string;
  readonly file: string;
  /** Body with frontmatter stripped — what actually goes to a model. */
  readonly body: string;
  readonly frontmatter: string;
  readonly word_count: number;
  readonly byte_length: number;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const FENCED_CODE = /```[\s\S]*?```/g;

/**
 * Counts words by the **stated rule**: whitespace-delimited tokens in body prose,
 * with frontmatter and fenced code excluded.
 *
 * The rule is written down because "under 1,500 words" is not a testable claim
 * until you say what a word is. Without it the ceiling drifts with whoever counts.
 */
export function countPromptWords(markdown: string): number {
  const withoutFrontmatter = markdown.replace(FRONTMATTER, '');
  const withoutCode = withoutFrontmatter.replace(FENCED_CODE, '');
  return withoutCode.split(/\s+/).filter((token) => token.length > 0).length;
}

export function stripFrontmatter(markdown: string): { body: string; frontmatter: string } {
  const match = FRONTMATTER.exec(markdown);
  if (match === null) return { body: markdown, frontmatter: '' };
  return { body: markdown.slice(match[0].length), frontmatter: match[1] ?? '' };
}

function loadModule(file: string): JudgmentModule {
  const path = join(JUDGMENT_DIR, file);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new RouteSelectionError(`judgment module is unreadable: ${file}`, 'MODULE_UNREADABLE');
  }
  const { body, frontmatter } = stripFrontmatter(raw);
  const moduleId =
    /module:\s*([\w-]+)/.exec(frontmatter)?.[1] ?? file.replace(/\.md$/, '').replace(/^routes[/\\]/, '');
  return {
    module_id: moduleId,
    file,
    body,
    frontmatter,
    word_count: countPromptWords(raw),
    byte_length: Buffer.byteLength(body, 'utf8'),
  };
}

export function loadCoreModule(): JudgmentModule {
  return loadModule(CORE_MODULE_FILE);
}

/**
 * Loads **the one** module for a route.
 *
 * Validates the route itself rather than trusting a caller: this is the last point
 * before a model would see anything, and §15.3 requires a missing or invalid route
 * to block before assembly.
 */
export function selectRouteModule(runType: unknown): JudgmentModule {
  if (runType === undefined || runType === null || runType === '') {
    throw new RouteSelectionError(
      'run_type is required before a route module can be selected. There is no model ' +
        'route classifier (decision D3).',
      'ROUTE_MISSING',
    );
  }
  if (!isRunType(runType)) {
    throw new RouteSelectionError(
      `run_type must be one of ${RUN_TYPES.join(' | ')}, received: ${String(runType)}`,
      'ROUTE_INVALID',
    );
  }
  return loadModule(ROUTE_MODULE_FILES[runType]);
}

/** Every route module. Used only by tests — never by assembly, which loads one. */
export function loadAllRouteModulesForTesting(): Readonly<Record<RunType, JudgmentModule>> {
  return Object.fromEntries(RUN_TYPES.map((runType) => [runType, loadModule(ROUTE_MODULE_FILES[runType])])) as Record<
    RunType,
    JudgmentModule
  >;
}

/** The module ids not selected for a route — the leakage assertion checks that none
 *  of their distinctive content reached the assembled input. */
export function inactiveRouteModuleIds(runType: RunType): readonly string[] {
  return RUN_TYPES.filter((other) => other !== runType).map((other) => `route-${other}`);
}
