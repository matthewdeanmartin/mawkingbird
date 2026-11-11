import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, Subscription } from 'rxjs';
import { Auth } from '../../platform/session/auth';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { Account, Status } from '../../platform/api/models';
import { MisskeyApi, MisskeyApiError } from '../../connections/misskey/misskey-api';
import { misskeyIdentity } from '../../connections/misskey/misskey-identity-store';
import { StatusCard } from '../../posts/status-card/status-card';

// i18n pages.misskeySearch.title: Search Misskey
// i18n pages.misskeySearch.label: Search
// i18n pages.misskeySearch.placeholder: Words, #hashtag, or @someone@server
// i18n pages.misskeySearch.submit: Search
// i18n pages.misskeySearch.typesLabel: What to search
// i18n pages.misskeySearch.type.notes: Notes
// i18n pages.misskeySearch.type.users: People
// i18n pages.misskeySearch.type.tags: Hashtags
// i18n pages.misskeySearch.trending: Trending on {{server}}
// i18n pages.misskeySearch.trendingUsers: {{count}} people
// i18n pages.misskeySearch.searching: Searching…
// i18n pages.misskeySearch.none: Nothing found.
// i18n pages.misskeySearch.more: Load more
// i18n pages.misskeySearch.unavailable: Note search is switched off on {{server}}. Searching a #hashtag still works, and so do People and Hashtags.
// i18n pages.misskeySearch.failed: The search did not work. Please try again.
// i18n pages.misskeySearch.openProfile: Open the profile of {{handle}}
// i18n pages.misskeySearch.notFound: No one called {{handle}} was found.

export type MisskeySearchType = 'notes' | 'users' | 'tags';
const TYPES: readonly MisskeySearchType[] = ['notes', 'users', 'tags'];

/** `@user` or `@user@host` (a leading @ is required, to tell it from a word). */
export function parseHandle(query: string): { username: string; host: string | null } | null {
  const match = /^@([A-Za-z0-9_]{1,128})(?:@([A-Za-z0-9.-]+\.[A-Za-z]{2,}))?$/.exec(query.trim());
  return match ? { username: match[1], host: match[2] ?? null } : null;
}

/**
 * Search for a Misskey-primary account: notes, people and hashtags, through
 * the reader's own Misskey server.
 *
 * Its own page rather than a third mode in the shared search page, which is
 * built around Mastodon's and Bluesky's engines and operators; Misskey's is a
 * plain query plus `#tag` and `@user@host`. Reached at `/search` (the route
 * picks this page for Misskey accounts), with `?q=` and `?type=` in the URL
 * so a search can be shared and the back button works.
 */
@Component({
  selector: 'app-misskey-search',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbField,
    MbControl,
    MbToolbar,
    MbToolbarButton,
    StatusCard,
  ],
  templateUrl: './misskey-search.html',
  styleUrl: './misskey-search.css',
})
export class MisskeySearch implements OnInit, OnDestroy {
  private api = inject(MisskeyApi);
  private auth = inject(Auth);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly types = TYPES;
  protected query = signal('');
  protected type = signal<MisskeySearchType>('notes');
  /** The query the shown results are for. */
  protected searched = signal<string | null>(null);
  protected loading = signal(false);
  protected loadingMore = signal(false);
  protected error = signal<'unavailable' | 'failed' | null>(null);
  protected exhausted = signal(false);

  protected notes = signal<Status[]>([]);
  protected users = signal<Account[]>([]);
  protected tags = signal<string[]>([]);
  protected trending = signal<{ tag: string; usersCount: number }[]>([]);
  /** For `@user@host`: the account it names, or false when there is none. */
  protected handleResult = signal<Account | false | null>(null);

  private untilId: string | null = null;
  private offset = 0;
  private sub = new Subscription();
  private seq = 0;

  protected readonly server = computed(
    () => misskeyIdentity(this.auth.activeMisskeyKey())?.profile.server ?? '',
  );
  protected readonly serverHost = computed(() => {
    try {
      return new URL(this.server()).host;
    } catch {
      return '';
    }
  });
  protected readonly handle = computed(() => parseHandle(this.searched() ?? ''));

  ngOnInit(): void {
    this.sub.add(
      this.route.queryParamMap.subscribe((params) => {
        const type = params.get('type') as MisskeySearchType | null;
        this.type.set(type && TYPES.includes(type) ? type : 'notes');
        const q = (params.get('q') ?? '').trim();
        this.query.set(q);
        if (q) void this.run(q);
        else this.reset();
      }),
    );
    void this.loadTrending();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /** Put the search in the URL; the subscription above runs it. */
  protected submit(): void {
    const q = this.query().trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q || null, type: this.type() === 'notes' ? null : this.type() },
    });
  }

  protected setType(type: MisskeySearchType): void {
    if (type === this.type()) return;
    this.type.set(type);
    this.submit();
  }

  private reset(): void {
    this.seq++;
    this.searched.set(null);
    this.notes.set([]);
    this.users.set([]);
    this.tags.set([]);
    this.handleResult.set(null);
    this.error.set(null);
    this.loading.set(false);
  }

  private async run(q: string): Promise<void> {
    this.reset();
    const seq = this.seq;
    this.searched.set(q);
    this.loading.set(true);
    this.untilId = null;
    this.offset = 0;
    this.exhausted.set(false);
    const handle = parseHandle(q);
    if (handle) void this.lookUpHandle(handle, seq);
    try {
      await this.page(q, seq);
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }

  protected async more(): Promise<void> {
    const q = this.searched();
    if (!q || this.loadingMore() || this.exhausted()) return;
    this.loadingMore.set(true);
    try {
      await this.page(q, this.seq);
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** One page of the current type of results. */
  private async page(q: string, seq: number): Promise<void> {
    const server = this.server();
    try {
      switch (this.type()) {
        case 'notes': {
          const tag = /^#([^\s#]+)$/.exec(q)?.[1];
          const [found, { adaptMisskeyNote }] = await Promise.all([
            firstValueFrom(
              tag ? this.api.notesByTag(tag, this.untilId) : this.api.searchNotes(q, this.untilId),
            ),
            import('../../connections/misskey/misskey-adapter'),
          ]);
          if (seq !== this.seq) return;
          const last = found.at(-1)?.id ?? null;
          this.exhausted.set(!last || last === this.untilId);
          this.untilId = last;
          this.notes.update((list) => [
            ...list,
            ...found.filter((n) => !n.isHidden).map((n) => adaptMisskeyNote(n, server)),
          ]);
          return;
        }
        case 'users': {
          const query = parseHandle(q)?.username ?? q.replace(/^@/, '');
          const [found, { adaptMisskeyUser }] = await Promise.all([
            firstValueFrom(this.api.searchUsers(query, this.offset)),
            import('../../connections/misskey/misskey-adapter'),
          ]);
          if (seq !== this.seq) return;
          this.offset += found.length;
          this.exhausted.set(found.length === 0);
          this.users.update((list) => [...list, ...found.map((u) => adaptMisskeyUser(u, server))]);
          return;
        }
        case 'tags': {
          const found = await firstValueFrom(this.api.searchHashtags(q.replace(/^#/, ''), 50));
          if (seq !== this.seq) return;
          this.tags.set(found);
          this.exhausted.set(true);
          return;
        }
      }
    } catch (error) {
      if (seq !== this.seq) return;
      this.exhausted.set(true);
      this.error.set(
        error instanceof MisskeyApiError && error.code === 'UNAVAILABLE' ? 'unavailable' : 'failed',
      );
    }
  }

  private async lookUpHandle(
    handle: { username: string; host: string | null },
    seq: number,
  ): Promise<void> {
    const server = this.server();
    // Asking about our own server's host is the same as a local username.
    const host = handle.host && handle.host !== this.serverHost() ? handle.host : null;
    try {
      const [user, { adaptMisskeyUser }] = await Promise.all([
        firstValueFrom(this.api.user({ username: handle.username, host })),
        import('../../connections/misskey/misskey-adapter'),
      ]);
      if (seq === this.seq) this.handleResult.set(adaptMisskeyUser(user, server));
    } catch {
      if (seq === this.seq) this.handleResult.set(false);
    }
  }

  private async loadTrending(): Promise<void> {
    try {
      this.trending.set(await firstValueFrom(this.api.trendingHashtags()));
    } catch {
      // Trends are a nicety; the search box works without them.
    }
  }

  protected onChanged(updated: Status): void {
    this.notes.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  protected onDeleted(removed: Status): void {
    this.notes.update((list) => list.filter((s) => s.id !== removed.id));
  }
}
