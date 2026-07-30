/**
 * The human approval view (§16.3).
 *
 * Rendered from the **validated trusted output and nothing else**. There is no
 * second payload, no separately authored summary, and no parameter that could
 * introduce a fact the object does not contain.
 *
 * Both renderers bind `source_object_sha256`, so "the human approved the same thing
 * the machine received" is checkable rather than assumed. Two independently authored
 * views is how a human comes to approve something subtly different from what gets
 * built — and the approval record binds a hash, so a divergence would make the
 * approval refer to neither.
 *
 * The view must **not** imply Builder has run or that a Figma artifact exists.
 * Nothing has been built at the point a human reads this.
 */
import { hashOutput } from '../coordinator/compose-trusted-output.ts';
import { isReady } from '../contracts/coordinator-output.ts';
import type { CoordinatorOutput } from '../contracts/coordinator-output.ts';
import type { TypedResolution } from '../contracts/resolution.ts';

export type ApprovalView = {
  /** Binds this rendering to the exact object it came from. */
  readonly source_object_sha256: string;
  readonly title: string;
  readonly body: string;
  /** What the human is actually being asked to approve, itemised. */
  readonly decisions: readonly string[];
};

function renderResolution(resolution: TypedResolution): string {
  const detail: string[] = [`${resolution.ref_class}`, resolution.path];
  if (resolution.ref_class === 'variable' && resolution.value !== undefined) {
    detail.push(`= ${String(resolution.value)}`);
  }
  if (resolution.ref_class === 'text-style' && resolution.font_size !== undefined) {
    // Provenance, not an assertion: the size came from the style→variable join.
    detail.push(`font-size ${resolution.font_size} (literal, confirmed by the bound type-scale variable)`);
  }
  const mode = 'mode' in resolution && resolution.mode !== undefined ? ` mode=${resolution.mode}` : '';
  return `  - ${detail.join(' ')}${mode}\n    key ${resolution.key} · ref ${resolution.source_record_ref}`;
}

export function renderApprovalView(output: CoordinatorOutput): ApprovalView {
  const lines: string[] = [];
  const decisions: string[] = [];
  const sha = hashOutput(output);

  const title =
    output.status === 'ready'
      ? `Approve semantic intent — ${output.run_type}`
      : output.status === 'blocked'
        ? `Blocked — ${output.run_type} cannot proceed`
        : `Failed — ${output.run_type}`;

  lines.push(`Run ${output.run_id}`);
  lines.push(`Route: ${output.run_type}   Status: ${output.status}`);
  lines.push(
    `Design-system snapshot: ${output.snapshot.source_sha256.slice(0, 12)}… ` +
      `(schema ${output.snapshot.source_schema_version}, index ${output.snapshot.index_version})`,
  );
  lines.push('');

  // Stated plainly and early, because the most likely misreading of this view is
  // that something has already been built.
  lines.push('NOTHING HAS BEEN BUILT. No Figma artifact exists. You are approving intent only.');
  lines.push('');

  if (isReady(output)) {
    if (output.run_type === 'new') {
      lines.push(`Component: ${output.semantic_brief.component_name}`);
      lines.push(`Intent: ${output.semantic_brief.intent_summary}`);
      lines.push('');
      lines.push('Variant axes:');
      for (const property of output.semantic_brief.variant_properties) {
        const marked = property.options.map((option) =>
          option === property.default_option ? `${option} (default)` : option,
        );
        lines.push(`  ${property.name}: ${marked.join(' · ')}`);
      }
      lines.push('');
      lines.push('Semantic elements:');
      for (const element of output.semantic_brief.elements) {
        const parent = element.parent_semantic_id === undefined ? '' : ` in ${element.parent_semantic_id}`;
        lines.push(`  ${element.semantic_id} — ${element.role}${parent}`);
        for (const binding of element.bindings) {
          const scope = binding.applies_to_option === undefined ? '' : ` [${binding.applies_to_option} only]`;
          lines.push(`    ${binding.property}${scope} ← "${binding.reference_text}"`);
        }
      }
      decisions.push(`Approve ${output.semantic_brief.elements.length} semantic elements as described`);
      decisions.push(`Approve ${output.resolutions.length} design-system references as resolved`);
    }

    if (output.run_type === 'modify') {
      lines.push(`Component: ${output.semantic_delta.component_name}`);
      lines.push(`Intent: ${output.semantic_delta.intent_summary}`);
      lines.push(`Target: ${output.target.tree_ref} @ ${output.target.tree_sha256.slice(0, 12)}…`);
      lines.push('');
      lines.push('Changes:');
      for (const item of output.semantic_delta.items) {
        lines.push(`  [${item.change_status}/${item.change_type}] ${item.summary}`);
        const transition = item.variant_transition;
        if (transition !== undefined) {
          lines.push(
            `    ${transition.property_name}: ${transition.options_before.join(' · ')}` +
              `  →  ${transition.options_after.join(' · ')}`,
          );
        }
      }
      lines.push('');
      lines.push('Preservation obligations — checked after the build:');
      for (const obligation of output.preservation_contract.obligations) {
        lines.push(`  ${obligation.description}`);
        lines.push(`    why: ${obligation.reason}`);
        lines.push(`    verified by: ${obligation.verification}`);
      }
      if (output.preservation_contract.untouched_semantic_ids.length > 0) {
        lines.push(
          `  Deliberately untouched: ${output.preservation_contract.untouched_semantic_ids.join(', ')}`,
        );
      }
      decisions.push(`Approve ${output.semantic_delta.items.length} changes as described`);
      decisions.push(
        `Approve ${output.preservation_contract.obligations.length} preservation obligations as sufficient`,
      );
    }

    if (output.run_type === 'audit') {
      lines.push(`Component: ${output.audit_brief.component_name}`);
      lines.push(`Scope: ${output.audit_brief.scope}`);
      lines.push(`Focus: ${output.audit_brief.focus_summary}`);
      lines.push(`Dimensions: ${output.audit_brief.dimensions.join(', ')}`);
      lines.push('');
      const coverage = output.extraction_coverage;
      const pct =
        coverage.total_nodes === 0
          ? 0
          : Math.round((coverage.examined_nodes / coverage.total_nodes) * 100);
      lines.push(`Extraction coverage: ${coverage.examined_nodes} of ${coverage.total_nodes} nodes (${pct}%)`);
      if (coverage.exclusions.length > 0) {
        lines.push('Not examined:');
        for (const exclusion of coverage.exclusions) {
          const count = exclusion.node_count === undefined ? '' : ` (${exclusion.node_count} nodes)`;
          lines.push(`  ${exclusion.locator}${count} — ${exclusion.reason}`);
        }
      }
      decisions.push(`Approve the audit scope "${output.audit_brief.scope}" as the right question`);
      decisions.push(`Accept ${pct}% coverage, with the exclusions listed, as sufficient`);
    }

    if ('resolutions' in output && output.resolutions !== undefined && output.resolutions.length > 0) {
      lines.push('');
      lines.push('Resolved references — every field verified against the pinned snapshot:');
      for (const resolution of output.resolutions) lines.push(renderResolution(resolution));
      lines.push('');
      lines.push(`Aggregate confidence: ${'aggregate_confidence' in output ? output.aggregate_confidence : 'n/a'}`);
      lines.push('  (the weakest individual resolution, not an average)');
    }
  }

  if (output.status === 'blocked') {
    lines.push('This run cannot proceed until these are answered:');
    for (const gap of output.active_gaps) {
      lines.push(`  [${gap.gap_id}] ${gap.question}`);
      lines.push(`    evidence: ${gap.evidence}`);
      lines.push(`    needs: ${gap.required_answer}`);
    }
    if (output.partial_resolutions !== undefined && output.partial_resolutions.length > 0) {
      lines.push('');
      lines.push('Already verified and retained, so it need not be re-resolved:');
      for (const resolution of output.partial_resolutions) lines.push(renderResolution(resolution));
    }
    decisions.push('Answer the open questions, or cancel the run');
  }

  if (output.status === 'failed') {
    lines.push(`Failure: ${output.failure.failure_class}`);
    lines.push(`Terminal: ${output.failure.terminal ? 'yes' : 'no'}   Repairable: ${output.failure.repairable ? 'yes' : 'no'}`);
    lines.push('Evidence:');
    for (const evidence of output.failure.evidence) {
      lines.push(`  ${evidence.code} (${evidence.enforced_by}) — ${evidence.message}`);
    }
    decisions.push('No approval is possible; this run did not produce intent');
  }

  // Non-blocking disclosures are shown on every variant. Withholding them on a
  // failure is how a known limitation becomes invisible.
  if (output.disclosures.length > 0) {
    lines.push('');
    lines.push('Disclosures — informational, and cannot block this run:');
    for (const disclosure of output.disclosures) {
      lines.push(`  [${disclosure.kind}] ${disclosure.evidence}`);
    }
  }

  lines.push('');
  lines.push(`Approving binds this exact artifact: sha256 ${sha}`);

  return { source_object_sha256: sha, title, body: lines.join('\n'), decisions };
}
