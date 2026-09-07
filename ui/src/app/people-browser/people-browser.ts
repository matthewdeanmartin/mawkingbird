import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { Auth } from '../auth';
import { Account } from '../models';
import { VerifiedBadge } from '../verified-badge/verified-badge';
import { RenderedHtmlLinks } from '../rendered-html-links';
import { PeopleMode, PeopleSource } from './people-source';
import { PeopleSourceFactory } from './people-sources';
import { Relationship } from '../models';

// i18n peopleBrowser.loading: Loading…
// i18n peopleBrowser.loadError: Couldn't load this list.
// i18n peopleBrowser.followers.one: {{count}} follower
// i18n peopleBrowser.followers.other: {{count}} followers
// i18n peopleBrowser.following.one: {{count}} following
// i18n peopleBrowser.following.other: {{count}} following
// i18n peopleBrowser.you: You
// i18n peopleBrowser.stoppedAt: Stopped at {{count}} of {{total}} — this server did not send the rest of its paging information.
// i18n peopleBrowser.endApproximate: End of the list (approximate — paged without the server's cursor).
// i18n peopleBrowser.end: End of the list.
// i18n peopleBrowser.more: More

/**
 * One page of people, matching the `limit` the Mastodon sources request.
 *
 * Used only as the slack in {@link PeopleBrowser.shortOfReported}: a walk that
 * ended within one page of the advertised count ended normally.
 */
const PEOPLE_PAGE = 80;

export type { PeopleMode } from './people-source';

/** Per-account follow state, so the button can show the right label + spinner. */
type FollowState = 'idle' | 'busy';

/**
 * A pageable browser for an account's followers or following list. Renders each
 * account as a card (avatar, name, bio, counts) with a follow/unfollow toggle
 * wired to the viewer's real relationship, plus a "More" button that pages to
 * the next batch. Relationships are fetched one page at a time so the toggle is
 * always accurate without over-fetching.
 *
 * Which network it reads is {@link PeopleSource}'s problem, not this
 * component's. Before that split, each of fetch, relationship-load and
 * follow-toggle carried its own `auth.isAnonymous && server` branch, and adding
 * Bluesky would have made three of each.
 */
@Component({
  selector: 'app-people-browser',
  imports: [RouterLink, VerifiedBadge, RenderedHtmlLinks, TranslocoPipe],
  templateUrl: './people-browser.html',
  styleUrl: './people-browser.css',
})
export class PeopleBrowser {
  private auth = inject(Auth);
  private sources = inject(PeopleSourceFactory);

  /** Whose followers/following to show. */
  readonly accountId = input.required<string>();
  /** 'followers' (people who follow them) or 'following' (people they follow). */
  readonly mode = input<PeopleMode>('followers');
  /** Public instance used when Anonymous browses another account's connections. */
  readonly server = input<string | null>(null);
  /** Count advertised on the profile, used to distinguish private lists from genuinely empty ones. */
  readonly reportedCount = input<number>(0);

  protected accounts = signal<Account[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  /** An empty page came back: the list is fully paged in. */
  protected exhausted = signal(false);
  protected error = signal(false);
  /**
   * True once a page came back on a guessed cursor, because the server's `Link`
   * header did not reach us. The list still pages, but may skip or repeat rows,
   * so the count is presented as approximate rather than exact.
   */
  protected approximate = signal(false);

  /** Relationship per account id, for the follow button state. */
  private rels = signal<Map<string, Relationship>>(new Map());
  /** In-flight follow toggles, so their buttons disable + show progress. */
  private pending = signal<Map<string, FollowState>>(new Map());

  protected me = this.auth.account;

  /**
   * The walk ended well short of the count the profile advertises.
   *
   * The honest reading of that gap: paging stopped for a reason other than
   * running out of people. A private list ends at zero and a normal list ends
   * within a page of its count, so the threshold is one page — enough slack that
   * ordinary drift (a follow removed between the count and the walk) does not
   * trip it, tight enough to catch a walk that died on page one.
   *
   * Only meaningful once something loaded: a list that is genuinely empty, or
   * one hidden by the account's privacy settings, is not this situation and has
   * its own empty state above.
   */
  protected shortOfReported = computed(() => {
    const loaded = this.accounts().length;
    return loaded > 0 && this.reportedCount() - loaded > PEOPLE_PAGE;
  });

  /** The current page's source, rebuilt whenever the target account changes. */
  private source!: PeopleSource;
  /** Opaque paging token; meaning is the source's business, not ours. */
  private cursor: string | null = null;

  constructor() {
    // Reload from scratch whenever the target account or the mode changes.
    effect(() => {
      // Touch the inputs so the effect re-runs on either change.
      const id = this.accountId();
      this.mode();
      this.source = this.sources.create(id, this.server());
      this.reset();
      this.loadFirst();
    });
  }

  private reset(): void {
    this.accounts.set([]);
    this.rels.set(new Map());
    this.pending.set(new Map());
    this.loading.set(true);
    this.loadingMore.set(false);
    this.exhausted.set(false);
    this.error.set(false);
    this.approximate.set(false);
    this.cursor = null;
  }

  private loadFirst(): void {
    this.source.fetch(this.mode(), null).subscribe({
      next: (page) => {
        this.cursor = page.cursor;
        this.loading.set(false);
        this.accounts.set(page.accounts);
        if (page.approximate) this.approximate.set(true);
        this.exhausted.set(!page.accounts.length || !page.cursor);
        this.loadRelationships(page.accounts);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  loadMore(): void {
    if (!this.cursor || this.loadingMore() || this.exhausted()) {
      return;
    }
    this.loadingMore.set(true);
    this.source.fetch(this.mode(), this.cursor).subscribe({
      next: (page) => {
        this.cursor = page.cursor;
        this.loadingMore.set(false);
        if (page.approximate) this.approximate.set(true);
        if (!page.accounts.length) {
          this.exhausted.set(true);
          return;
        }
        const seen = new Set(this.accounts().map((a) => a.id));
        const fresh = page.accounts.filter((a) => !seen.has(a.id));
        // A page that adds nothing new means the cursor is going in circles.
        if (!fresh.length) {
          this.exhausted.set(true);
          return;
        }
        this.accounts.update((list) => [...list, ...fresh]);
        this.exhausted.set(!page.cursor);
        this.loadRelationships(fresh);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  /** Fetch relationships for a batch (skips myself; I can't follow myself). */
  private loadRelationships(page: Account[]): void {
    const meId = this.me()?.id;
    const others = page.filter((a) => a.id !== meId);
    if (!others.length) {
      return;
    }
    this.source.relationships(others).subscribe({
      next: (found) => {
        this.rels.update((map) => {
          const next = new Map(map);
          for (const [id, rel] of found) {
            next.set(id, rel);
          }
          return next;
        });
      },
      // A relationship lookup that fails leaves the buttons in their unknown
      // state rather than blanking a page of accounts that loaded fine.
      error: () => undefined,
    });
  }

  /** True once we know the viewer follows (or has requested to follow) them. */
  isFollowing(a: Account): boolean {
    const r = this.rels().get(a.id);
    return !!r && (r.following || r.requested);
  }

  /** A locked account we've asked to follow but who hasn't accepted yet. */
  isRequested(a: Account): boolean {
    return !!this.rels().get(a.id)?.requested;
  }

  isBusy(a: Account): boolean {
    return this.pending().get(a.id) === 'busy';
  }

  isSelf(a: Account): boolean {
    return a.id === this.me()?.id;
  }

  accountLink(a: Account): (string | number)[] {
    return this.source.accountLink(a);
  }

  /**
   * Whether to offer a follow button at all.
   *
   * False for an anonymous Bluesky view — the accounts are readable but there
   * is no session to write a follow with, so the button would fail on click.
   */
  protected canFollow(): boolean {
    return this.source.canFollow;
  }

  /** The label for the toggle, given follow/request/hover state. */
  followLabel(a: Account): string {
    if (this.isRequested(a)) {
      return 'Requested';
    }
    return this.isFollowing(a) ? 'Following' : 'Follow';
  }

  toggleFollow(a: Account): void {
    if (this.isBusy(a) || this.isSelf(a) || !this.canFollow()) {
      return;
    }
    const following = this.isFollowing(a);
    this.setPending(a.id, 'busy');
    const call = following ? this.source.unfollow(a) : this.source.follow(a);
    call.subscribe({
      next: (rel) => {
        this.rels.update((map) => new Map(map).set(a.id, rel));
        // Unfollowing from your *own* following list removes the row: the list
        // is "who I follow", and they no longer belong in it.
        if (following && !rel.following && this.isOwnFollowingList()) {
          this.accounts.update((accounts) => accounts.filter((account) => account.id !== a.id));
        }
        this.clearPending(a.id);
      },
      error: () => this.clearPending(a.id),
    });
  }

  /** True when this list is the viewer's own "following" — see toggleFollow. */
  private isOwnFollowingList(): boolean {
    return this.mode() === 'following' && this.accountId() === this.me()?.id;
  }

  private setPending(id: string, state: FollowState): void {
    this.pending.update((map) => new Map(map).set(id, state));
  }

  private clearPending(id: string): void {
    this.pending.update((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }

  protected emptyLabel = computed(() => {
    const count = this.reportedCount();
    const kind = this.mode() === 'followers' ? 'followers' : 'following';
    if (count > 0) {
      return `This account’s ${kind} list isn’t available. Their profile reports ${count.toLocaleString()}, so the server may be hiding the list because of privacy settings.`;
    }
    return this.mode() === 'followers' ? 'No followers yet.' : 'Not following anyone yet.';
  });
}
