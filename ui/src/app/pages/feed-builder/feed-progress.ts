import { Component, input } from '@angular/core';
import { SampleProgress } from './feed-sample';

/**
 * Requests made of requests planned, while a tab reads public timelines and
 * the reader waits. The friend finders' bar (friend-finder.css), with its
 * label in the page's language.
 */
@Component({
  selector: 'app-feed-progress',
  template: `<div class="sample-progress" role="status" aria-live="polite">
    <span class="muted">{{ label() }}</span>
    <div
      class="progress-track"
      role="progressbar"
      [attr.aria-valuenow]="progress().done"
      [attr.aria-valuemin]="0"
      [attr.aria-valuemax]="progress().planned"
    >
      <div
        class="progress-fill"
        [style.width.%]="progress().planned ? (progress().done / progress().planned) * 100 : 0"
      ></div>
    </div>
  </div>`,
  styles: `
    .sample-progress {
      margin-block: 8px 16px;
    }
    .muted {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .progress-track {
      height: 8px;
      margin-top: 8px;
      overflow: hidden;
      border-radius: 9999px;
      background: var(--border);
    }
    .progress-fill {
      height: 100%;
      border-radius: 9999px;
      background: var(--accent);
      transition: width 0.2s;
    }
  `,
})
export class FeedProgress {
  readonly progress = input.required<SampleProgress>();
  readonly label = input.required<string>();
}
