import { Component, DestroyRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, Observable, switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPopover } from '../../design-system/popover/popover';
import { Account, Status } from '../../platform/api/models';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { AnonymousAccount } from '../anonymous/anonymous-account';
import { AnonymousProviderRef } from '../anonymous/anonymous-mastodon-provider';
import { anonymousStatusRouteRef } from '../anonymous/anonymous-route-ref';
import { AnonymousPublicApi } from '../anonymous/anonymous-public-api';
import { parseAnonymousAccountRouteRef } from '../anonymous/anonymous-route-ref';
import { RenderedHtmlLinks } from '../rendered-html-links';
import { AccountHoverCard } from './account-hover-card';

// i18n accountPreview.open: Preview profile
// i18n accountPreview.close: Close preview
// i18n accountPreview.pinned: Pinned posts
// i18n accountPreview.pinnedError: Pinned posts couldn't be loaded.
@Component({
  selector: 'app-account-preview',
  imports: [MbPopover, AccountHoverCard, TranslocoPipe, RouterLink, RenderedHtmlLinks],
  template: `
    <div
      #anchor
      class="summary"
      tabindex="0"
      aria-haspopup="dialog"
      [attr.aria-expanded]="opened()"
      [attr.aria-label]="'accountPreview.open' | transloco"
      (pointerenter)="enter($event)"
      (pointerleave)="leave()"
      (focusin)="focusIn($event)"
      (focusout)="focusOut($event)"
      (keydown)="anchorKey($event)"
    >
      <ng-content />
      <mb-popover
        [label]="'accountPreview.open' | transloco"
        [roomy]="true"
        [anchor]="anchor"
        (openedChange)="changed($event)"
        (panelEntered)="cancelClose()"
        (panelLeft)="leave()"
      >
        @if (opened()) {
          <div>
            <app-account-hover-card [account]="account()" inline embedded />
            @if (pinnedPosts().length) {
              <h3>{{ 'accountPreview.pinned' | transloco }}</h3>
              @for (post of pinnedPosts(); track post.id) {
                <article class="pinned-post">
                  <div appRenderedHtmlLinks [innerHTML]="post.spoiler_text || post.content"></div>
                  <a [routerLink]="postLink(post)" (click)="popover().close(false)">{{
                    'pages.profile.media.openThread' | transloco
                  }}</a>
                </article>
              }
            }
            @if (pinnedError()) {
              <p class="muted" role="status">{{ 'accountPreview.pinnedError' | transloco }}</p>
            }
          </div>
        }
      </mb-popover>
    </div>
  `,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-width: 0;
    }
    .summary {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pinned-post {
      border-top: 1px solid var(--border);
      padding: 8px 0;
      overflow-wrap: anywhere;
    }
    .pinned-post a {
      color: inherit;
    }
  `,
})
export class AccountPreview {
  readonly account = input.required<Account>();
  protected readonly popover = viewChild.required(MbPopover);
  protected opened = signal(false);
  protected pinnedPosts = signal<Status[]>([]);
  protected pinnedError = signal(false);
  private loadedFor?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousAccount);
  private publicApi = inject(AnonymousPublicApi);
  private destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelClose());
  }
  protected postLink(post: Status): string[] {
    const ref = post.providerRef as AnonymousProviderRef | undefined;
    return [
      '/statuses',
      post.provider === 'anonymous-mastodon' && ref
        ? anonymousStatusRouteRef({ server: ref.server, id: ref.statusId })
        : post.id,
    ];
  }
  protected focusIn(event: FocusEvent): void {
    this.cancelClose();
    // Escape returning focus from the card must not immediately reopen it.
    if (
      event.relatedTarget &&
      this.popover()
        .panel()
        .nativeElement.contains(event.relatedTarget as Node)
    )
      return;
    this.popover().show(false);
  }
  protected focusOut(event: FocusEvent): void {
    // Disabling a busy Follow button can blur it with no next target.
    // That is not a request to dismiss the profile the user is interacting with.
    if (
      event.relatedTarget &&
      !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
    )
      this.leave();
  }
  protected anchorKey(event: KeyboardEvent): void {
    if (event.target === event.currentTarget && ['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      if (this.opened()) this.popover().panel().nativeElement.focus({ preventScroll: true });
      else this.popover().show();
    }

    if (event.key === 'Escape') {
      this.popover().close();
      event.stopPropagation();
    }
  }
  protected enter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    this.cancelClose();
    this.timer = setTimeout(() => this.popover().show(false), 250);
  }
  protected cancelClose(): void {
    clearTimeout(this.timer);
  }
  protected leave(): void {
    this.cancelClose();
    this.timer = setTimeout(() => {
      const popover = this.popover();
      if (popover.panel().nativeElement.matches(':hover') || popover.anchor()?.matches(':hover'))
        return;
      popover.close(false);
    }, 400);
  }
  protected changed(open: boolean): void {
    this.opened.set(open);
    if (!open) {
      this.cancelClose();
      return;
    }
    const account = this.account();
    if (this.loadedFor === account.id) return;
    this.loadedFor = account.id;
    this.pinnedPosts.set([]);
    this.pinnedError.set(false);
    const options = { pinned: true, limit: 3 };
    const anonymous = this.auth.isAnonymous;
    const ref =
      parseAnonymousAccountRouteRef(account.id) ??
      (anonymous && !account.id.includes(':')
        ? { server: this.anonymous.server(), id: account.id }
        : null);
    if (!ref && account.id.includes(':')) return;
    let request: Observable<Status[]> = ref
      ? this.publicApi.getAccountStatuses(ref, options)
      : this.api.getAccountStatuses(account.id, options);
    // Anonymous reads through someone else's server, which may refuse
    // unauthenticated reads or hold only a partial copy of a remote account.
    // The account's own server is the one that has its pinned posts.
    const home = anonymous && ref ? homeServer(account, ref.server) : null;
    if (home && ref) {
      const fallback = request;
      request = this.publicApi.lookupAccount(home, account.username).pipe(
        switchMap((found) =>
          this.publicApi.getAccountStatuses({ server: home, id: found.id }, options),
        ),
        catchError(() => fallback),
      );
    }
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (posts) => this.pinnedPosts.set(posts.slice(0, 3)),
      error: () => {
        this.loadedFor = undefined;
        // Pinned posts are a bonus in a preview. Anonymous cannot do anything
        // about a server that refuses them, so it just goes without.
        this.pinnedError.set(!anonymous);
      },
    });
  }
}

/** The account's own server, when it differs from the one it was read through. */
function homeServer(account: Account, readThrough: string): string | null {
  try {
    const origin = new URL(account.url).origin;
    return origin !== new URL(readThrough).origin ? origin : null;
  } catch {
    return null;
  }
}
