import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from '../../../platform/api/models';
import { stripHtml } from '../../../feeds/sentiment';

// i18n compose.quotePreview.label: Quoting
// i18n compose.quotePreview.media: 📎 {{count}}

const EXCERPT_CHARS = 280;

/**
 * The post being quoted, shown *below* what you are writing about it.
 *
 * Plain text on purpose: this is a reminder of what you are responding to, not
 * a second timeline card with its own actions, links and media players. It is
 * shared by the quote dialog and Write so both read the same way.
 */
@Component({
  selector: 'app-quote-preview',
  imports: [TranslocoPipe],
  template: `
    <figure class="quote-preview" [attr.aria-label]="'compose.quotePreview.label' | transloco">
      <figcaption class="quote-preview-head">
        @if (status().account.avatar_static; as avatar) {
          <img class="quote-preview-avatar" [src]="avatar" alt="" width="20" height="20" />
        }
        <strong>{{ name() }}</strong>
        <span class="muted">&#64;{{ status().account.acct }}</span>
      </figcaption>
      @if (status().spoiler_text) {
        <p class="quote-preview-cw muted">⚠ {{ status().spoiler_text }}</p>
      }
      <p class="quote-preview-text">{{ excerpt() }}</p>
      @if (status().media_attachments.length) {
        <span class="muted small">{{
          'compose.quotePreview.media' | transloco: { count: status().media_attachments.length }
        }}</span>
      }
    </figure>
  `,
  styles: `
    .quote-preview {
      margin: 0;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
    }
    .quote-preview-head {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }
    .quote-preview-avatar {
      border-radius: 50%;
    }
    .quote-preview-text,
    .quote-preview-cw {
      margin: 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
  `,
})
export class QuotePreview {
  readonly status = input.required<Status>();

  protected readonly name = computed(
    () => this.status().account.display_name || this.status().account.username,
  );

  protected readonly excerpt = computed(() => {
    const text = stripHtml(this.status().content ?? '').trim();
    return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS - 1)}…` : text;
  });
}
