import {
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Api } from '../../../api';
import { Terminology } from '../../../terminology';
import { Auth } from '../../../auth';
import { FocusTrap } from '../../../a11y/focus-trap';
import { Compose } from '../../../compose/compose';
import { HumanTimePipe } from '../../../human-time.pipe';
import { HumanCountPipe } from '../../../human-count.pipe';
import { RenderedHtmlLinks } from '../../../rendered-html-links';
import { TrustedAccounts } from '../../../trusted-accounts';
import { LocalModeration } from '../../../local-moderation';
import { StatusActions } from '../../../providers/status-actions';
import { AnonymousCapabilities } from '../../../providers/anonymous/anonymous-capabilities';
import { ProviderCapabilities } from '../../../providers/provider';
import { AnonymousPublicApi } from '../../../providers/anonymous/anonymous-public-api';
import { AnonymousPublicRef } from '../../../providers/anonymous/anonymous-route-ref';
import { accountRoutePath } from '../../../account-route';
import { Status } from '../../../models';
import { ProfileMediaItem } from './profile-media-item';
import { BlueskyApi } from '../../../providers/bluesky/bluesky-api';
import { BskyRef } from '../../../providers/bluesky/bluesky-types';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The photo-first viewer behind a profile's media wall.
 *
 * Deliberately *not* the existing {@link ../../../lightbox/lightbox Lightbox},
 * which stays what it is: a utilitarian "embiggen this attachment" overlay for
 * the timeline. This one is for the case where the pictures are the point — the
 * image takes most of the page and the conversation about it sits alongside,
 * with the thread readable and a reply box under it.
 *
 * Navigation matches what the grid implies. Left/right walks every image in
 * order, exactly the sequence the eye follows across the wall; up/down jumps
 * whole posts, so a four-photo album costs one keypress to skip rather than
 * four.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n pages.profile.media.viewerAriaLabel: Picture viewer
// i18n pages.profile.media.closeViewer: Close viewer
// i18n pages.profile.media.previousPicture: Previous picture
// i18n pages.profile.media.nextPicture: Next picture
// i18n pages.profile.media.sensitiveImage: Sensitive image
// i18n pages.profile.media.clickToView: Click to view
// i18n pages.profile.media.videoUnsupported: Your browser cannot play this video.
// i18n pages.profile.media.positionOfTotal: {{position}} of {{total}}
// i18n pages.profile.media.keyboardHint: ← → picture · ↑ ↓ post · Esc close
// i18n pages.profile.media.cwLabel: CW:
// i18n pages.profile.media.showLess: Show less
// i18n pages.profile.media.showMore: Show more
// i18n pages.profile.media.undoLike: Undo like
// i18n pages.profile.media.like: Like
// i18n pages.profile.media.undoBoost: Undo boost
// i18n pages.profile.media.boost: Boost
// i18n pages.profile.media.replyToThis: Reply to this {{term}}
// i18n pages.profile.media.moreActions: More actions
// i18n pages.profile.media.openThread: Open thread
// i18n pages.profile.media.removeBookmark: Remove bookmark
// i18n pages.profile.media.bookmark: Bookmark
// i18n pages.profile.media.copyLinkToPost: Copy link to post
// i18n pages.profile.media.copyImageAddress: Copy image address
// i18n pages.profile.media.openImageInNewTab: Open image in new tab
// i18n pages.profile.media.deletePost: Delete post
// i18n pages.profile.media.report: Report…
// i18n pages.profile.media.muteHandle: Mute &#64;{{handle}}
// i18n pages.profile.media.blockHandle: Block &#64;{{handle}}
// i18n pages.profile.media.addCommentPlaceholder: Add a comment…
// i18n pages.profile.media.cancel: Cancel
// i18n pages.profile.media.loadingComments: Loading comments…
// i18n pages.profile.media.noComments: No comments yet.
// i18n pages.profile.media.replyToHandle: Reply to @{{handle}}
@Component({
  selector: 'app-profile-photo-view',
  imports: [
    FocusTrap,
    RouterLink,
    HumanTimePipe,
    HumanCountPipe,
    RenderedHtmlLinks,
    Compose,
    TranslocoPipe,
  ],
  templateUrl: './profile-photo-view.html',
  styleUrl: './profile-photo-view.css',
})
export class ProfilePhotoView {
  private api = inject(Api);
  private anonymousPublic = inject(AnonymousPublicApi);
  private trusted = inject(TrustedAccounts);
  private localMod = inject(LocalModeration);
  private actions = inject(StatusActions);
  private blueskyApi = inject(BlueskyApi);
  private capabilities = inject(AnonymousCapabilities);
  private router = inject(Router);
  protected auth = inject(Auth);
  protected words = inject(Terminology).words;

  /** Every image on the wall, so the viewer can page within it. */
  readonly items = input.required<ProfileMediaItem[]>();
  /** The `?photo=` key currently open. */
  readonly activeKey = input.required<string>();
  /** Set for cross-instance anonymous profiles; replies are read through it. */
  readonly publicRef = input<AnonymousPublicRef | null>(null);

  readonly closed = output<void>();
  /** Asks the parent to move to another image (it owns the URL). */
  readonly navigated = output<ProfileMediaItem>();
  /** The reader hit the end of what is loaded and more may exist. */
  readonly wantMore = output<void>();

  protected current = computed(
    () => this.items().find((item) => item.key === this.activeKey()) ?? null,
  );

  protected index = computed(() => this.items().findIndex((i) => i.key === this.activeKey()));

  /** Position within the whole wall, for the "3 of 40" counter. */
  protected position = computed(() => this.index() + 1);
  protected total = computed(() => this.items().length);

  /**
   * Sensitive images stay blurred here too.
   *
   * Reaching the viewer does not imply consent to see the picture: a reader can
   * arrive by arrowing along the wall, or by opening a link somebody sent them.
   */
  private revealed = signal<Set<string>>(new Set());

  protected blurred = computed(() => {
    const item = this.current();
    if (!item || this.revealed().has(item.key)) {
      return false;
    }
    this.trusted.entries();
    return item.status.sensitive && !this.trusted.sensitiveShown(item.status.account);
  });

  protected reveal(): void {
    const item = this.current();
    if (item) {
      this.revealed.update((set) => new Set(set).add(item.key));
    }
  }

  // --- the conversation column ---

  protected replies = signal<Status[]>([]);
  protected repliesLoading = signal(false);
  protected repliesError = signal<string | null>(null);
  private contextSub = new Subscription();

  /**
   * Whether this post can be replied to at all.
   *
   * RSS items, scraped Twitter posts and pastes have no reply endpoint —
   * there is nothing on the other end to receive one. The column still shows
   * the caption and says so, rather than offering a box that cannot work.
   */
  protected canReply = computed(() => {
    const status = this.current()?.status;
    if (!status || this.auth.isAnonymous) {
      return false;
    }
    const provider = status.provider;
    return !provider || provider === 'mastodon';
  });

  /** Why the reply box is absent, phrased for the specific source. */
  protected replyUnavailableReason = computed(() => {
    const status = this.current()?.status;
    if (!status) {
      return '';
    }
    if (this.auth.isAnonymous) {
      return 'Sign in to reply.';
    }
    switch (status.provider) {
      case 'rss':
      case 'blog':
        return 'This is a blog post from a feed — reply on the original site.';
      case 'twitter':
        return 'Replies are not available for Twitter posts here.';
      case 'bluesky':
        return 'Replying to Bluesky posts is not supported from this view yet.';
      case 'paste':
        return 'This item has no comment thread.';
      default:
        return 'Replies are not available for this post.';
    }
  });

  /**
   * The handle a reply should mention so the person is actually notified.
   *
   * Follows the *target* of the open composer rather than the picture's author:
   * replying to a commenter should ping that commenter. Mastodon only notifies
   * when the handle is in the body, so this seeds it.
   */
  protected replyToHandle = computed(
    () => this.replyingTo()?.account.acct ?? this.current()?.status.account.acct ?? '',
  );

  constructor() {
    // Re-read the thread whenever the open picture moves to a different *post*.
    // Paging between two images of the same album must not refetch: it is the
    // same conversation, and a flicker there would be pure noise.
    effect(() => {
      const status = this.current()?.status;
      if (!status) {
        return;
      }
      this.loadContext(status);
    });
  }

  private lastContextStatusId: string | null = null;

  private loadContext(status: Status): void {
    if (this.lastContextStatusId === status.id) {
      return;
    }
    this.lastContextStatusId = status.id;
    this.contextSub.unsubscribe();
    this.contextSub = new Subscription();
    this.replies.set([]);
    this.repliesError.set(null);
    // Transient UI belongs to the post that was open, not the one arriving: a
    // half-typed reply or an open menu must not carry across to another picture.
    this.replyingTo.set(null);
    this.menuOpen.set(false);
    this.captionExpanded.set(false);
    this.actionError.set(null);

    // Only Mastodon has a context endpoint. Everything else shows its caption
    // alone, which is the honest rendering of "this source has no thread".
    const provider = status.provider;
    const isMastodon = !provider || provider === 'mastodon' || provider === 'anonymous-mastodon';
    if (!isMastodon) {
      return;
    }

    this.repliesLoading.set(true);
    const ref = this.publicRef();
    const request =
      ref && provider === 'anonymous-mastodon'
        ? this.anonymousPublic.getContext({ ...ref, id: this.nativeId(status) })
        : this.api.getContext(status.id);
    this.contextSub.add(
      request.subscribe({
        next: (context) => {
          this.replies.set(context.descendants ?? []);
          this.repliesLoading.set(false);
        },
        error: (error: unknown) => {
          this.repliesLoading.set(false);
          // A 404 is not a failure worth reporting: it means this server has no
          // thread under that id, which is the ordinary answer for a post that
          // simply has no replies, and for the blog/RSS items folded onto a
          // profile whose ids the server never issued. Saying "could not load"
          // there tells the reader something is broken when nothing is — the
          // empty state below already says the true thing.
          const status = (error as { status?: number })?.status;
          if (status === 404 || status === 410) {
            this.replies.set([]);
            return;
          }
          this.repliesError.set('Could not load the comments.');
        },
      }),
    );
  }

  /** The id the *origin* server knows this status by, for cross-instance reads. */
  private nativeId(status: Status): string {
    const ref = status.providerRef as { statusId?: string } | undefined;
    return typeof ref?.statusId === 'string' ? ref.statusId : status.id;
  }

  /** A posted reply lands at the bottom of the thread without a refetch. */
  protected onReplied(reply: Status): void {
    this.replies.update((list) => [...list, reply]);
    this.replyingTo.set(null);
  }

  // --- actions on the picture's post ---

  /**
   * The post as the viewer currently sees it.
   *
   * Held separately from `current().status` because liking or boosting returns
   * an updated status that the parent's media list does not know about. Without
   * this the heart would fill and then revert on the next re-render.
   */
  private patched = signal<Map<string, Status>>(new Map());

  /** The open picture's post, with any local like/boost applied. */
  protected post = computed<Status | null>(() => {
    const status = this.current()?.status ?? null;
    if (!status) {
      return null;
    }
    return this.patched().get(status.id) ?? status;
  });

  /** What this post's network actually supports; buttons hide rather than fail. */
  protected caps = computed<ProviderCapabilities>(() =>
    this.capabilities.statusCaps(this.post()?.provider ?? 'mastodon'),
  );

  protected actionBusy = signal(false);
  protected actionError = signal<string | null>(null);
  protected menuOpen = signal(false);
  protected notice = signal<string | null>(null);

  /**
   * Whether the caption is showing in full.
   *
   * Clamped by default: some servers allow very long posts, and an unclamped
   * caption pushed the comments off the bottom of the column entirely.
   */
  protected captionExpanded = signal(false);

  protected toggleCaption(): void {
    this.captionExpanded.update((v) => !v);
  }

  private applyPatch(updated: Status): void {
    const original = this.current()?.status;
    if (!original) {
      return;
    }
    this.patched.update((map) => new Map(map).set(original.id, updated));
  }

  protected toggleFavourite(): void {
    const target = this.post();
    if (!target || !this.caps().favourite || this.actionBusy()) {
      return;
    }
    this.actionBusy.set(true);
    this.actionError.set(null);
    this.actions.toggleFavourite(target).subscribe({
      next: (updated) => {
        this.actionBusy.set(false);
        this.applyPatch(updated);
      },
      error: () => {
        this.actionBusy.set(false);
        this.actionError.set('Could not like this post.');
      },
    });
  }

  protected toggleReblog(): void {
    const target = this.post();
    if (!target || !this.caps().reblog || this.actionBusy()) {
      return;
    }
    this.actionBusy.set(true);
    this.actionError.set(null);
    this.actions.toggleReblog(target).subscribe({
      next: (updated) => {
        this.actionBusy.set(false);
        // A boost returns the wrapper; the inner status is the one whose counts
        // the bar is showing.
        this.applyPatch(updated.reblog ?? updated);
      },
      error: () => {
        this.actionBusy.set(false);
        this.actionError.set('Could not boost this post.');
      },
    });
  }

  protected toggleBookmark(): void {
    const target = this.post();
    if (!target || this.auth.isAnonymous) {
      return;
    }
    this.menuOpen.set(false);
    if (target.provider === 'bluesky') {
      const ref = target.providerRef as BskyRef;
      const call = target.bookmarked
        ? this.blueskyApi.deleteBookmark(ref.uri)
        : this.blueskyApi.createBookmark(ref.uri, ref.cid);
      call.subscribe({
        next: () => this.applyPatch({ ...target, bookmarked: !target.bookmarked }),
        error: () => this.actionError.set('Could not bookmark this post on Bluesky.'),
      });
      return;
    }
    const call = target.bookmarked ? this.api.unbookmark(target.id) : this.api.bookmark(target.id);
    call.subscribe({
      next: (updated) => this.applyPatch(updated),
      error: () => this.actionError.set('Could not bookmark this post.'),
    });
  }

  /** Where the ··· menu's "Open thread" goes: the app's normal thread page. */
  protected threadLink = computed<(string | number)[] | null>(() => {
    const status = this.post();
    if (!status) {
      return null;
    }
    const provider = status.provider;
    if (provider && provider !== 'mastodon' && provider !== 'anonymous-mastodon') {
      // Foreign posts have no thread page here; the ··· menu hides the entry.
      return null;
    }
    return ['/statuses', this.nativeId(status)];
  });

  protected openThread(): void {
    const link = this.threadLink();
    if (!link) {
      return;
    }
    // Close first: the viewer is a fixed overlay, and leaving it up over the
    // thread page would trap the reader behind a picture they navigated away from.
    this.closed.emit();
    void this.router.navigate(link);
  }

  protected copyPostLink(): void {
    const url = this.post()?.url;
    this.menuOpen.set(false);
    if (url) {
      void this.copy(url, 'Link copied.');
    }
  }

  protected copyImageAddress(): void {
    const url = this.current()?.url;
    this.menuOpen.set(false);
    if (url) {
      void this.copy(url, 'Image address copied.');
    }
  }

  protected openImageInNewTab(): void {
    const url = this.current()?.url;
    this.menuOpen.set(false);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  private async copy(text: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.flash(message);
    } catch {
      this.actionError.set('Could not copy to the clipboard.');
    }
  }

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  private flash(message: string): void {
    this.notice.set(message);
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(null), 2500);
  }

  // --- moderation, mirroring the status card's ··· menu ---

  /** True when block/mute happen in this browser rather than on a server. */
  protected useLocalModeration = computed(
    () => this.auth.isAnonymous || !this.capabilities.canManageRelationships,
  );

  protected isOwnPost = computed(() => this.post()?.account.id === this.auth.account()?.id);

  protected blockAuthor(): void {
    const account = this.post()?.account;
    this.menuOpen.set(false);
    if (!account) {
      return;
    }
    if (this.useLocalModeration()) {
      this.localMod.block(account);
      this.flash(`Blocked @${account.acct} in this browser.`);
      return;
    }
    this.api.block(account.id).subscribe({
      next: () => this.flash(`Blocked @${account.acct}.`),
      error: () => this.actionError.set('Could not block this account.'),
    });
  }

  protected muteAuthor(): void {
    const account = this.post()?.account;
    this.menuOpen.set(false);
    if (!account) {
      return;
    }
    if (this.useLocalModeration()) {
      this.localMod.mute(account, null);
      this.flash(`Muted @${account.acct} in this browser.`);
      return;
    }
    this.api.muteAccount(account.id).subscribe({
      next: () => this.flash(`Muted @${account.acct}.`),
      error: () => this.actionError.set('Could not mute this account.'),
    });
  }

  /** Reporting needs the full dialog, which lives on the thread page. */
  protected reportPost(): void {
    this.openThread();
  }

  protected deletePost(): void {
    const status = this.post();
    this.menuOpen.set(false);
    if (!status || !this.isOwnPost()) {
      return;
    }
    const request =
      status.provider === 'bluesky'
        ? this.blueskyApi.deleteRecord((status.providerRef as BskyRef).uri)
        : this.api.deleteStatus(status.id);
    request.subscribe({
      next: () => {
        this.deleted.emit(status);
        this.closed.emit();
      },
      error: () => this.actionError.set('Could not delete this post.'),
    });
  }

  /** The picture's post was deleted, so the parent must drop it from the wall. */
  readonly deleted = output<Status>();

  // --- replying, home-feed style ---

  /**
   * Which post the open composer is aimed at, or null when it is closed.
   *
   * The composer is opened by a reply icon rather than living at the bottom of
   * the column, because a Mastodon caption can be very long and the composer is
   * tall — together they left almost no room for the comments in between. On a
   * phone that was the entire panel. Opening on demand, next to the thing being
   * replied to, is also how the home feed already behaves.
   */
  protected replyingTo = signal<Status | null>(null);

  protected startReply(status: Status): void {
    if (!this.canReply()) {
      return;
    }
    this.replyingTo.set(status);
  }

  protected cancelReply(): void {
    this.replyingTo.set(null);
  }

  protected isReplyingTo(status: Status): boolean {
    return this.replyingTo()?.id === status.id;
  }

  // --- navigation ---

  protected go(delta: number): void {
    const items = this.items();
    const at = this.index();
    if (at < 0) {
      return;
    }
    const next = at + delta;
    if (next < 0) {
      return;
    }
    if (next >= items.length) {
      // Off the end of what is loaded: ask for another page rather than
      // wrapping. Wrapping would quietly send the reader back to the newest
      // picture, which reads as "the app lost my place".
      this.wantMore.emit();
      return;
    }
    this.navigated.emit(items[next]);
  }

  /**
   * Jump to the first image of the adjacent *post*.
   *
   * This is the answer to "four presses to get past an album": the grid is a
   * flat wall of images, but the underlying posts are still the unit a reader
   * thinks in when they want to move on.
   */
  protected goPost(delta: number): void {
    const items = this.items();
    const item = this.current();
    if (!item) {
      return;
    }
    const targetPost = item.postIndex + delta;
    if (targetPost < 0) {
      return;
    }
    const target = items.find((candidate) => candidate.postIndex === targetPost);
    if (!target) {
      if (delta > 0) {
        this.wantMore.emit();
      }
      return;
    }
    this.navigated.emit(target);
  }

  protected hasPrev = computed(() => this.index() > 0);
  protected hasNext = computed(() => this.index() >= 0 && this.index() < this.items().length - 1);

  protected close(): void {
    this.closed.emit();
  }

  /** Close when the backdrop itself is clicked, never the photo or the column. */
  protected onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  protected authorLink = computed(() => {
    const account = this.current()?.status.account;
    return account ? accountRoutePath({ id: account.id, handle: account.acct }) : ['/'];
  });

  /**
   * Close the ··· menu when the next click lands anywhere else.
   *
   * Registered on the host rather than the document so it does not fight the
   * menu's own buttons: those stop at their handlers, which close it themselves.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('.photo-menu-wrap')) {
      return;
    }
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    // Never steal keys from the reply box: arrowing through a draft must move
    // the caret, not the picture.
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) {
      return;
    }
    if (target?.isContentEditable) {
      return;
    }
    switch (event.key) {
      case 'Escape':
        // Escape unwinds one layer at a time: an open menu or composer first,
        // the viewer only once nothing is layered over it.
        if (this.menuOpen()) {
          this.menuOpen.set(false);
        } else if (this.replyingTo()) {
          this.replyingTo.set(null);
        } else {
          this.close();
        }
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.go(1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.go(-1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.goPost(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.goPost(-1);
        break;
    }
  }
}
