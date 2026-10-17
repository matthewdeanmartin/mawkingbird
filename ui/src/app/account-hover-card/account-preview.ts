import { Component, DestroyRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbPopover } from '../design-system/popover/popover';
import { Account, Status } from '../models';
import { Api } from '../api';
import { Auth } from '../auth';
import { AnonymousAccount } from '../providers/anonymous/anonymous-account';
import { AnonymousProviderRef } from '../providers/anonymous/anonymous-mastodon-provider';
import { anonymousStatusRouteRef } from '../providers/anonymous/anonymous-route-ref';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { parseAnonymousAccountRouteRef } from '../providers/anonymous/anonymous-route-ref';
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
    const ref =
      parseAnonymousAccountRouteRef(account.id) ??
      (this.auth.isAnonymous && !account.id.includes(':')
        ? { server: this.anonymous.server(), id: account.id }
        : null);
    if (!ref && account.id.includes(':')) return;
    const options = { pinned: true, limit: 3 };
    const request = ref
      ? this.publicApi.getAccountStatuses(ref, options)
      : this.api.getAccountStatuses(account.id, options);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (posts) => this.pinnedPosts.set(posts.slice(0, 3)),
      error: () => {
        this.loadedFor = undefined;
        this.pinnedError.set(true);
      },
    });
  }
}
