import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { postHeatmap } from '../account-metrics';
import { feedSubject } from '../feed-metrics';
import { Status } from '../models';

// i18n feedAnalytics.calendar.title: Posting frequency
// i18n feedAnalytics.calendar.caption: One square per day; darker means more posts. Uses original publication dates, including for boosts. Only the loaded sample is shown, including the quiet days between posts. Load more posts to extend the calendar.
// i18n feedAnalytics.calendar.summary: {{posts}} posts across {{days}} days; {{active}} days with posts. Busiest day: {{peak}} posts.
// i18n feedAnalytics.calendar.day: {{date}}: {{count}} posts
@Component({
  selector: 'app-posting-calendar',
  imports: [TranslocoPipe],
  template: `
    @if (heatmap(); as map) {
      @if (map.weeks.length) {
        <h2>{{ 'feedAnalytics.calendar.title' | transloco }}</h2>
        <p class="muted small">{{ 'feedAnalytics.calendar.caption' | transloco }}</p>
        <p class="muted small">
          {{
            'feedAnalytics.calendar.summary'
              | transloco
                : { posts: posts().length, days: map.days, active: map.activeDays, peak: map.peak }
          }}
        </p>
        <div class="calendar-scroll">
          <div class="months" aria-hidden="true">
            @for (month of map.months; track month.weekIndex) {
              <span [style.grid-column]="month.weekIndex + 1">{{ month.label }}</span>
            }
          </div>
          <div
            class="calendar"
            role="img"
            [attr.aria-label]="
              'feedAnalytics.calendar.summary'
                | transloco
                  : {
                      posts: posts().length,
                      days: map.days,
                      active: map.activeDays,
                      peak: map.peak,
                    }
            "
          >
            @for (week of map.weeks; track week[0].dayIso) {
              <div class="week">
                @for (day of week; track day.dayIso) {
                  <span
                    class="day"
                    [class]="'heat-' + day.level"
                    [title]="
                      'feedAnalytics.calendar.day'
                        | transloco: { date: day.label, count: day.posts }
                    "
                  ></span>
                }
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      margin: 20px 0;
    }
    h2 {
      font-size: 16px;
    }
    .calendar-scroll {
      overflow-x: auto;
      padding: 4px 0;
    }
    .months {
      display: grid;
      grid-auto-columns: 14px;
      grid-auto-flow: column;
      height: 18px;
      font-size: 10px;
    }
    .months span {
      grid-row: 1;
      white-space: nowrap;
    }
    .calendar {
      display: flex;
      gap: 3px;
      width: max-content;
    }
    .week {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .day {
      width: 11px;
      height: 11px;
      border-radius: 2px;
      background: var(--hover);
    }
    .heat-1 {
      background: color-mix(in srgb, var(--accent) 28%, var(--col-bg));
    }
    .heat-2 {
      background: color-mix(in srgb, var(--accent) 52%, var(--col-bg));
    }
    .heat-3 {
      background: color-mix(in srgb, var(--accent) 76%, var(--col-bg));
    }
    .heat-4 {
      background: var(--accent);
    }
  `,
})
export class PostingCalendar {
  readonly posts = input.required<Status[]>();
  protected readonly heatmap = computed(() => postHeatmap(this.posts().map(feedSubject)));
}
