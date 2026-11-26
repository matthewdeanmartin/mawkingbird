import {
  Component,
  computed,
  inject,
  Injectable,
  input,
  OnInit,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import {
  MbItemList,
  MbItemMeta,
  MbItemRow,
  MbItemTitle,
} from '../../design-system/item-list/item-list';
import { Api } from '../../platform/api/api';
import { Account } from '../../platform/api/models';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { Auth } from '../../platform/session/auth';
import { accountLabel } from '../../accounts/account-switcher';

// i18n friendsFeatured.mine: Featured on your profile
// i18n friendsFeatured.mineEmpty: You don't feature any hashtags on your profile.
// i18n friendsFeatured.friends: Featured by your friends
// i18n friendsFeatured.friendsHint: Hashtags your mutuals pin on their profiles, the most shared first.
// i18n friendsFeatured.loading: Loading…
// i18n friendsFeatured.failed: Couldn't load these.
// i18n friendsFeatured.none: None of the friends checked so far feature a hashtag.
// i18n friendsFeatured.noFriends: No mutuals found among your recent follows and followers.
// i18n friendsFeatured.checked: Checked {{checked}} of {{total}} friends.
// i18n friendsFeatured.more: Check {{count}} more friends ({{count}} API calls)
// i18n friendsFeatured.by.one: featured by {{names}}
// i18n friendsFeatured.by.more: featured by {{names}} and {{count}} more
// i18n friendsFeatured.posts: {{count}} posts
// i18n friendsFeatured.anonymous: Featured hashtags come from profiles. Sign in to see yours and your friends'.

/** Friends checked per step: one request each (owner, 2026-11-26). */
export const FRIENDS_PER_STEP = 20;
/** Names shown on a row before "and N more". */
const NAMES_SHOWN = 3;

export interface FeaturedByFriends {
  name: string;
  friends: Account[];
}

/**
 * Group friends' featured hashtags by tag, the most shared first, then by name.
 * Each friend counts once per tag, however the server spells it.
 */
export function groupByTag(
  byFriend: ReadonlyMap<string, { account: Account; tags: string[] }>,
): FeaturedByFriends[] {
  const rows = new Map<string, FeaturedByFriends>();
  for (const { account, tags } of byFriend.values()) {
    for (const tag of new Set(tags.map((t) => t.toLowerCase()))) {
      const original = tags.find((t) => t.toLowerCase() === tag)!;
      const row = rows.get(tag) ?? { name: original, friends: [] };
      row.friends.push(account);
      rows.set(tag, row);
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.friends.length - a.friends.length || a.name.localeCompare(b.name),
  );
}

/**
 * Mutuals among one page of follows and one of followers (two requests, as the
 * Good stuff feed does), the most recently active first.
 */
export function rankMutuals(following: Account[], followers: Account[]): Account[] {
  const followerIds = new Set(followers.map((a) => a.id));
  const time = (a: Account) => (a.last_status_at ? Date.parse(a.last_status_at) : 0);
  return following.filter((a) => followerIds.has(a.id)).sort((a, b) => time(b) - time(a));
}

interface FriendsState {
  scope: string;
  mutuals: Account[];
  byFriend: Map<string, { account: Account; tags: string[] }>;
  checked: number;
}

/** What was gathered, kept for the session so returning costs no requests. */
@Injectable({ providedIn: 'root' })
export class FriendsFeaturedCache {
  state: FriendsState | null = null;
}

/**
 * Explore → Tags → More → Featured (spec/sprint/explore-2026-11.md): your own
 * featured hashtags, then the ones your friends feature, grouped by hashtag.
 *
 * Not the Feeds hub's "Your Featured Hashtags", which stays the quick way into
 * your own featured feeds. This one is for finding topics through people.
 *
 * Costs: one request for your own, two for mutuals, then one per friend,
 * {@link FRIENDS_PER_STEP} at a time with a button for more. Native could serve
 * these from its archive instead; that belongs to the Native repo.
 */
@Component({
  selector: 'app-friends-featured',
  imports: [MbButton, MbItemList, MbItemMeta, MbItemRow, MbItemTitle, RouterLink, TranslocoPipe],
  template: `
    @if (auth.isAnonymous) {
      <p class="muted small ff-note">{{ 'friendsFeatured.anonymous' | transloco }}</p>
    } @else {
      <section class="ff-section">
        <h2>{{ 'friendsFeatured.mine' | transloco }}</h2>
        @if (mine() === null) {
          <p class="muted small" role="status">{{ 'friendsFeatured.loading' | transloco }}</p>
        } @else if (mineFailed()) {
          <p class="muted small">{{ 'friendsFeatured.failed' | transloco }}</p>
        } @else if (!mine()!.length) {
          <p class="muted small">{{ 'friendsFeatured.mineEmpty' | transloco }}</p>
        } @else {
          <ul mbItemList>
            @for (tag of mine(); track tag.name) {
              <li mbItemRow>
                <a mbItemTitle [routerLink]="['/tags', tag.name]">#{{ tag.name }}</a>
                <span mbItemMeta>{{
                  'friendsFeatured.posts' | transloco: { count: tag.count }
                }}</span>
              </li>
            }
          </ul>
        }
      </section>

      <section class="ff-section">
        <h2>{{ 'friendsFeatured.friends' | transloco }}</h2>
        <p class="muted small">{{ 'friendsFeatured.friendsHint' | transloco }}</p>
        @if (state() === null && !friendsFailed()) {
          <p class="muted small" role="status">{{ 'friendsFeatured.loading' | transloco }}</p>
        } @else if (friendsFailed()) {
          <p class="muted small">{{ 'friendsFeatured.failed' | transloco }}</p>
        } @else if (!state()!.mutuals.length) {
          <p class="muted small">{{ 'friendsFeatured.noFriends' | transloco }}</p>
        } @else {
          @if (!rows().length && !busy()) {
            <p class="muted small">{{ 'friendsFeatured.none' | transloco }}</p>
          }
          <ul mbItemList>
            @for (row of rows(); track row.name) {
              <li mbItemRow>
                <a mbItemTitle [routerLink]="['/tags', row.name]">#{{ row.name }}</a>
                <span mbItemMeta>{{ byLine(row) }}</span>
                <button
                  mbButton
                  variant="compact"
                  type="button"
                  [disabled]="isFollowing(row.name)"
                  (click)="follow.emit(row.name)"
                >
                  {{
                    (isFollowing(row.name) ? 'exploreTags.following' : 'exploreTags.follow')
                      | transloco
                  }}
                </button>
              </li>
            }
          </ul>
          <p class="muted small">
            {{
              'friendsFeatured.checked'
                | transloco: { checked: state()!.checked, total: state()!.mutuals.length }
            }}
          </p>
          @if (remaining()) {
            <button
              mbButton
              variant="outline"
              size="small"
              type="button"
              [disabled]="busy()"
              (click)="checkMore()"
            >
              {{ 'friendsFeatured.more' | transloco: { count: remaining() } }}
            </button>
          }
        }
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
      padding: 0 16px;
    }
    h2 {
      font-size: 0.95rem;
      margin: 1rem 0 0.25rem;
    }
    .ff-section {
      margin-bottom: 1.5rem;
    }
    .ff-note {
      margin: 0.75rem 0;
    }
  `,
})
export class FriendsFeatured implements OnInit {
  protected auth = inject(Auth);
  private api = inject(Api);
  private cache = inject(FriendsFeaturedCache);

  /** The parent follows (it owns follow state, errors and the Feeds refresh). */
  readonly follow = output<string>();
  /** Lowercased names already followed, from the parent. */
  readonly followed = input<ReadonlySet<string>>(new Set());
  private transloco = inject(TranslocoService);

  protected readonly mine = signal<{ name: string; count: number }[] | null>(null);
  protected readonly mineFailed = signal(false);
  protected readonly state = signal<FriendsState | null>(null);
  protected readonly friendsFailed = signal(false);
  protected readonly busy = signal(false);

  protected readonly rows = computed(() => {
    const state = this.state();
    return state ? groupByTag(state.byFriend) : [];
  });
  protected readonly remaining = computed(() => {
    const state = this.state();
    return state ? Math.min(FRIENDS_PER_STEP, state.mutuals.length - state.checked) : 0;
  });

  ngOnInit(): void {
    if (this.auth.isAnonymous) return;
    this.api.featuredTags().subscribe({
      next: (tags) => this.mine.set(tags.map((t) => ({ name: t.name, count: t.statuses_count }))),
      error: () => {
        this.mineFailed.set(true);
        this.mine.set([]);
      },
    });
    const scope = accountScopeSuffix();
    const cached = this.cache.state;
    if (cached && cached.scope === scope) {
      this.state.set(cached);
      return;
    }
    const me = this.auth.account()?.id;
    if (!me) {
      this.friendsFailed.set(true);
      return;
    }
    forkJoin({
      following: this.api.accountFollowing(me),
      followers: this.api.accountFollowers(me),
    }).subscribe({
      next: ({ following, followers }) => {
        this.publish({
          scope,
          mutuals: rankMutuals(following, followers),
          byFriend: new Map(),
          checked: 0,
        });
        this.checkMore();
      },
      error: () => this.friendsFailed.set(true),
    });
  }

  /** Read the next friends' featured hashtags; one failing friend is skipped, not fatal. */
  protected checkMore(): void {
    const state = this.state();
    if (!state || this.busy()) return;
    const next = state.mutuals.slice(state.checked, state.checked + FRIENDS_PER_STEP);
    if (!next.length) return;
    this.busy.set(true);
    const reads: Observable<{ account: Account; tags: string[] }>[] = next.map((account) =>
      this.api.accountFeaturedTags(account.id).pipe(
        map((tags) => ({ account, tags: tags.map((t) => t.name) })),
        catchError(() => of({ account, tags: [] as string[] })),
      ),
    );
    forkJoin(reads).subscribe((results) => {
      const byFriend = new Map(state.byFriend);
      for (const result of results) if (result.tags.length) byFriend.set(result.account.id, result);
      this.publish({ ...state, byFriend, checked: state.checked + next.length });
      this.busy.set(false);
    });
  }

  private publish(state: FriendsState): void {
    this.state.set(state);
    this.cache.state = state;
  }

  protected isFollowing(name: string): boolean {
    return this.followed().has(name.toLowerCase());
  }

  protected byLine(row: FeaturedByFriends): string {
    const names = row.friends
      .slice(0, NAMES_SHOWN)
      .map((a) => accountLabel(a))
      .join(', ');
    const extra = row.friends.length - NAMES_SHOWN;
    return extra > 0
      ? this.transloco.translate('friendsFeatured.by.more', { names, count: extra })
      : this.transloco.translate('friendsFeatured.by.one', { names });
  }
}
