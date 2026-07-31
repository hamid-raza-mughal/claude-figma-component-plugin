/**
 * Route provenance (§2.10.3): derived by the Guard, never supplied. G-15
 * refuses any attempt to pass `route_provenance`/`route_verified` as a
 * parameter — the enforcement here is structural: this module is the *only*
 * place these two values are produced, and it takes no caller-supplied
 * provenance claim as an input, only optional authoritative host evidence.
 *
 * No runtime today supplies that evidence (§1.6.5: every route is
 * `model-relayed` on both R-1 and R-2 — HD-3 is unmet everywhere). The
 * parameter exists so a future host integration has somewhere to plug in
 * verified metadata without this module's derivation rule changing.
 */

/**
 * Authoritative host-provided metadata for the invoked command (HD-3).
 * Deliberately narrow: the only fact that matters is whether the *host itself*
 * — not the model relaying on the host's behalf — observed and vouches for
 * this exact command invocation.
 */
export type HostCommandMetadata = {
  readonly observedByHost: true;
};

export type RouteProvenance = 'host-command-metadata' | 'model-relayed';

export type DerivedProvenance = {
  readonly route_provenance: RouteProvenance;
  readonly route_verified: boolean;
};

export function deriveRouteProvenance(hostCommandMetadata?: HostCommandMetadata): DerivedProvenance {
  if (hostCommandMetadata?.observedByHost === true) {
    return { route_provenance: 'host-command-metadata', route_verified: true };
  }
  return { route_provenance: 'model-relayed', route_verified: false };
}
