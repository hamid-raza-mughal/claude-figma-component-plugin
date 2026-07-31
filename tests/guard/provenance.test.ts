/**
 * §2.10.3: provenance is derived, never accepted from a caller. The absence
 * of a caller-supplied-claim parameter *is* the enforcement — these tests
 * confirm the default (every runtime today) and the one alternate path
 * (authoritative host evidence, unused by any runtime yet).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRouteProvenance } from '../../src/guard/provenance.ts';

describe('deriveRouteProvenance', () => {
  test('defaults to model-relayed / unverified with no host metadata', () => {
    assert.deepEqual(deriveRouteProvenance(), { route_provenance: 'model-relayed', route_verified: false });
  });

  test('defaults to model-relayed / unverified when metadata is explicitly undefined', () => {
    assert.deepEqual(deriveRouteProvenance(undefined), {
      route_provenance: 'model-relayed',
      route_verified: false,
    });
  });

  test('derives host-command-metadata / verified only when the host itself observed the call', () => {
    assert.deepEqual(deriveRouteProvenance({ observedByHost: true }), {
      route_provenance: 'host-command-metadata',
      route_verified: true,
    });
  });
});
