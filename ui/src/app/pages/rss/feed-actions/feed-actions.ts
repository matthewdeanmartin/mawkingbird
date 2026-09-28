import { MbPostActions, MbPostAction } from '../../../design-system/post-actions/post-actions';
import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  afterNextRender,
  Injector,
  ElementRef,
  viewChild,
} from '@angular/core';
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
  imports: [MbPostActions, MbPostAction, RouterLink, TranslocoPipe, ConfirmDialog],
  template: `
    @if (feedUrl(); as url) {
      <mb-post-actions [label]="'pages.rss.feedActions.menu' | transloco: { feed: title() }">
        <a #viewLink mbPostAction [routerLink]="['/accounts', 'rss:' + url]">{{
          'pages.rss.feedActions.view' | transloco
        }}</a>
        @if (subs.has(url)) {
          <button
            mbPostAction
            type="button"
            (click)="confirming.set(true)"
            [title]="'pages.rss.feedActions.unsubscribeFrom' | transloco: { feed: title() }"
          >
            {{ 'pages.rss.feedActions.unsubscribe' | transloco }}
          </button>
        }
      </mb-post-actions>
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
  `,
})
export class RssFeedActions {
  private readonly injector = inject(Injector);
  private readonly viewLink = viewChild<MbPostAction, ElementRef<HTMLAnchorElement>>('viewLink', {
    read: ElementRef,
  });
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
    afterNextRender(() => this.viewLink()?.nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }
}
