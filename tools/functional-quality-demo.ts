/**
 * Realistic functional-quality demonstration for a genuine component request.
 *
 * Not an HD-2/process-boundary evidence run (see `tools/verify-r1-hd2.ts` and
 * `tools/verify-r1-hd2-cross-process.ts`) — this tool asks a different
 * question: when a real, meaningful component request goes through the
 * Coordinator engine against the real curated bundle, are the design-system
 * references it lands on actually *good* semantic matches, or merely
 * validatable ones? "Validates" and "is a sensible design decision" are
 * different claims, and this tool is built to keep them visibly separate
 * rather than let a green pipeline stand in for design judgment.
 *
 * Runs the SAME request through two paths and prints both, in full:
 *
 *   Path 1 ("forced completion"): binds every requested property to
 *   whatever candidate is available, including ones a human designer would
 *   reject on sight, and shows that the run still validates, still reaches
 *   `ready`, still gets approved, and still produces a full artifact/handoff.
 *   This is the failure mode the request explicitly warns against: treating
 *   "the pipeline said PASS" as evidence of design quality.
 *
 *   Path 2 ("judgment applied"): binds only the properties with a
 *   semantically defensible candidate, and raises the remaining ones as a
 *   genuine *blocking* clarification gap rather than picking something weak
 *   just to finish. (A non-blocking gap was tried first and rejected here —
 *   see the printed note on why; the composed 'ready' output for a `new` run
 *   carries no field a non-blocking gap survives into, so "flag it but still
 *   finish, visibly" is not currently a real option — only "finish silently"
 *   or "actually stop" are.)
 *
 * Usage:
 *   ADALFI_ARTIFACT_DIR=<bundle> node tools/functional-quality-demo.ts <approved-data-dir>
 */
import { join } from 'node:path';
import { resolvePhase1Config } from '../src/config/phase1-config.ts';
import { CoordinatorEngine } from '../src/tools/engine.ts';
import { CURATED_SOURCE_RELATIVE } from './artifact-bundle.ts';
import type { CoordinatorJudgmentDraft } from '../src/contracts/coordinator-draft.ts';
import type { ResolverCandidate } from '../src/contracts/resolution.ts';

function log(line = ''): void {
  process.stdout.write(`${line}\n`);
}

function section(title: string): void {
  log('');
  log('='.repeat(78));
  log(title);
  log('='.repeat(78));
}

/** A human-authored verdict on one candidate, for one specific binding intent —
 *  never derived from the candidate's own (fabricated-default) confidence. */
type Verdict = {
  readonly property: string;
  readonly candidate: ResolverCandidate | undefined;
  readonly appropriate: boolean;
  readonly rationale: string;
};

function printCandidates(candidates: Readonly<Record<string, readonly ResolverCandidate[]>>): void {
  for (const [category, list] of Object.entries(candidates)) {
    log(`\n[${category}] — ${list.length} candidate(s), every one confidence="low"/ranking_reasons=[broadened-retrieval]`);
    for (const c of list) {
      const preview = c.value_preview !== undefined ? ` = ${String(c.value_preview)}` : '';
      const mode = c.mode !== undefined ? ` mode=${c.mode}` : '';
      log(`  - ${c.candidate_id}  ${c.ref_class}  ${c.path}${preview}${mode}`);
    }
  }
}

function printVerdicts(verdicts: readonly Verdict[]): void {
  for (const v of verdicts) {
    const mark = v.appropriate ? 'APPROPRIATE' : 'WEAK / INAPPROPRIATE';
    const where = v.candidate === undefined ? '(none offered)' : `${v.candidate.ref_class} ${v.candidate.path}`;
    log(`  [${mark}] ${v.property} <- ${where}`);
    log(`      ${v.rationale}`);
  }
}

function main(): void {
  const artifactDir = process.env['ADALFI_ARTIFACT_DIR'];
  const approvedDataDir = process.argv[2];
  if (artifactDir === undefined || artifactDir.trim() === '') {
    console.error('ADALFI_ARTIFACT_DIR must be set (the same bundle `npm run verify` uses).');
    process.exit(1);
  }
  if (approvedDataDir === undefined || approvedDataDir.trim() === '') {
    console.error('Usage: node tools/functional-quality-demo.ts <approved-data-dir>');
    process.exit(1);
  }

  const config = resolvePhase1Config({
    curatedSourcePath: join(artifactDir, CURATED_SOURCE_RELATIVE),
    derivedDir: join(approvedDataDir, 'derived-index'),
    approvedDataDirectory: join(approvedDataDir, 'run-store'),
  });

  const request = {
    operation_id: 'component.create',
    user_intent:
      'Create a Primary Action Button: the main call-to-action button used to confirm ' +
      'or advance a flow (e.g. "Continue", "Confirm"). Needs a size variant (sm/md/lg) ' +
      'and an interaction-state variant (default/hover/pressed/disabled); a solid ' +
      'primary-brand fill, bold call-to-action label typography, and rounded corners ' +
      'consistent with the rest of the button family.',
  };

  section('REQUEST');
  log(JSON.stringify(request, null, 2));

  const engine = new CoordinatorEngine({ phase1Config: () => config });
  const begun = engine.beginRun(request);

  section('COMMAND / ROUTE SELECTED');
  log(`run_id: ${begun.run_id}`);
  log(`display_id: ${begun.display_id}`);
  log('operation_id "component.create" -> run_type "new" (new-component route module)');

  const prepared = engine.prepareContext(begun.run_id);

  section('CANDIDATES CONSIDERED (prepareContext, real bundle)');
  log(
    'PD-7 (docs/phase2-decision-log.md, src/tools/engine.ts:21-30): a `new` run has no semantic\n' +
      'elements yet, so there is no narrow, ranked query to run. Every category below is the Guard\'s\n' +
      'own capped broadening escape hatch (listByCategory), NOT a search for "primary button fill" or\n' +
      'any other stated intent — the same five-per-category list would be returned for any request.',
  );
  printCandidates(prepared.candidates);

  const byCategory = (name: string): readonly ResolverCandidate[] => prepared.candidates[`category:${name}`] ?? [];
  const colorCandidates = byCategory('color');
  const typeCandidates = byCategory('typography');
  const spacingCandidates = byCategory('spacing');
  const effectCandidates = byCategory('effect');
  const radiusCandidates = byCategory('corner-radius');

  // Human judgment on the specific candidates this bundle actually returned —
  // fixed per binding intent, not derived from any field the system reports.
  const fillPick = colorCandidates.find((c) => c.path === 'brand/Dark Green 1');
  const typePick = typeCandidates.find((c) => c.path === 'cta/xs/bold');
  // Re-picked 2026-09-06 after the curated export retired `radius/round-shape/sm`
  // along with the rest of that family's leaves (MB-18). Chosen by the same
  // reasoning as before — the smallest offered radius on the button-plausible
  // end of the scale — against the family the export replaced it with.
  const radiusPick = radiusCandidates.find((c) => c.path === 'radius/round-shape/reg/xxxs');
  const spacingPick = spacingCandidates[0];
  const effectPick = effectCandidates[0];

  const verdicts: Verdict[] = [
    {
      property: 'fill (root container)',
      candidate: fillPick,
      appropriate: fillPick !== undefined,
      rationale:
        'The only offered color candidate whose name plausibly denotes a primary brand color. ' +
        'Genuinely uncertain, not confidently good: nothing in this candidate or its metadata confirms ' +
        'it is *the* brand-primary token (vs. one of several greens) — accepted provisionally, flagged ' +
        'for design confirmation below. The other four color candidates offered ' +
        '(an alpha-opacity token, an on-surface neutral, a cyan primitive, a teal primitive) are not ' +
        'plausible primary-button fills at all.',
    },
    {
      property: 'text_style (label)',
      candidate: typePick,
      appropriate: typePick !== undefined,
      rationale:
        'Named "cta" — call-to-action — which is exactly this element\'s role. The strongest, most ' +
        'defensible match in the entire candidate set, and the only one whose name states its intended ' +
        'use rather than requiring a guess.',
    },
    {
      property: 'corner_radius (root container)',
      candidate: radiusPick,
      appropriate: radiusPick !== undefined,
      rationale:
        radiusPick === undefined
          ? 'No corner-radius candidate offered at all.'
          : `The smallest radius on the offered scale (${radiusCandidates
              .map((c) => String(c.value_preview))
              .join('/')}) — a plausible, ordinary button radius. Reasonable, not provably correct: ` +
            'nothing distinguishes it from the next step up as *the* button radius without seeing how ' +
            'radius tokens are used elsewhere. The scale itself is stated from the candidates actually ' +
            'returned, not from memory: the previous hard-coded "2/4/8/10/12" survived a source change ' +
            'that made it false, which is the failure this tool exists to expose in others.',
    },
    {
      property: 'padding / internal spacing (label <-> edge)',
      candidate: spacingPick,
      appropriate: false,
      rationale:
        spacingPick === undefined
          ? 'No spacing candidate offered at all.'
          : `Every spacing candidate offered is either an unrelated auxiliary token ("${spacingCandidates[0]?.path}") ` +
            `or a page-layout value far too large for text-to-edge padding (${spacingCandidates
              .slice(1)
              .map((c) => `${c.path}=${String(c.value_preview)}`)
              .join(', ')}) — an 80pt inset is a section gutter, not a button's internal padding. ` +
            'None of the five is a semantically valid choice here. ' +
            'The disqualifying property is stated from the returned values rather than asserted: this ' +
            'rationale previously read "a *negative* value", which was true of the 2026-07-28 bundle and ' +
            'became a printed falsehood the moment the export changed the offered set.',
    },
    {
      property: 'box_shadow (root container, optional elevation)',
      candidate: effectPick,
      appropriate: false,
      rationale:
        effectPick === undefined
          ? 'No effect candidate offered at all.'
          : `The only effect token in the entire bundle is "${effectPick.path}" — a dropdown/grid-header ` +
            'shadow. Binding it to a button would carry a specific, unrelated component\'s elevation onto ' +
            'this one. Not a defensible match; a button with no shadow is preferable to this.',
    },
  ];

  section('SELECTED DESIGN-SYSTEM REFERENCES — evaluated for semantic fit, not just validity');
  printVerdicts(verdicts);
  log(
    '\nNote on "confidence": every candidate above reports confidence="low" at generation time ' +
      '(list-by-category.ts:87-90, "nothing here has been ranked against intent"). That is real and ' +
      'correctly reported at this stage. What happens to it after selection is checked in Path 1 below.',
  );

  if (fillPick === undefined || typePick === undefined || radiusPick === undefined) {
    console.error('FAILED: expected candidates for the appropriate-fit demonstration were not found in this bundle.');
    process.exit(1);
  }

  // =========================================================================
  // PATH 1 — forced completion: bind everything, including the weak ones.
  // =========================================================================
  section('PATH 1 — "forced completion" (binds the weak candidates anyway, to show what merely validating proves)');

  const forcedDraft: CoordinatorJudgmentDraft = {
    run_type: 'new',
    self_assessment: 'believe-complete',
    semantic_brief: {
      component_name: 'Primary Action Button (forced-completion path)',
      intent_summary: 'The main call-to-action button — every property bound, including weak matches.',
      variant_properties: [
        { name: 'size', options: ['sm', 'md', 'lg'], default_option: 'md' },
        { name: 'state', options: ['default', 'hover', 'pressed', 'disabled'], default_option: 'default' },
      ],
      elements: [
        {
          semantic_id: 'root',
          role: 'container',
          bindings: [
            { property: 'fill', reference_text: 'primary brand fill for the button surface', selected_candidate_id: fillPick.candidate_id },
            { property: 'corner_radius', reference_text: 'button corner rounding', selected_candidate_id: radiusPick.candidate_id },
            ...(spacingPick !== undefined
              ? [
                  {
                    property: 'padding',
                    reference_text: 'internal horizontal padding between label and edge',
                    selected_candidate_id: spacingPick.candidate_id,
                  },
                ]
              : []),
            ...(effectPick !== undefined
              ? [
                  {
                    property: 'box_shadow',
                    reference_text: 'resting elevation shadow',
                    selected_candidate_id: effectPick.candidate_id,
                  },
                ]
              : []),
          ],
        },
        {
          semantic_id: 'label',
          role: 'text',
          text_content: 'Continue',
          bindings: [
            { property: 'text_style', reference_text: 'bold call-to-action label typography', selected_candidate_id: typePick.candidate_id },
          ],
        },
      ],
    },
  };

  const forcedSubmit = engine.submitDraft(begun.run_id, forcedDraft);
  log(`submitDraft -> outcome=${forcedSubmit.outcome}`);
  if (forcedSubmit.outcome === 'accepted') {
    const forcedPresented = engine.presentForApproval(begun.run_id);
    log(`\n--- forced-completion approval view (exactly what a human would read) ---`);
    log(forcedPresented.approval_view.body);
    log(
      '\n^ Observe: this view reports an aggregate confidence, but src/tools/engine.ts\'s submitDraft never ' +
        'passes `perResolutionConfidence` to composeTrustedOutput (compose-trusted-output.ts:246-249 falls ' +
        'back to "medium" for every resolution when it is absent). The number shown here is NOT derived from ' +
        'the real, low confidence every one of these candidates actually carried at generation time — it is a ' +
        'hardcoded default. A human approving from this view has no visibility that two of the four bindings ' +
        '(padding, shadow) are matches this same tool just judged semantically inappropriate above.',
    );
    const forcedRecorded = engine.recordApproval(begun.run_id, 'approved', 'functional-quality-demo-tool');
    const forcedHandoff = engine.buildHandoff(begun.run_id);
    const forcedClosed = engine.closeRun(begun.run_id, 'completed');
    log(`\nartifact_sha256: ${forcedPresented.artifact_sha256}`);
    log(`recordApproval -> outcome=${forcedRecorded.outcome}`);
    log(`buildHandoff -> next_route=${String(forcedHandoff.next_route)}`);
    log(`closeRun -> outcome=${forcedClosed.outcome}`);
    log(
      '\nRESULT (path 1): the pipeline validated, approved, and completed a button whose padding and shadow ' +
        'this tool judged semantically wrong. "Validated and completed" is not evidence the design references ' +
        'chosen were good ones.',
    );
  } else {
    log(`(path 1 did not reach 'accepted': ${JSON.stringify(forcedSubmit)})`);
  }

  // =========================================================================
  // PATH 2 — judgment applied: bind only the defensible properties, raise a
  // genuine blocking gap for the rest instead of forcing a weak pick.
  // =========================================================================
  section('PATH 2 — judgment applied (binds only defensible candidates; blocks rather than forces the rest)');

  const begun2 = engine.beginRun({
    operation_id: 'component.create',
    user_intent: request.user_intent + ' (judgment-applied path — same request, second run)',
  });
  engine.prepareContext(begun2.run_id);

  const judgmentDraft: CoordinatorJudgmentDraft = {
    run_type: 'new',
    self_assessment: 'need-clarification',
    semantic_brief: {
      component_name: 'Primary Action Button',
      intent_summary:
        'The main call-to-action button — fill, label typography and corner radius bound; padding and ' +
        'shadow deliberately left open pending a design answer (see clarification gap).',
      variant_properties: [
        { name: 'size', options: ['sm', 'md', 'lg'], default_option: 'md' },
        { name: 'state', options: ['default', 'hover', 'pressed', 'disabled'], default_option: 'default' },
      ],
      elements: [
        {
          semantic_id: 'root',
          role: 'container',
          bindings: [
            { property: 'fill', reference_text: 'primary brand fill for the button surface', selected_candidate_id: fillPick.candidate_id },
            { property: 'corner_radius', reference_text: 'button corner rounding', selected_candidate_id: radiusPick.candidate_id },
          ],
        },
        {
          semantic_id: 'label',
          role: 'text',
          text_content: 'Continue',
          bindings: [
            { property: 'text_style', reference_text: 'bold call-to-action label typography', selected_candidate_id: typePick.candidate_id },
          ],
        },
      ],
    },
    clarification_gaps: [
      {
        gap_id: 'gap-button-padding-and-shadow',
        state: 'active',
        severity: 'blocking',
        owner: 'user',
        question:
          'No design-system token adequately represents this button\'s internal padding or an interactive ' +
          'elevation shadow. Available spacing candidates were either an unrelated auxiliary token or negative ' +
          'values (invalid for padding); the only effect token in the bundle is a dropdown/grid-header shadow. ' +
          'Should new tokens be added for button internals, does an appropriate token already exist under a ' +
          'name this broadened listing did not surface, or should this button ship with layout-default padding ' +
          'and no custom shadow?',
        evidence: `spacing candidates seen: ${spacingCandidates.map((c) => `${c.path}=${String(c.value_preview)}`).join(', ')}; ` +
          `effect candidates seen: ${effectCandidates.map((c) => c.path).join(', ') || '(none)'}`,
        required_answer:
          'Either a specific candidate_id for padding/shadow, or explicit confirmation to ship without them.',
        opened_in_round: 1,
      },
    ],
  };

  const judgmentSubmit = engine.submitDraft(begun2.run_id, judgmentDraft);
  log(`submitDraft -> outcome=${judgmentSubmit.outcome}`);
  log(`run_id: ${begun2.run_id}`);
  const afterSubmit = engine.resumeRun(begun2.run_id);
  log(`phase after submitDraft: ${afterSubmit.phase} (expected "validating" with a blocked composition)`);

  if (afterSubmit.phase === 'validating') {
    const opened = engine.openClarification(begun2.run_id);
    log(`openClarification -> phase=${opened.phase}, round=${opened.round}`);
    log(
      '\nRESULT (path 2): the run stopped for a real human answer instead of fabricating padding/shadow ' +
        'bindings from candidates this tool judged inappropriate. No artifact hash, no approval view and no ' +
        'handoff exist for this run yet — correctly, since nothing ready has been produced. That absence is ' +
        'itself the evidence: a weak selection was flagged, not forced through.',
    );
  } else {
    log(`(unexpected: path 2 did not land in 'validating' — phase was "${afterSubmit.phase}")`);
  }

  section('WHAT THIS DEMONSTRATION SHOWS AND DOES NOT SHOW');
  log(
    'Shows: (1) for a `new` run, every candidate offered is an unranked, capped, category-wide broadening ' +
      '(PD-7) — never a search against the stated intent; (2) `engine.ts`\'s `submitDraft` never forwards real ' +
      'per-resolution confidence into `composeTrustedOutput`, so the approval view\'s aggregate confidence is a ' +
      'hardcoded "medium" regardless of how weak the real matches were (this is a genuine wiring gap, not a ' +
      'documented tradeoff like PD-7); (3) a `new`-run \'ready\' composed output carries no field a non-blocking ' +
      'clarification gap survives into, so "flag it but still finish, visibly" is not currently possible — only ' +
      '"finish silently" (Path 1) or "actually stop" (Path 2) are; (4) at least one of the five candidates in ' +
      'this bundle (the "cta" typography token) is a genuinely strong match, so the resolver is not uniformly ' +
      'poor — it is uninformed by intent for new runs, which is a different and more specific problem.\n' +
      'Does not show: resolver quality on `modify`/`audit` runs (which do have a real target and can plan ' +
      'narrower queries, per engine.ts:28-30); real human judgment (every "appropriate/weak" verdict above is ' +
      'this tool\'s own reasoning, not a design reviewer\'s); or any Figma/Builder execution.',
  );
}

main();
