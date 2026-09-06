/**
 * A1's third acceptance item: `modify` and `audit` refuse with the **named**
 * capability-gate error while `create` does not — driven from the public
 * command string a designer types, through the registry, into the Guard's own
 * derivation. Not from a hand-built `operation_id`: the claim is about the
 * command surface, so the test enters where the surface does.
 *
 * The distinction this file exists to hold: a registered-and-refusing command
 * is not the same thing as an unknown command. `/modify-component` must fail
 * at **G-3a** naming FD-1…FD-4, and `/build-component` must fail at G-14 as
 * unknown. Both fail; only one of them tells the designer that the capability
 * exists and is gated. Revision 4 records the reason (§2.4) and this test is
 * what keeps the two refusals from collapsing into one.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveBeginRun } from '../../src/guard/begin-run.ts';
import { GuardRefusal } from '../../src/guard/errors.ts';
import { resolveCommand, ResolveCommandError, OperationMappingError } from '../../src/registry/operations.ts';
import type { ObservedComponentTreeRef } from '../../src/contracts/invocation.ts';
import { readCommandFiles, COMMANDS_DIR } from '../../tools/command-surface.ts';

/** A synthetic reference. BP-5: no real Figma file key, node id or hash over
 *  real bytes reaches a tracked file, and the remote is public. */
const SYNTHETIC_TARGET: ObservedComponentTreeRef = {
  tree_ref: 'tree-ref-placeholder',
  tree_sha256: 'a'.repeat(64),
  node_count: 3,
  captured_at: '2026-09-06T00:00:00.000Z',
};

/** Everything a designer supplies: the command they typed and what they asked for. */
function beginFrom(publicName: string, target?: ObservedComponentTreeRef) {
  const { operation_id } = resolveCommand(publicName);
  return deriveBeginRun(
    target === undefined
      ? { operation_id, user_intent: 'a pill-shaped status chip' }
      : { operation_id, user_intent: 'a pill-shaped status chip', target },
  );
}

describe('the capability gate, entered from the command a designer types (§2.4, G-3a)', () => {
  test('/create-component is not gated — it derives a `new` run', () => {
    const derived = beginFrom('/create-component');
    assert.equal(derived.run_type, 'new');
    assert.equal(derived.phase, 'received');
    assert.match(derived.display_id, /^new-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  for (const command of ['/modify-component', '/audit-component', '/review-component']) {
    test(`${command} refuses with the named capability-gate code G-3a`, () => {
      assert.throws(
        () => beginFrom(command),
        (error: unknown) => {
          assert.ok(error instanceof GuardRefusal, `expected a GuardRefusal, got ${String(error)}`);
          assert.equal(error.code, 'G-3a');
          assert.equal(error.enforcedBy, 'run-guard');
          // The refusal must name the unmet dependency, not merely say "no".
          assert.match(error.message, /FD-1/);
          return true;
        },
      );
    });
  }

  test('the alias refuses identically to its canonical name — same code, same gate (G-18)', () => {
    const codes = ['/audit-component', '/review-component'].map((command) => {
      try {
        beginFrom(command);
        return 'no-refusal';
      } catch (error) {
        return error instanceof GuardRefusal ? error.code : 'wrong-error-type';
      }
    });
    assert.deepEqual(codes, ['G-3a', 'G-3a']);
  });

  test('a gated route refuses even when the designer supplies the target §2.4 requires', () => {
    // The gate is the missing connector, not the missing parameter. Supplying
    // a target must not be a way past it.
    assert.throws(
      () => beginFrom('/modify-component', SYNTHETIC_TARGET),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-3a',
    );
  });

  test('/create-component carrying a target is refused at G-3b, a different rule (§2.4)', () => {
    assert.throws(
      () => beginFrom('/create-component', SYNTHETIC_TARGET),
      (error: unknown) => error instanceof GuardRefusal && error.code === 'G-3b',
    );
  });
});

describe('a refusal that is gated is distinguishable from a refusal that is unknown', () => {
  test('an unregistered command fails at the registry (G-14), never reaching the Guard', () => {
    assert.throws(
      () => beginFrom('/build-component'),
      (error: unknown) => error instanceof ResolveCommandError && error.code === 'COMMAND_UNKNOWN',
    );
  });

  test('the two refusals carry different error types, so a caller cannot conflate them', () => {
    const gated = (() => {
      try {
        beginFrom('/modify-component');
      } catch (error) {
        return error;
      }
      return undefined;
    })();
    const unknown = (() => {
      try {
        beginFrom('/build-component');
      } catch (error) {
        return error;
      }
      return undefined;
    })();
    assert.ok(gated instanceof GuardRefusal);
    assert.ok(unknown instanceof ResolveCommandError);
    assert.ok(!(unknown instanceof GuardRefusal));
  });
});

describe('a maintenance command never enters the authoring pipeline (§2.11, G-2)', () => {
  for (const command of ['/refresh-source', '/validate-source']) {
    test(`${command} resolves as maintenance and beginRun refuses it`, () => {
      const resolved = resolveCommand(command);
      assert.equal(resolved.kind, 'maintenance');
      assert.throws(
        () => deriveBeginRun({ operation_id: resolved.operation_id, user_intent: 'refresh' }),
        (error: unknown) => {
          // G-2's refusal reaches the caller as a GuardRefusal from
          // `deriveBeginRun`, which wraps the registry's mapping error.
          assert.ok(error instanceof GuardRefusal);
          assert.equal(error.code, 'G-2');
          assert.ok(!(error instanceof OperationMappingError));
          return true;
        },
      );
    });
  }

  test('MB-1 added aliases and no operation — the maintenance rows still carry no RunType', () => {
    for (const command of ['/refresh-source', '/validate-source', 'source.refresh', 'source.validate']) {
      assert.equal(resolveCommand(command).kind, 'maintenance');
    }
    assert.equal(resolveCommand('/refresh-source').operation_id, resolveCommand('source.refresh').operation_id);
    assert.equal(resolveCommand('/validate-source').operation_id, resolveCommand('source.validate').operation_id);
  });
});

describe('the gated commands say so in the file a designer reads (§16.3)', () => {
  const bodies = new Map(
    readCommandFiles().map((file) => [file.publicName, readFileSync(join(COMMANDS_DIR, `${file.name}.md`), 'utf8')]),
  );

  for (const command of ['/modify-component', '/audit-component']) {
    test(`${command}'s file names the gate rather than promising a run`, () => {
      const body = bodies.get(command);
      assert.ok(body !== undefined);
      assert.match(body, /G-3a/);
      assert.match(body, /FD-1/);
    });
  }

  test("/create-component's file does not claim a gate it does not have", () => {
    const body = bodies.get('/create-component');
    assert.ok(body !== undefined);
    assert.ok(!/G-3a/.test(body), 'the ungated route must not advertise the capability gate');
  });
});
