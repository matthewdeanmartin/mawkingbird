import { inject, Injectable } from '@angular/core';
import { FeatureFlags } from '../../feature-flags';

/** Browser rollout policy for the operator's account services. */
@Injectable({ providedIn: 'root' })
export class MawkingbirdAccess {
  private flags = inject(FeatureFlags);

  enabled(): boolean {
    return this.flags.enabled('mawkingbird-plus') && ownsMawkingbirdServices(location.hostname);
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

export function canUseHostedProxy(host: string = location.hostname): boolean {
  return ownsMawkingbirdServices(host) || host === 'matthewdeanmartin.github.io';
}
