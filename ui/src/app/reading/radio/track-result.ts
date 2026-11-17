import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { Status } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
import { listenParams } from '../radio-links';
import { RadioIcon } from './radio-icon';
import { isContinuous, RadioPlayer } from './radio-player';
import { postHasPage } from './single-page';
import { postTitle } from './track-title';

// i18n trackResult.play: Play
// i18n trackResult.openThread: Open thread
// i18n trackResult.ownPage: Plays on its own page
// i18n trackResult.mastodon: Mastodon audio
// i18n trackResult.warning: Content warning: {{text}}

/**
 * One search result as a recording to pick, not a post to read: its title, who
 * posted it and where it plays, with Play, keep and Open thread. Replies, likes
 * and boosts belong to the thread, one tap away.
 */
@Component({
  selector: 'app-track-result',
  imports: [RouterLink, TranslocoPipe, MbButton, RadioIcon],
  template: `
    @let single = singles()[0];
    <article class="result">
      @if (single?.media?.preview_url; as art) {
        <img class="art" [src]="art" alt="" loading="lazy" referrerpolicy="no-referrer" />
      }
      <div class="body">
        <p class="title">
          @if (post().spoiler_text) {
            {{ 'trackResult.warning' | transloco: { text: post().spoiler_text } }}
          } @else {
            {{ title() }}
          }
        </p>
        <p class="meta">
          {{ post().account.display_name || post().account.acct }} · {{ sources() }}
          @if (!continuous()) {
            · {{ 'trackResult.ownPage' | transloco }}
          }
        </p>
        <div class="actions">
          <button mbButton size="small" type="button" (click)="playRequest.emit()">
            <app-radio-icon name="play" />
            {{ 'trackResult.play' | transloco }}
          </button>
          @if (canKeep()) {
            <button mbButton size="small" variant="outline" type="button" (click)="keep.emit()">
              {{ keepLabel() | transloco }}
            </button>
          }
          @if (thread(); as params) {
            <a mbButton size="small" variant="link" routerLink="/listen" [queryParams]="params">{{
              'trackResult.openThread' | transloco
            }}</a>
          }
        </div>
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .result {
      display: flex;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    .art {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 6px;
      object-fit: cover;
    }
    .body {
      display: grid;
      flex: 1;
      gap: 4px;
      min-width: 0;
    }
    .title {
      margin: 0;
      font-weight: 600;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .meta {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }
  `,
})
export class TrackResult {
  private readonly player = inject(RadioPlayer);
  private readonly server = inject(Server);
  private readonly transloco = inject(TranslocoService);
  readonly post = input.required<Status>();
  readonly canKeep = input(false);
  readonly keepLabel = input('findSingles.save');
  readonly playRequest = output<void>();
  readonly keep = output<void>();

  readonly singles = computed(() => this.player.singlesOf(this.post()));
  readonly continuous = computed(() => this.singles().some(isContinuous));
  readonly title = computed(() => {
    const single = this.singles()[0];
    return (single ? this.player.title(single) : '') || postTitle(this.post());
  });
  /** Where the recordings play: Mastodon itself, or the services the post links. */
  readonly sources = computed(() => {
    const labels = this.singles().map((track) => track.external?.label ?? '');
    const named = [...new Set(labels.filter(Boolean))];
    return labels.some((label) => !label)
      ? [this.transloco.translate('trackResult.mastodon'), ...named].join(', ')
      : named.join(', ');
  });
  readonly thread = computed(() =>
    postHasPage(this.post()) ? listenParams(this.post(), this.server.baseUrl()) : null,
  );
}
