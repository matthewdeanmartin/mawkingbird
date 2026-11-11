import { Injectable, inject, signal } from '@angular/core';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { Tag } from '../../platform/api/models';

/** Successful mutations win over older search-result snapshots. No eager reads. */
@Injectable({ providedIn: 'root' })
export class TagState {
  private auth = inject(Auth);
  private updates = signal<Record<string, Tag>>({});
  constructor() {
    inject(Api).tagChanges.subscribe(({ scope, tag }) => {
      this.remember(tag, scope);
    });
  }
  remember(tag: Tag, scope = accountScopeSuffix()): void {
    this.updates.update((current) => ({ ...current, [scope + ':' + tag.name.toLowerCase()]: tag }));
  }
  get(name: string): Tag | undefined {
    this.auth.token();
    this.auth.kind();
    return this.updates()[accountScopeSuffix() + ':' + name.toLowerCase()];
  }
}
