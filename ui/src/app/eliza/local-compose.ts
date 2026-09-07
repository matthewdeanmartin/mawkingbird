import { Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Status } from '../models';
import { LocalPostStore } from './local-post-store';

/**
 * A minimal composer for browser-local practice posts — the anonymous
 * counterpart to the full {@link Compose} component, which requires a real
 * account. Used both as a top-level composer on Home and as an inline reply box
 * under a local/Eliza post. It writes through {@link LocalPostStore} (which also
 * produces Eliza's immediate reply) and emits the viewer's new post so the host
 * can react.
 */
@Component({
  selector: 'app-local-compose',
  imports: [FormsModule],
  template: `
    <form class="local-compose" (submit)="submit($event)">
      <textarea
        class="local-compose-input"
        [(ngModel)]="text"
        [ngModelOptions]="{ standalone: true }"
        [attr.aria-label]="inReplyTo() ? 'Write a reply' : 'Write a practice post'"
        [placeholder]="placeholder()"
        rows="2"
      ></textarea>
      <div class="local-compose-row">
        <span class="muted local-compose-note">Practice only — stays in your browser.</span>
        <button type="submit" class="btn" [disabled]="!text.trim()">
          {{ inReplyTo() ? 'Reply' : 'Post' }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      .local-compose {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
      }
      .local-compose-input {
        width: 100%;
        resize: vertical;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--col-bg);
        color: var(--text);
        font: inherit;
      }
      .local-compose-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .local-compose-note {
        font-size: 13px;
      }
    `,
  ],
})
export class LocalCompose {
  private store = inject(LocalPostStore);

  /** When set, this composer posts a reply to that status id; otherwise top-level. */
  readonly inReplyTo = input<string | null>(null);

  /** Emitted with the viewer's new local post after a successful submit. */
  readonly posted = output<Status>();

  protected text = '';

  protected placeholder = () =>
    this.inReplyTo() ? 'Write a reply to practise…' : "What's on your mind? (practice post)";

  submit(event: Event): void {
    event.preventDefault();
    const replyTo = this.inReplyTo();
    const created = replyTo ? this.store.reply(replyTo, this.text) : this.store.compose(this.text);
    if (created) {
      this.text = '';
      this.posted.emit(created);
    }
  }
}
