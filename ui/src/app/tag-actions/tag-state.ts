import { Injectable, inject, signal } from '@angular/core';
import { Api } from '../api';
import { Auth } from '../auth';
import { accountScopeSuffix } from '../account-scope';
import { Tag } from '../models';

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
