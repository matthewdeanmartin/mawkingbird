import { BUILD_RUNTIME_POLICY, RUNTIME_POLICY } from '../../platform/build/runtime-policy';
import { inject, Injectable } from '@angular/core';
import { FeatureFlags } from '../../platform/build/feature-flags';

/** Browser rollout policy for the operator's account services. */
@Injectable({ providedIn: 'root' })
export class MawkingbirdAccess {
  private readonly runtimePolicy = inject(RUNTIME_POLICY);
  private flags = inject(FeatureFlags);

  enabled(): boolean {
    return (
      this.runtimePolicy.hostedServices &&
      this.flags.enabled('mawkingbird-plus') &&
      ownsMawkingbirdServices(location.hostname)
    );
  }
}

export function ownsMawkingbirdServices(host: string): boolean {
  return (
    host === 'mawkingbird.com' ||
    host === 'www.mawkingbird.com' ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}

export function canUseHostedProxy(
  host: string = location.hostname,
  policy = BUILD_RUNTIME_POLICY,
): boolean {
  return (
    policy.hostedServices &&
    (ownsMawkingbirdServices(host) || host === 'matthewdeanmartin.github.io')
  );
}
