import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConnectionMeter } from '../../platform/network/connection-meter';

// i18n shell.connection.slow: Slow connection
// i18n shell.connection.flaky: Unstable connection
// i18n shell.connection.offline: Offline

/**
 * A quiet header chip that exists only while the connection is bad. A good or
 * not-yet-measured connection shows nothing: the chip is a warning, and a
 * permanent "signal bars" indicator would train people to ignore it.
 */
@Component({
  selector: 'app-connection-chip',
  imports: [RouterLink, TranslocoPipe],
  template: `
    @if (state(); as s) {
      <a class="connection-chip" routerLink="/connection" [attr.data-verdict]="s">
        <span class="dot" aria-hidden="true"></span>
        <span class="text">{{ 'shell.connection.' + s | transloco }}</span>
      </a>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: contents;
    }
    .connection-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      /* Opaque and above its neighbours: in a crowded header it may sit over
         another icon, and must stay readable rather than blend into it. */
      position: relative;
      z-index: 1;
      background: var(--col-bg);
      font-size: 13px;
      line-height: 1.6;
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
    }
    .connection-chip:hover {
      background: color-mix(in srgb, var(--text) 6%, var(--col-bg));
    }
    .dot {
      inline-size: 8px;
      block-size: 8px;
      border-radius: 50%;
      background: var(--ds-warning-text);
    }
    [data-verdict='flaky'] .dot {
      background: color-mix(in srgb, var(--ds-warning-text) 45%, var(--ds-error-text));
    }
    [data-verdict='offline'] .dot {
      background: var(--ds-error-text);
    }
    @media (max-width: 480px) {
      /* Narrow headers keep the dot; the words stay for screen readers. */
      .text {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .connection-chip {
        padding: 6px;
      }
    }
  `,
})
export class ConnectionChip {
  private readonly meter = inject(ConnectionMeter);

  protected readonly state = computed(() => {
    const verdict = this.meter.verdict();
    return verdict === 'slow' || verdict === 'flaky' || verdict === 'offline' ? verdict : null;
  });
}
