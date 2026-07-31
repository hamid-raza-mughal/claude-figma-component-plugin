/**
 * The command registry (§2.7–§2.9): public labels are not identities.
 *
 * "The registry is data, not branches" (§2.8) — one table maps every public
 * name and alias to one `operation_id`; nothing downstream branches on the
 * string that was typed. `run_type` is **derived** from `operation_id` here
 * (§2.10.3.1) and is never accepted as a caller-supplied parameter anywhere
 * else (G-15).
 */
import { RUN_TYPES, type RunType } from '../contracts/invocation.ts';

export const OPERATION_KINDS = ['route', 'maintenance'] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export type OperationRow = {
  readonly operationId: string;
  readonly kind: OperationKind;
  /** `null` for maintenance operations — they carry no `RunType` (§2.11). */
  readonly runType: RunType | null;
  readonly publicName: string;
  readonly aliases: readonly string[];
};

/**
 * §2.7's five rows, verbatim. `RUN_TYPES` stays closed at three
 * (`src/contracts/invocation.ts`, unwidened) — this registry maps onto it, it
 * does not extend it (§2.7.1). `/review-component` is an **alias** of
 * `component.audit`, not a fourth route: §2.7.0 states there is no
 * `component.review` operation.
 */
export const OPERATIONS: readonly OperationRow[] = [
  {
    operationId: 'component.create',
    kind: 'route',
    runType: 'new',
    publicName: '/create-component',
    aliases: [],
  },
  {
    operationId: 'component.modify',
    kind: 'route',
    runType: 'modify',
    publicName: '/modify-component',
    aliases: [],
  },
  {
    operationId: 'component.audit',
    kind: 'route',
    runType: 'audit',
    publicName: '/audit-component',
    aliases: ['/review-component'],
  },
  {
    operationId: 'source.refresh',
    kind: 'maintenance',
    runType: null,
    publicName: 'source.refresh',
    aliases: [],
  },
  {
    operationId: 'source.validate',
    kind: 'maintenance',
    runType: null,
    publicName: 'source.validate',
    aliases: [],
  },
];

const BY_OPERATION_ID = new Map(OPERATIONS.map((row) => [row.operationId, row]));

/** Every public name/alias -> operation_id. Built once; §2.8's promise that
 *  renaming is "a registry edit," not a code change, depends on this being the
 *  only place names are resolved. */
const BY_PUBLIC_NAME = new Map<string, OperationRow>();
for (const row of OPERATIONS) {
  BY_PUBLIC_NAME.set(row.publicName, row);
  for (const alias of row.aliases) BY_PUBLIC_NAME.set(alias, row);
}

export class ResolveCommandError extends Error {
  override readonly name = 'ResolveCommandError';
  readonly code: 'COMMAND_UNKNOWN' | 'COMMAND_AMBIGUOUS';

  constructor(message: string, code: 'COMMAND_UNKNOWN' | 'COMMAND_AMBIGUOUS') {
    super(message);
    this.code = code;
  }
}

export type ResolveCommandResult = {
  readonly operation_id: string;
  readonly kind: OperationKind;
};

/**
 * `resolveCommand` (§13): the only tool that resolves a public string. G-14
 * refuses an unknown name before a run exists — there is nothing to resume or
 * clean up, so the refusal is a plain error, not a Guard-recorded event.
 *
 * "Ambiguous" is unreachable today because `BY_PUBLIC_NAME` is built from a
 * literal table with no duplicate keys (asserted in tests), but the code
 * checks for it rather than assuming the table can never grow a collision.
 */
export function resolveCommand(publicName: string): ResolveCommandResult {
  const matches = OPERATIONS.filter(
    (row) => row.publicName === publicName || row.aliases.includes(publicName),
  );
  if (matches.length === 0) {
    throw new ResolveCommandError(`Unknown command "${publicName}" (§2.8, G-14).`, 'COMMAND_UNKNOWN');
  }
  if (matches.length > 1) {
    throw new ResolveCommandError(`Ambiguous command "${publicName}" (§2.8, G-14).`, 'COMMAND_AMBIGUOUS');
  }
  const row = matches[0];
  if (row === undefined) {
    throw new ResolveCommandError(`Unknown command "${publicName}" (§2.8, G-14).`, 'COMMAND_UNKNOWN');
  }
  return { operation_id: row.operationId, kind: row.kind };
}

export class OperationMappingError extends Error {
  override readonly name = 'OperationMappingError';
  readonly code = 'OPERATION_ID_NO_CANONICAL_MAPPING';
}

/**
 * G-2 (revision 4 wording): refuses `beginRun` whose `operation_id` has no
 * canonical §2.7 mapping to a route, or maps to a maintenance operation
 * (`beginRun` starts an authoring run; maintenance operations never enter the
 * phase model, §2.11). `run_type` is derived here, never accepted as a
 * parameter (§2.10.3.1, G-15) — this function's return **is** the derivation.
 */
export function deriveRunTypeFromOperationId(operationId: string): RunType {
  const row = BY_OPERATION_ID.get(operationId);
  if (row === undefined || row.kind !== 'route' || row.runType === null) {
    throw new OperationMappingError(
      `"${operationId}" has no canonical §2.7 route mapping — beginRun refuses it (G-2).`,
    );
  }
  if (!RUN_TYPES.includes(row.runType)) {
    // Unreachable given the literal table above; kept because a mapping to an
    // invalid RunType would otherwise fail silently downstream instead of here.
    throw new OperationMappingError(`"${operationId}" maps to an invalid RunType (G-2).`);
  }
  return row.runType;
}

export function lookupOperation(operationId: string): OperationRow | undefined {
  return BY_OPERATION_ID.get(operationId);
}

/**
 * G-18: an alias must produce a run configuration identical to its canonical
 * name in everything but `invoked_as`. Since both resolve to the same
 * `OperationRow` here, the run configuration (`operation_id`, `runType`) is
 * identical by construction — there is no separate code path for an alias to
 * diverge through.
 */
export function canonicalPublicNameFor(operationId: string): string | undefined {
  return BY_OPERATION_ID.get(operationId)?.publicName;
}
