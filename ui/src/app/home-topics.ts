import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { AnonymousTags } from './providers/anonymous/anonymous-tags';

/** Followed-topic metadata only: never starts a post search or loads optional feed providers. */
@Injectable({ providedIn: 'root' })
export class HomeTopics {
  private api = inject(Api);
  private auth = inject(Auth);
  private tags = inject(AnonymousTags);
  async followed(): Promise<string[]> {
    if (this.auth.isAnonymous || this.auth.isBlueskyPrimary) return this.tags.tags();
    const tags: string[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await firstValueFrom(this.api.followedTagsPage(cursor));
      tags.push(...page.tags.map((t) => t.name));
      cursor = page.nextMaxId ?? undefined;
      if (cursor && seen.has(cursor)) throw new Error('Repeated followed-tag cursor');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return [...new Set(tags)];
  }
}
