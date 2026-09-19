import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmDialog } from '../../../confirm-dialog/confirm-dialog';
import { Status } from '../../../models';
import { RssSubscriptions } from '../../../providers/rss/rss-subscriptions';
import { rssSourceUrl } from '../../../providers/rss/rss-source';

// i18n pages.rss.feedActions.menu: Feed actions for {{feed}}
// i18n pages.rss.feedActions.label: Feed ···
// i18n pages.rss.feedActions.view: View feed
// i18n pages.rss.feedActions.unsubscribeFrom: Unsubscribe from {{feed}}…
// i18n pages.rss.feedActions.confirmTitle: Unsubscribe from {{feed}}?
// i18n pages.rss.feedActions.confirmMessage: Stop receiving new items from this feed? Saved articles and reading history will be kept.
// i18n pages.rss.feedActions.unsubscribe: Unsubscribe
@Component({
  selector: 'app-rss-feed-actions',
  imports: [RouterLink, TranslocoPipe, ConfirmDialog],
  template: `
    @if (feedUrl(); as url) {
      <details #menu tabindex="-1" (keydown.escape)="menu.open = false; trigger.focus()">
        <summary
          #trigger
          [attr.aria-label]="'pages.rss.feedActions.menu' | transloco: { feed: title() }"
        >
          {{ 'pages.rss.feedActions.label' | transloco }}
        </summary>
        <div class="feed-menu" [class.align-start]="align() === 'start'">
          <a [routerLink]="['/accounts', 'rss:' + url]">{{
            'pages.rss.feedActions.view' | transloco
          }}</a>
          @if (subs.has(url)) {
            <button type="button" (click)="menu.open = false; confirming.set(true)">
              {{ 'pages.rss.feedActions.unsubscribeFrom' | transloco: { feed: title() } }}
            </button>
          }
        </div>
      </details>
      @if (confirming()) {
        <app-confirm-dialog
          [title]="'pages.rss.feedActions.confirmTitle' | transloco: { feed: title() }"
          [message]="'pages.rss.feedActions.confirmMessage' | transloco"
          [confirmLabel]="'pages.rss.feedActions.unsubscribe' | transloco"
          (cancelled)="confirming.set(false)"
          (confirmed)="unsubscribe(url)"
        />
      }
    }
  `,
  styles: `
    :host {
      display: inline-block;
    }
    details {
      position: relative;
    }
    summary {
      cursor: pointer;
      list-style: none;
      padding: 7px 10px;
      font-size: 13px;
      white-space: nowrap;
      color: var(--muted);
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .feed-menu {
      position: absolute;
      right: 0;
      top: 100%;
      z-index: 20;
      width: max-content;
      max-width: min(300px, 85vw);
      background: var(--col-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 4px 16px #0003;
      padding: 4px;
    }
    .feed-menu a,
    .feed-menu button {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      text-align: left;
      border: 0;
      background: none;
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    .feed-menu.align-start {
      left: 0;
      right: auto;
    }
    .feed-menu a:hover,
    .feed-menu button:hover {
      background: var(--bg);
    }
  `,
})
export class RssFeedActions {
  readonly align = input<'start' | 'end'>('end');
  readonly status = input.required<Status>();
  readonly unsubscribed = output<string>();
  protected subs = inject(RssSubscriptions);
  protected confirming = signal(false);
  protected feedUrl = computed(() => rssSourceUrl(this.status()));
  protected title = computed(
    () =>
      this.subs.feeds().find((feed) => feed.url === this.feedUrl())?.title ||
      this.status().account.display_name ||
      this.feedUrl(),
  );
  protected unsubscribe(url: string): void {
    this.confirming.set(false);
    this.subs.remove(url);
    this.unsubscribed.emit(url);
  }
}
