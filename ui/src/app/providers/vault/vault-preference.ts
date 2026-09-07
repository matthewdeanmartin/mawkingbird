/**
 * The account preference and deployment boundary for connection-key sync.
 *
 * The preference lives with the other Plus feature choices, but it is not the
 * security boundary. The rollout token is true only for the `/test/` build, so
 * copying localStorage to production cannot activate vault reads or writes.
 */

import { computed, inject, Injectable, InjectionToken } from '@angular/core';
import { isTestBuild } from '../../build-flavor';
import { PlusFeatures } from '../account/plus-features';

/** Overridable in specs; production code derives it from the deployment path. */
export const VAULT_TEST_ROLLOUT = new InjectionToken<boolean>('VAULT_TEST_ROLLOUT', {
  providedIn: 'root',
  factory: () => isTestBuild(),
});

@Injectable({ providedIn: 'root' })
export class VaultPreference {
  private features = inject(PlusFeatures);
  readonly available = inject(VAULT_TEST_ROLLOUT);

  /** Whether this browser may currently read or write connector credentials. */
  readonly enabled = computed(() => this.available && this.features.isOn('apiKeys'));

  set(on: boolean): void {
    this.features.set('apiKeys', on);
  }
}
