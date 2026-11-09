import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusReaction } from '../models';

/** Most chips shown under one post; the rest are left off rather than wrapping endlessly. */
const MAX_SHOWN = 16;

/**
 * Emoji reactions under a post (Misskey), as read-only chips with counts.
 *
 * Its own component so the chip styles stay out of the status card's
 * stylesheet, which sits at its size budget. Reacting arrives with writing
 * (roadmap M2).
 */
@Component({
  selector: 'app-status-reactions',
  imports: [TranslocoPipe],
  styleUrl: './status-reactions.css',
  template: `
    <ul class="reactions" [attr.aria-label]="'statusCard.reactions' | transloco">
      @for (reaction of shown(); track reaction.name) {
        <li class="reaction" [class.mine]="reaction.me" [title]="reaction.name">
          @if (reaction.url) {
            <img class="reaction-emoji" [src]="reaction.url" [alt]="reaction.name" loading="lazy" />
          } @else {
            <span class="reaction-emoji">{{ reaction.name }}</span>
          }
          <span class="reaction-count">{{ reaction.count }}</span>
        </li>
      }
    </ul>
  `,
})
export class StatusReactions {
  readonly reactions = input.required<StatusReaction[]>();

  protected shown(): StatusReaction[] {
    return this.reactions().slice(0, MAX_SHOWN);
  }
}
