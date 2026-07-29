/**
 * JSON Schema validation setup (P1-FINAL §11.5).
 *
 * Requirements this module exists to satisfy:
 *   - JSON Schema Draft 2020-12;
 *   - `format` **assertion**, not annotation — the v1 schema declared
 *     `run_id: format: uuid` while the canonical fixture used
 *     `warning-toast-run-002`, and it passed only because assertion was off;
 *   - closed objects via `unevaluatedProperties: false` (SA-12: the v1 schema
 *     had zero occurrences of `additionalProperties`/`unevaluatedProperties`,
 *     so every contract object was open).
 *
 * Errors are returned, never thrown, and carry a stable machine-readable code
 * so downstream repair prompts stay compact (§16.2).
 */
// Interop note, verified by execution against ajv 8.20.0 / ajv-formats 3.0.1:
// both packages are CJS. Node's ESM interop makes ajv's *named* `Ajv2020` the
// constructor, while ajv-formats' default is directly callable. Importing
// ajv's default instead yields the module namespace, which is not constructable
// — so the named form here is deliberate, not stylistic.
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type { ErrorObject, ValidateFunction } from 'ajv';

type AjvInstance = InstanceType<typeof Ajv2020>;
type AddFormats = (ajv: AjvInstance) => AjvInstance;

/**
 * ajv-formats is CJS with an ESM-style `.d.ts`, so TypeScript models its default
 * import as the module namespace while Node makes it directly callable. Rather
 * than assert one shape, normalise both — this boundary is a known source of
 * version-dependent breakage, and the cost of tolerance here is one expression.
 */
const addFormats: AddFormats =
  typeof addFormatsModule === 'function'
    ? (addFormatsModule as unknown as AddFormats)
    : ((addFormatsModule as { default: unknown }).default as AddFormats);

export type SchemaErrorCode =
  | 'SCHEMA_UNKNOWN_FIELD'
  | 'SCHEMA_MISSING_REQUIRED'
  | 'SCHEMA_TYPE_MISMATCH'
  | 'SCHEMA_ENUM_MISMATCH'
  | 'SCHEMA_FORMAT_INVALID'
  | 'SCHEMA_CONSTRAINT_FAILED';

export type SchemaViolation = {
  readonly code: SchemaErrorCode;
  /** JSON Pointer to the offending instance location. */
  readonly instancePath: string;
  /** JSON Pointer into the schema — the contract location (§16.2). */
  readonly schemaPath: string;
  readonly message: string;
  readonly enforcedBy: 'schema';
};

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly SchemaViolation[] };

function classify(error: ErrorObject): SchemaErrorCode {
  switch (error.keyword) {
    case 'additionalProperties':
    case 'unevaluatedProperties':
      return 'SCHEMA_UNKNOWN_FIELD';
    case 'required':
      return 'SCHEMA_MISSING_REQUIRED';
    case 'type':
      return 'SCHEMA_TYPE_MISMATCH';
    case 'enum':
    case 'const':
      return 'SCHEMA_ENUM_MISMATCH';
    case 'format':
      return 'SCHEMA_FORMAT_INVALID';
    default:
      return 'SCHEMA_CONSTRAINT_FAILED';
  }
}

function toViolation(error: ErrorObject): SchemaViolation {
  const offending =
    typeof error.params === 'object' && error.params !== null && 'additionalProperty' in error.params
      ? ` (${String((error.params as { additionalProperty: unknown }).additionalProperty)})`
      : '';
  return {
    code: classify(error),
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    message: `${error.message ?? 'validation failed'}${offending}`,
    enforcedBy: 'schema',
  };
}

export class SchemaRegistry {
  private readonly ajv: AjvInstance;

  constructor() {
    this.ajv = new Ajv2020({
      strict: true,
      // Format assertion, not annotation. This is the setting whose absence let
      // a non-UUID run_id pass the v1 schema.
      validateFormats: true,
      allErrors: true,
      allowUnionTypes: false,
    });
    addFormats(this.ajv);
  }

  /** Register a schema under its `$id`. Throws on an invalid schema — a broken
   *  contract is a build-time defect, not a runtime condition. */
  register(schema: object): void {
    this.ajv.addSchema(schema);
  }

  compile<T = unknown>(schema: object): ValidateFunction<T> {
    return this.ajv.compile<T>(schema);
  }

  validate(schemaId: string, data: unknown): ValidationResult {
    const validator = this.ajv.getSchema(schemaId);
    if (validator === undefined) {
      throw new Error(`No schema registered for $id: ${schemaId}`);
    }
    if (validator(data)) {
      return { ok: true };
    }
    return {
      ok: false,
      violations: (validator.errors ?? []).map(toViolation),
    };
  }
}
