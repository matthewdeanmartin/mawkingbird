import {
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Account, Relationship } from '../models';
import { homeServerLink } from '../home-server-link';
import { Api } from '../api';
import { Auth } from '../auth';
import { HumanCountPipe } from '../human-count.pipe';
import { VerifiedBadge } from '../verified-badge/verified-badge';
import { AnonymousAccount } from '../providers/anonymous/anonymous-account';
import { AnonymousFollows } from '../providers/anonymous/anonymous-follows';
import { BlueskyGraph } from '../providers/bluesky/bluesky-graph';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { RenderedHtmlLinks } from '../rendered-html-links';

/** `bsky:did:plc:…` → `did:plc:…`. */
function didOf(account: Account): string {
  return account.id.replace(/^bsky:/, '');
}

/**
 * Small card shown when hovering an account's avatar or name: bio,
 * post/following/follower counts, and a relationship-aware follow action.
 * the wrapping element (`.hover-anchor`, see status-card.css) owns the
 * show-on-hover behavior. Account details come from the status; relationship
 * state is fetched lazily only when the viewer enters the card.
 */
@Component({
  selector: 'app-account-hover-card',
  imports: [VerifiedBadge, HumanCountPipe, RenderedHtmlLinks],
  template: `
    <div class="hover-card" (mouseenter)="loadRelationship()">
      <img
        class="hc-avatar"
        [src]="account().avatar_static || account().avatar"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <div class="hc-name">
        {{ account().display_name || account().username }}
        <app-verified-badge [account]="account()" />
      </div>
      <div class="hc-acct muted">
        &#64;{{ account().acct }}
        <!-- The follow button says what you did; this says what they did. A card
             that shows "Following" and nothing else cannot distinguish a mutual
             from a stranger, which is usually the thing you hovered to find out. -->
        @if (inboundLabel(); as inbound) {
          <span class="hc-inbound">{{ inbound }}</span>
        }
      </div>
      @if (account().note) {
        <div class="hc-note" appRenderedHtmlLinks [innerHTML]="account().note"></div>
      }
      @if (showStats() && hasStats) {
        <div class="hc-stats muted">
          <span
            ><strong>{{ account().statuses_count | humanCount }}</strong> posts</span
          >
          <span
            ><strong>{{ account().following_count | humanCount }}</strong> following</span
          >
          <span
            ><strong>{{ account().followers_count | humanCount }}</strong> followers</span
          >
        </div>
      }
      <div class="hc-actions">
        @if (showFollowButton()) {
          <button
            type="button"
            class="btn btn-sm hc-follow"
            [class.following]="isFollowingState()"
            [disabled]="relationshipLoading() || followBusy()"
            (click)="toggleFollow($event)"
          >
            {{ relationshipLoading() || followBusy() ? '…' : followLabel() }}
          </button>
        }
        <!-- Parity with the profile's ••• menu, one item at a time. This card
             has no overflow menu to put it in, so it sits next to Follow —
             which is fine, because it is the other thing you want from a card
             you are only hovering over. stopPropagation because the card sits
             inside a status that navigates on click. -->
        @if (homeServerLink(); as link) {
          <a
            class="btn btn-sm btn-outline hc-home"
            [href]="link.url"
            target="_blank"
            rel="noopener noreferrer"
            [title]="'Open this profile on ' + link.host"
            (click)="$event.stopPropagation()"
          >
            Open on {{ link.host }}
          </a>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 40;
      visibility: hidden;
      opacity: 0;
      transition:
        opacity 0.12s ease,
        visibility 0.12s;
      pointer-events: auto;
      /* visibility:hidden still lays the card out and still counts toward the
         document's scrollable overflow -- a 280px card anchored mid-row reaches
         well past a phone viewport, which silently put the whole page into
         horizontal scroll. content-visibility keeps it out of layout until it
         is actually shown. */
      content-visibility: hidden;
    }

    /* Touch screens have no hover, so the card can never be triggered there.
       Drop it entirely rather than leaving an invisible box that widens the page. */
    @media (hover: none), (max-width: 720px) {
      :host {
        display: none;
      }
    }
    .hover-card {
      width: 280px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
      font-weight: 400;
      font-size: 14px;
      line-height: 1.4;
      text-align: left;
      white-space: normal;
    }
    .hc-avatar {
      width: 48px;
      height: 48px;
      border-radius: 9999px;
      object-fit: cover;
      background: var(--border);
    }
    .hc-name {
      margin-top: 6px;
      font-weight: 700;
      color: var(--text);
    }
    .hc-acct {
      font-size: 13px;
    }
    .hc-inbound {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 11px;
      white-space: nowrap;
    }
    .hc-note {
      margin-top: 6px;
      color: var(--text);
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
    }
    .hc-stats {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-size: 13px;
    }
    .hc-stats strong {
      color: var(--text);
    }
    .hc-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    .hc-follow {
      width: auto;
      min-width: 92px;
    }
    /* The hostname can be long (indieweb.social, chaos.social…), so it is
       allowed to shrink and ellipsize rather than widening the card. */
    .hc-home {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class AccountHoverCard {
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousAccount);
  private anonymousFollows = inject(AnonymousFollows);
  private bskyGraph = inject(BlueskyGraph);
  private bskySession = inject(BlueskySession);
  private destroyRef = inject(DestroyRef);

  readonly account = input.required<Account>();
  readonly allowFollow = input(true, { transform: booleanAttribute });
  readonly showStats = input(true, { transform: booleanAttribute });

  /** Where to open this profile on its own server, or null if there is nowhere. */
  protected homeServerLink = computed(() => homeServerLink(this.account()));

  protected relationship = signal<Relationship | null>(null);
  protected relationshipLoading = signal(false);
  protected followBusy = signal(false);
  private relationshipLoadedFor: string | null = null;

  /** A Bluesky account (`bsky:did:…`) with a linked session to act through. */
  protected isBluesky = computed(
    () => this.account().id.startsWith('bsky:') && this.bskySession.linked(),
  );

  /**
   * Whether to offer a follow button.
   *
   * Namespaced ids are excluded because they name nothing this server issued —
   * with the exception of Bluesky, which has a real graph and a real session
   * once one is linked. Signed out, or for `rss:`/`twitter:`/`paste:` ids, the
   * button stays off: those follows either cannot exist or are local-only and
   * belong on the profile page.
   */
  protected showFollowButton = computed(
    () =>
      this.account().id !== this.auth.account()?.id &&
      !!this.account().id &&
      (this.isBluesky() || !this.account().id.includes(':')) &&
      this.allowFollow(),
  );
  protected isFollowingState = computed(
    () => !!this.relationship()?.following || !!this.relationship()?.requested,
  );
  /**
   * "Mutuals" / "Follows you", or null when they do not follow the viewer.
   *
   * Null while the relationship is still unloaded too — the card fetches it
   * lazily on hover, and asserting "not a mutual" before the answer arrives
   * would be a worse lie than saying nothing.
   */
  protected inboundLabel = computed<string | null>(() => {
    const relationship = this.relationship();
    if (!relationship?.followed_by) return null;
    return relationship.following ? 'Mutuals' : 'Follows you';
  });

  protected followLabel = computed(() => {
    const relationship = this.relationship();
    if (relationship?.requested) return 'Requested';
    if (relationship?.following) return 'Following';
    return this.account().locked ? 'Request' : 'Follow';
  });

  protected loadRelationship(): void {
    const account = this.account();
    if (!this.showFollowButton() || this.relationshipLoadedFor === account.id) return;
    this.relationshipLoadedFor = account.id;
    if (this.isBluesky()) {
      // One getProfile per newly hovered account, cached by the guard above for
      // as long as the card stays mounted on the same person.
      this.relationshipLoading.set(true);
      this.bskyGraph
        .relationship(didOf(account))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (relationship) => this.relationship.set(relationship),
          error: () => {
            // Let a later hover retry rather than caching the failure.
            this.relationshipLoadedFor = null;
            this.relationshipLoading.set(false);
          },
          complete: () => this.relationshipLoading.set(false),
        });
      return;
    }
    if (this.auth.isAnonymous) {
      this.relationship.set(this.anonymousFollows.relationship(account, this.anonymous.server()));
      return;
    }
    this.relationshipLoading.set(true);
    this.api
      .relationships([account.id])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (relationships) => this.relationship.set(relationships[0] ?? null),
        error: () => this.relationshipLoading.set(false),
        complete: () => this.relationshipLoading.set(false),
      });
  }

  protected toggleFollow(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.relationshipLoading() || this.followBusy()) return;
    const account = this.account();
    if (this.isBluesky()) {
      this.followBusy.set(true);
      const did = didOf(account);
      const request = this.isFollowingState()
        ? this.bskyGraph.unfollow(did)
        : this.bskyGraph.follow(did);
      request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        // Merged, not replaced: the follow response cannot report followed_by,
        // which drives the "Mutuals" / "Follows you" line.
        next: (relationship) =>
          this.relationship.update((current) => ({ ...current, ...relationship })),
        error: () => this.followBusy.set(false),
        complete: () => this.followBusy.set(false),
      });
      return;
    }
    if (this.auth.isAnonymous) {
      const relationship = this.isFollowingState()
        ? this.anonymousFollows.unfollow(account, this.anonymous.server())
        : this.anonymousFollows.follow(account, this.anonymous.server()).relationship;
      this.relationship.set(relationship);
      return;
    }
    this.followBusy.set(true);
    const request = this.isFollowingState()
      ? this.api.unfollow(account.id)
      : this.api.follow(account.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (relationship) => this.relationship.set(relationship),
      error: () => this.followBusy.set(false),
      complete: () => this.followBusy.set(false),
    });
  }

  /**
   * Whether the counts are real enough to show.
   *
   * Asks the data, not the id. Foreign adapters zero-fill counts they were not
   * given — `adaptAuthor` on a Bluesky post author has no counts to report — so
   * "0 posts, 0 followers" would be a lie. But the *same* account arriving from
   * search or a people list came through `adaptProfile` and carries the real
   * numbers, and an id test would have hidden those too. Any non-zero count
   * means somebody actually told us something.
   */
  protected get hasStats(): boolean {
    const id = this.account().id;
    if (typeof id !== 'string') {
      return false;
    }
    if (!id.includes(':')) {
      return true;
    }
    const account = this.account();
    return account.statuses_count > 0 || account.followers_count > 0 || account.following_count > 0;
  }
}
