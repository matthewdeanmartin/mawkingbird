import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConnectionMeter } from '../../platform/network/connection-meter';

/**
 * The typical reply time, as a quiet suffix on the More menu's Observability
 * row. The menu has no room for another row, and a number beside the link
 * that leads to the detail answers "is it slow?" without opening anything.
 *
 * Renders nothing until there is a measurement, so a fresh session never shows
 * a placeholder dash in the menu.
 */
@Component({
  selector: 'app-connection-speed',
  imports: [TranslocoPipe],
  template: `
    @if (offline()) {
      <span class="speed" data-verdict="offline">{{ 'shell.connection.offline' | transloco }}</span>
    } @else if (text(); as t) {
      <span class="speed" [attr.data-verdict]="verdict()">{{ t }}</span>
    }
  `,
  styles: `
    .speed {
      margin-inline-start: 6px;
      font-weight: 500;
      font-size: 13px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .speed[data-verdict='slow'] {
      color: var(--ds-warning-text);
    }
    .speed[data-verdict='flaky'],
    .speed[data-verdict='offline'] {
      color: var(--ds-error-text);
    }
  `,
})
export class ConnectionSpeed {
  private readonly meter = inject(ConnectionMeter);
  protected readonly verdict = this.meter.verdict;
  protected readonly offline = computed(() => this.verdict() === 'offline');
  protected readonly text = this.meter.typicalReply;
}
