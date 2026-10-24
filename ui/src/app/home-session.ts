import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { HomeAlgoSettings } from './home-algo-settings';
import { Auth } from './auth';

/** App-lifetime state: routing does not reset it; a fresh app/login does. */
@Injectable({ providedIn: 'root' })
export class HomeSession {
  private settings = inject(HomeAlgoSettings);
  private auth = inject(Auth);
  readonly calm = signal(false);
  readonly boosts = signal(true);
  readonly replies = signal(false);
  private identity = '';
  constructor() {
    this.ensure();
    effect(() => {
      this.settings.scope();
      this.auth.token();
      this.auth.kind();
      untracked(() => this.ensure());
    });
  }
  ensure(): void {
    const identity = `${this.settings.scope()}:${this.auth.kind()}:${this.auth.token() ?? ''}`;
    if (identity === this.identity) return;
    this.identity = identity;
    const defaults = this.settings.value();
    this.calm.set(defaults.calm);
    this.boosts.set(defaults.boosts);
    this.replies.set(defaults.replies);
  }
}
