import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { EmojiPicker } from '../emoji-picker/emoji-picker';
import { StatusReaction } from '../models';

// i18n statusCard.reactWith: React with {{emoji}}
// i18n statusCard.removeReaction: Remove your reaction {{emoji}}
// i18n statusCard.addReaction: Add a reaction

/** Most chips shown under one post; the rest are left off rather than wrapping endlessly. */
const MAX_SHOWN = 16;

/**
 * Emoji reactions under a post (Misskey), as chips with counts.
 *
 * With `canReact`, a chip is a button: pressing the reader's own reaction
 * removes it; pressing another reacts with it (Misskey allows one reaction per
 * person, so this replaces any earlier one). A chip for another server's
 * custom emoji stays plain: Misskey only accepts the reader's own server's.
 * "+" opens the emoji picker, which lists the reader's server's custom emoji.
 *
 * Its own component so the chip styles stay out of the status card's
 * stylesheet, which sits at its size budget.
 */
@Component({
  selector: 'app-status-reactions',
  imports: [NgTemplateOutlet, TranslocoPipe, EmojiPicker],
  styleUrl: './status-reactions.css',
  // Clicks in the reaction area (chips, picker) never open the thread behind it.
  host: { '(click)': '$event.stopPropagation()' },
  template: `
    <ul class="reactions" [attr.aria-label]="'statusCard.reactions' | transloco">
      @for (reaction of shown(); track reaction.name) {
        <li class="reaction-item">
          @if (canReact() && (reaction.me || reaction.key)) {
            <button
              type="button"
              class="reaction"
              [class.mine]="reaction.me"
              [attr.aria-pressed]="reaction.me"
              [disabled]="busy()"
              [title]="
                (reaction.me ? 'statusCard.removeReaction' : 'statusCard.reactWith')
                  | transloco: { emoji: reaction.name }
              "
              (click)="choose($event, reaction)"
            >
              <ng-container
                [ngTemplateOutlet]="chip"
                [ngTemplateOutletContext]="{ $implicit: reaction }"
              />
            </button>
          } @else {
            <span class="reaction" [class.mine]="reaction.me" [title]="reaction.name">
              <ng-container
                [ngTemplateOutlet]="chip"
                [ngTemplateOutletContext]="{ $implicit: reaction }"
              />
            </span>
          }
        </li>
      }
      @if (canReact()) {
        <li class="reaction-item">
          <button
            type="button"
            class="reaction reaction-add"
            [attr.aria-expanded]="picking()"
            [disabled]="busy()"
            [title]="'statusCard.addReaction' | transloco"
            [attr.aria-label]="'statusCard.addReaction' | transloco"
            (click)="togglePicker($event)"
          >
            +
          </button>
        </li>
      }
    </ul>
    @if (picking()) {
      <div class="reaction-picker">
        <app-emoji-picker (picked)="pick($event)" />
      </div>
    }
    <ng-template #chip let-reaction>
      @if (reaction.url) {
        <img class="reaction-emoji" [src]="reaction.url" [alt]="reaction.name" loading="lazy" />
      } @else {
        <span class="reaction-emoji">{{ reaction.name }}</span>
      }
      <span class="reaction-count">{{ reaction.count }}</span>
    </ng-template>
  `,
})
export class StatusReactions {
  readonly reactions = input.required<StatusReaction[]>();
  /** The reader may react here (a Misskey note, with a token that may write). */
  readonly canReact = input(false);
  readonly busy = input(false);
  /** The reaction to send, or null to remove the reader's. */
  readonly react = output<string | null>();

  protected picking = signal(false);

  protected shown(): StatusReaction[] {
    return this.reactions().slice(0, MAX_SHOWN);
  }

  protected choose(event: Event, reaction: StatusReaction): void {
    event.stopPropagation();
    this.react.emit(reaction.me ? null : (reaction.key ?? null));
  }

  protected togglePicker(event: Event): void {
    event.stopPropagation();
    this.picking.update((open) => !open);
  }

  protected pick(emoji: string): void {
    this.picking.set(false);
    this.react.emit(emoji);
  }
}
