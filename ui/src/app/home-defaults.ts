import { computed, inject, Injectable, signal } from '@angular/core';
import { Auth } from './auth';
import { Server } from './server';
import { scopedKey } from './account-scope';
import { ProfileSyncStarter } from './providers/account/profile-sync-starter';

export type HomeDefault = 'all' | 'text' | 'media' | 'video';
const KEY = 'mockingbird_home_default';
export function asHomeDefault(value: unknown): HomeDefault | null {
  return ['all', 'text', 'media', 'video'].includes(value as string)
    ? (value as HomeDefault)
    : null;
}

/** Account-scoped starting presentation, separate from global reading preferences. */
@Injectable({ providedIn: 'root' })
export class HomeDefaults {
  private auth = inject(Auth);
  private server = inject(Server);
  private sync = inject(ProfileSyncStarter);
  private revision = signal(0);
  private fallback = new Map<string, HomeDefault>();
  readonly scope = computed(() => {
    this.auth.kind();
    this.auth.account();
    this.auth.token();
    this.server.baseUrl();
    return scopedKey(KEY);
  });
  readonly value = computed(() => {
    this.revision();
    const scope = this.scope();
    if (this.fallback.has(scope)) return this.fallback.get(scope)!;
    try {
      return asHomeDefault(localStorage.getItem(this.scope()));
    } catch {
      return null;
    }
  });
  set(value: HomeDefault): void {
    if (!asHomeDefault(value)) return;
    const scope = this.scope();
    try {
      localStorage.setItem(this.scope(), value);
      this.fallback.delete(scope);
      this.sync.noteLocalChange();
    } catch {
      /* An unavailable store must not break the current Home visit. */
      this.fallback.set(scope, value);
    }
    this.revision.update((value) => value + 1);
  }
}
