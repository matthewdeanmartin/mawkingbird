import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { accountScopeSuffix } from '../account-scope';
import { Auth } from '../auth';
import { Server } from '../server';

const KEY = 'mockingbird_radio_providers';

/**
 * Providers the account allowed to load and start without a second click. Radio
 * asks for this; feed cards honour it with a one-click Play, but still load a
 * player only when asked, so a long feed never creates hundreds of frames.
 */
@Injectable({ providedIn: 'root' })
export class ProviderConsent {
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  readonly allowed = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.server.baseUrl();
      untracked(() => this.load());
    });
  }

  has(provider: string): boolean {
    return this.allowed().has(provider);
  }
  allow(provider: string): void {
    this.save(new Set([...this.allowed(), provider]));
  }
  forget(provider: string): void {
    this.save(new Set([...this.allowed()].filter((p) => p !== provider)));
  }

  private load(): void {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(KEY + accountScopeSuffix()) ?? '[]');
      this.allowed.set(
        new Set(Array.isArray(data) ? data.filter((p) => typeof p === 'string') : []),
      );
    } catch {
      this.allowed.set(new Set());
    }
  }
  private save(values: ReadonlySet<string>): void {
    this.allowed.set(values);
    try {
      localStorage.setItem(KEY + accountScopeSuffix(), JSON.stringify([...values]));
    } catch {
      /* Consent still applies for this tab. */
    }
  }
}
