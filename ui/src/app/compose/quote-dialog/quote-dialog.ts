import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../design-system/dialog/dialog';
import { Status } from '../../models';
import { BskyRef } from '../../providers/bluesky/bluesky-types';
import { Compose } from '../compose';
import { QuotePreview } from '../quote-preview/quote-preview';

// i18n compose.quoteDialog.title: Quote post
// i18n compose.quoteDialog.close: Close
// i18n compose.quoteDialog.placeholder: Say something about this post
// i18n compose.quoteDialog.denied: The author does not allow this post to be quoted. You can still share a link to it in a post of your own.
// i18n compose.quoteDialog.manual: The author reviews quotes. Yours appears once they approve it.

/**
 * Quoting, as its own dialog.
 *
 * A quote used to open the same inline box under the post that a reply does,
 * which made it look like a reply. A quote is a new post to your own audience,
 * so it reads top to bottom the way it will be published: your words first,
 * the quoted post below them.
 */
@Component({
  selector: 'app-quote-dialog',
  imports: [MbDialog, Compose, QuotePreview, TranslocoPipe],
  template: `
    <mb-dialog
      size="wide"
      [title]="'compose.quoteDialog.title' | transloco"
      [closeLabel]="'compose.quoteDialog.close' | transloco"
      (dismissed)="closed.emit()"
    >
      @if (denied()) {
        <p role="alert">{{ 'compose.quoteDialog.denied' | transloco }}</p>
      } @else {
        @if (manual()) {
          <p class="muted small">{{ 'compose.quoteDialog.manual' | transloco }}</p>
        }
        <app-compose
          [quotedStatusId]="isBluesky() ? undefined : status().id"
          [quotedStatus]="isBluesky() ? undefined : status()"
          [blueskyQuote]="blueskyQuote()"
          [initialTarget]="isBluesky() ? 'bsky' : 'fedi'"
          initialVisibility="public"
          [gateable]="true"
          [fullscreenEdit]="!isBluesky()"
          [placeholder]="'compose.quoteDialog.placeholder' | transloco"
          (posted)="posted.emit($event)"
        />
      }
      <app-quote-preview class="quote-dialog-preview" [status]="status()" />
    </mb-dialog>
  `,
  styles: `
    .quote-dialog-preview {
      display: block;
      margin-top: 12px;
    }
  `,
})
export class QuoteDialog {
  readonly status = input.required<Status>();
  readonly blueskyQuote = input<BskyRef | undefined>(undefined);
  readonly posted = output<Status>();
  readonly closed = output<void>();

  protected readonly isBluesky = computed(() => this.status().provider === 'bluesky');
  protected readonly denied = computed(
    () => this.status().quote_approval?.current_user === 'denied',
  );
  protected readonly manual = computed(
    () => this.status().quote_approval?.current_user === 'manual',
  );
}
