import { Component, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from './models';
import { PrivateLikes } from './private-likes';

// i18n statusCard.privateLike.add: Private like
// i18n statusCard.privateLike.remove: Remove private like
// i18n statusCard.privateLike.hint: Save in this browser only. No network like or notification is sent.
// i18n statusCard.privateLike.failed: Could not save this private like. The limit is 200; remove an old private like or free some browser storage and try again.
@Component({
  selector: 'app-private-like-button',
  imports: [TranslocoPipe],
  template: `
    @if (likes.current(); as store) {
      @if (status().url) {
        <button
          type="button"
          class="action"
          [attr.aria-pressed]="store.has(status())"
          [title]="'statusCard.privateLike.hint' | transloco"
          (click)="toggle($event)"
        >
          {{
            (store.has(status()) ? 'statusCard.privateLike.remove' : 'statusCard.privateLike.add')
              | transloco
          }}
        </button>
        @if (failed()) {
          <span role="alert">{{ 'statusCard.privateLike.failed' | transloco }}</span>
        }
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    button {
      display: block;
      width: 100%;
      text-align: left;
      cursor: pointer;
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 7px 9px;
      border-radius: 6px;
    }
    button:hover {
      background: var(--border);
    }
    button[aria-pressed='true'] {
      color: var(--accent);
    }
    [role='alert'] {
      font-size: 0.85rem;
    }
  `,
})
export class PrivateLikeButton {
  readonly status = input.required<Status>();
  protected likes = inject(PrivateLikes);
  protected failed = signal(false);

  protected toggle(event: Event): void {
    event.stopPropagation();
    try {
      this.likes.current()?.toggle(this.status());
      this.failed.set(false);
    } catch {
      this.failed.set(true);
    }
  }
}
