/**
 * Telemetry field definitions (§11.9).
 *
 * Defined now so Phase 2 wiring has a contract to satisfy. **No value here is
 * fabricated**: every field except one requires the model adapter that §7.2 places
 * out of scope, and a zeroed field is indistinguishable from a measurement.
 */

export type TokenTelemetry = {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_creation_tokens: number;
  readonly cache_read_tokens: number;
};

export type StageLatency = Readonly<Record<string, number>>;

/**
 * The one field Phase 1 can populate honestly: it measures what the assembler
 * produced, not what a model consumed, so it needs neither a tokenizer nor an
 * adapter. Reported in bytes; token figures are withheld until a tokenizer exists.
 */
export type PayloadSectionContribution = {
  readonly name: string;
  readonly bytes: number;
  readonly share: number;
};

export type RunTelemetry = {
  readonly model_id?: string | undefined;
  readonly prompt_version?: string | undefined;
  readonly tokens?: TokenTelemetry | undefined;
  readonly latency_by_stage_ms?: StageLatency | undefined;
  readonly payload_section_contribution: readonly PayloadSectionContribution[];
};

/** Which fields Phase 1 may populate. Anything else stays absent. */
export const PHASE1_POPULATABLE_FIELDS = ['payload_section_contribution', 'prompt_version'] as const;

export const PHASE2_REQUIRED_ADAPTER_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_creation_tokens',
  'cache_read_tokens',
  'model_id',
  'latency_by_stage_ms',
] as const;
