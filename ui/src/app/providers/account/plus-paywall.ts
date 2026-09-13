import { inject, Injectable, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FeatureFlags } from '../../feature-flags';
import { PlusCatalogue } from './plus-catalogue';

export type PaidFeature = 'settings' | 'feeds' | 'connections' | 'proxy';
export interface PaywallState {
  feature: PaidFeature;
  status: 'checking' | 'free' | 'unavailable';
}

@Injectable({ providedIn: 'root' })
export class PlusPaywall {
  private injector = inject(Injector);
  private flags = inject(FeatureFlags);
  private router = inject(Router);
  get catalogue(): PlusCatalogue {
    return this.injector.get(PlusCatalogue);
  }
  available(): boolean {
    return this.flags.enabled('mawkingbird-plus');
  }
  readonly state = signal<PaywallState | null>(null);

  async require(feature: PaidFeature, active: () => boolean = () => true): Promise<boolean> {
    if (!this.flags.enabled('mawkingbird-plus') || this.state()) return false;
    const state: PaywallState = { feature, status: 'checking' };
    this.state.set(state);
    let status: 'paid' | 'free' | 'unavailable';
    try {
      const [{ MawkingbirdSession }, { PlusSession }] = await Promise.all([
        import('./mawkingbird-session'),
        import('./plus-session'),
      ]);
      const account = this.injector.get(MawkingbirdSession);
      await account.ensureReady();
      if (!account.ready() || account.error()) status = 'unavailable';
      else if (!account.user()) status = 'free';
      else {
        const plus = this.injector.get(PlusSession);
        const token = await plus.refresh();
        status = token ? (plus.isSupporter() ? 'paid' : 'free') : 'unavailable';
      }
    } catch {
      status = 'unavailable';
    }
    if (this.state() !== state) return false;
    if (!active()) {
      this.dismiss();
      return false;
    }
    if (status === 'paid') {
      this.dismiss();
      return true;
    }
    this.state.set({ feature, status });
    if (status === 'free') void this.catalogue.load();
    return false;
  }

  dismiss(): void {
    this.state.set(null);
  }
  retry(): void {
    const feature = this.state()?.feature;
    this.dismiss();
    if (feature) void this.require(feature);
  }
  async upgrade(requirePrice = true): Promise<void> {
    if (requirePrice && !this.catalogue.offer()) return;
    this.dismiss();
    await this.router.navigateByUrl('/settings/mawkingbird-plus');
  }
}
