import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { summarize } from '../../platform/network/connection-history';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import { percent } from './connection-view';

// i18n connection.card.hour: Last hour: {{requests}} requests, {{failed}} with no answer
// i18n connection.card.details: Connection details →
// i18n connection.card.typical: Typical reply {{time}}

/**
 * The Observability overview's connection card: the verdict and the last hour
 * in one line, linking to the full Connection page — the same shape as the
 * storage card beside it.
 */
@Component({
  selector: 'app-connection-summary',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <a class="card" routerLink="/connection" [attr.data-verdict]="meter.verdict()">
      <span class="value">
        {{ 'connection.verdict.' + meter.verdict() | transloco }}
        @if (meter.typicalReply(); as time) {
          <span class="muted">{{ 'connection.card.typical' | transloco: { time } }}</span>
        }
      </span>
      <span class="muted small">
        {{
          'connection.card.hour' | transloco: { requests: hour().requests, failed: hour().failed }
        }}
      </span>
      <span class="muted small">{{ 'connection.card.details' | transloco }}</span>
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
    }
    .card {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px 12px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-inline-start-width: 4px;
      border-radius: 12px;
      background: var(--col-bg);
      color: inherit;
      text-decoration: none;
    }
    .card:hover {
      border-color: var(--accent);
    }
    .card[data-verdict='slow'] {
      border-inline-start-color: var(--ds-warning-text);
    }
    .card[data-verdict='flaky'],
    .card[data-verdict='offline'] {
      border-inline-start-color: var(--ds-error-text);
    }
    .value {
      font-size: 18px;
      font-weight: 700;
    }
    .value .muted {
      margin-inline-start: 6px;
      font-size: 14px;
      font-weight: 500;
    }
    .muted {
      color: var(--muted);
    }
    .small {
      font-size: 13px;
    }
  `,
})
export class ConnectionSummary {
  protected readonly meter = inject(ConnectionMeter);

  protected readonly hour = computed(() => {
    const history = this.meter.historySnapshot();
    const now = Date.now();
    const s = summarize(history, now - 60 * 60_000, now);
    return { requests: s.requests, failed: percent(s.failures, s.requests) };
  });
}
