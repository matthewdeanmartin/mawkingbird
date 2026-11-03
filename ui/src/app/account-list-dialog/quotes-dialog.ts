import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map, Observable } from 'rxjs';
import { Api } from '../api';
import { MbButton } from '../design-system/button/button';
import { MbContentState } from '../design-system/content-state/content-state';
import { MbDialog } from '../design-system/dialog/dialog';
import { Status } from '../models';
import { adaptPost } from '../providers/bluesky/bluesky-adapter';
import { BlueskyApi } from '../providers/bluesky/bluesky-api';
import { BlueskyPostControls } from '../providers/bluesky/bluesky-post-controls';

// i18n quotes.title: Quotes
// i18n quotes.close: Close
// i18n quotes.loading: Loading quotes…
// i18n quotes.failed: Could not load quotes.
// i18n quotes.retry: Retry
// i18n quotes.empty: No quotes yet.
// i18n quotes.detach: Detach
// i18n quotes.reattach: Reattach
// i18n quotes.detachTitle: Remove my post from this quote. The quote stays; it shows my post as removed.
// i18n quotes.detachFailed: Couldn't change this quote on Bluesky.

/** Plain text of a post's HTML content, for a one-line excerpt. */
function excerpt(html: string): string {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The posts that quoted a post: from the Mastodon server (4.5 and newer), or
 * from Bluesky for a Bluesky post. Each row opens the quoting post's thread.
 * On the reader's own Bluesky post, a quote can be detached: Bluesky then shows
 * the quote with the original removed, which is its answer to an unwanted quote.
 */
@Component({
  selector: 'app-quotes-dialog',
  imports: [MbDialog, MbButton, MbContentState, RouterLink, TranslocoPipe],
  template: `
    <mb-dialog
      [title]="'quotes.title' | transloco"
      [closeLabel]="'quotes.close' | transloco"
      [showClose]="false"
      [closeOnBackdrop]="true"
      (dismissed)="closed.emit()"
    >
      @if (loading()) {
        <mb-content-state
          kind="loading"
          announcement="status"
          [title]="'quotes.loading' | transloco"
        />
      } @else if (failed()) {
        <mb-content-state kind="error" announcement="alert" [title]="'quotes.failed' | transloco">
          <button mbButton type="button" variant="outline" (click)="load()">
            {{ 'quotes.retry' | transloco }}
          </button>
        </mb-content-state>
      } @else if (!quotes().length) {
        <mb-content-state kind="empty" [title]="'quotes.empty' | transloco" />
      } @else {
        <ul class="account-list">
          @for (q of quotes(); track q.id) {
            <li class="quote-row">
              <a class="account-row" [routerLink]="['/statuses', q.id]" (click)="closed.emit()">
                <img
                  class="avatar"
                  [src]="q.account.avatar_static || q.account.avatar"
                  [alt]="q.account.username"
                  loading="lazy"
                  decoding="async"
                />
                <span class="names">
                  <span class="name">{{ q.account.display_name || q.account.username }}</span>
                  <span class="acct muted">{{ text(q) }}</span>
                </span>
              </a>
              @if (canDetach()) {
                <button
                  mbButton
                  type="button"
                  variant="outline"
                  size="small"
                  [disabled]="busy() === q.id"
                  [title]="'quotes.detachTitle' | transloco"
                  (click)="toggleDetached(q)"
                >
                  {{ (detached().has(q.id) ? 'quotes.reattach' : 'quotes.detach') | transloco }}
                </button>
              }
            </li>
          }
        </ul>
        @if (error()) {
          <p class="muted" role="alert">{{ error() }}</p>
        }
      }

      <button mbDialogActions mbButton type="button" variant="outline" (click)="closed.emit()">
        {{ 'quotes.close' | transloco }}
      </button>
    </mb-dialog>
  `,
  styleUrl: './account-list-dialog.css',
})
export class QuotesDialog implements OnInit {
  private api = inject(Api);
  private bskyApi = inject(BlueskyApi);
  private controls = inject(BlueskyPostControls);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslocoService);

  readonly statusId = input.required<string>();
  /** The Bluesky post's at-uri. Set, quotes come from Bluesky instead of the server. */
  readonly blueskyUri = input<string | null>(null);
  /** The reader wrote this Bluesky post, so its quotes can be detached. */
  readonly canDetach = input(false);
  readonly closed = output<void>();

  protected quotes = signal<Status[]>([]);
  protected loading = signal(false);
  protected failed = signal(false);
  protected busy = signal<string | null>(null);
  protected detached = signal(new Set<string>());
  protected error = signal('');

  ngOnInit(): void {
    this.load();
  }

  protected text(status: Status): string {
    return excerpt(status.content);
  }

  protected load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    this.quotes$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quotes) => {
          this.quotes.set(quotes);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  protected async toggleDetached(quote: Status): Promise<void> {
    const uri = this.blueskyUri();
    const quoteUri = (quote.providerRef as { uri?: string } | undefined)?.uri;
    if (!uri || !quoteUri || this.busy()) return;
    const detach = !this.detached().has(quote.id);
    this.busy.set(quote.id);
    this.error.set('');
    try {
      await this.controls.setQuoteDetached(uri, quoteUri, detach);
      this.detached.update((set) => {
        const next = new Set(set);
        if (detach) next.add(quote.id);
        else next.delete(quote.id);
        return next;
      });
    } catch {
      this.error.set(this.i18n.translate('quotes.detachFailed'));
    } finally {
      this.busy.set(null);
    }
  }

  private quotes$(): Observable<Status[]> {
    const uri = this.blueskyUri();
    return uri
      ? this.bskyApi.getQuotes(uri).pipe(map((page) => page.posts.map(adaptPost)))
      : this.api.quotesOf(this.statusId());
  }
}
