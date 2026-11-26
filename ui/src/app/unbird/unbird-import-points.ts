import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { MbSection } from '../design-system/page-header/page-header';
import { UnbirdMatcher } from './unbird-matcher';

// i18n unbird.points.title: Your archives on this computer
// i18n unbird.points.lead: Keep more than one: an old and a new archive, or one archive replayed into a main and an alt account. Each keeps its own people, replay and progress.
// i18n unbird.points.archive: @{{user}}, read {{date}} ({{tweets}} tweets)
// i18n unbird.points.unknown: An archive read {{date}} ({{tweets}} tweets)
// i18n unbird.points.current: In use
// i18n unbird.points.use: Use this one
// i18n unbird.points.forget: Forget

/**
 * Native only: the archives kept as import points, with a way to switch
 * between them. The web keeps one archive and shows nothing here. Replay
 * ledgers are keyed by archive and Mastodon account, so one archive can be
 * replayed into a main and an alt without either seeing the other's queue.
 */
@Component({
  selector: 'app-unbird-import-points',
  imports: [MbButton, MbSection, TranslocoPipe],
  template: `
    @if (shown()) {
      <mb-section [title]="'unbird.points.title' | transloco">
        <p class="muted">{{ 'unbird.points.lead' | transloco }}</p>
        <ul>
          @for (point of matcher.importPoints(); track point.id) {
            <li>
              <span>
                @if (point.userName) {
                  {{
                    'unbird.points.archive'
                      | transloco
                        : { user: point.userName, date: date(point.readAt), tweets: point.tweets }
                  }}
                } @else {
                  {{
                    'unbird.points.unknown'
                      | transloco: { date: date(point.readAt), tweets: point.tweets }
                  }}
                }
              </span>
              <span class="actions">
                @if (point.id === matcher.currentId()) {
                  <strong>{{ 'unbird.points.current' | transloco }}</strong>
                } @else {
                  <button
                    mbButton
                    variant="compact"
                    type="button"
                    (click)="matcher.switchTo(point.id)"
                  >
                    {{ 'unbird.points.use' | transloco }}
                  </button>
                }
                <button
                  mbButton
                  variant="compact"
                  tone="danger"
                  type="button"
                  (click)="matcher.forget(point.id)"
                >
                  {{ 'unbird.points.forget' | transloco }}
                </button>
              </span>
            </li>
          }
        </ul>
      </mb-section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .muted {
      margin: 0 0 8px;
      color: var(--muted);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px 12px;
      padding: 8px 0;
      border-top: 1px solid var(--border);
    }
    .actions {
      display: flex;
      gap: 12px;
      align-items: baseline;
    }
  `,
})
export class UnbirdImportPoints {
  protected readonly matcher = inject(UnbirdMatcher);
  protected readonly shown = computed(
    () => this.matcher.native && this.matcher.importPoints().length > 0,
  );

  protected date(time: number): string {
    return new Date(time).toLocaleDateString(undefined, { dateStyle: 'medium' });
  }
}
