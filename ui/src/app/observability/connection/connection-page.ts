import { Component, computed, inject, signal } from '@angular/core';
import { ReadingBack } from '../../shell/reading-back';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbPageHeader, MbSection } from '../../design-system/page-header/page-header';
import { MbStatGrid } from '../../design-system/stats/stats';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { medianBin } from '../../platform/network/connection-history';
import { CAN_PROBE, ConnectionMeter } from '../../platform/network/connection-meter';
import { DataSaver } from '../../platform/network/data-saver';
import { OfflineApp } from '../../platform/offline/offline-app';
import { ReadCache } from '../../platform/offline/read-cache';
import { VerdictReason } from '../../platform/network/connection-quality';
import {
  SPAN_COLUMNS,
  TimelineColumn,
  TimelineSpan,
  binLabel,
  percent,
  plainReport,
  summaries,
  throughputKbps,
  timeline,
} from './connection-view';

// i18n connection.title: Connection
// i18n connection.intro: How well your network is carrying Mawkingbird right now, and over the last day. Measured on this device from the app's own requests; nothing is sent anywhere.
// i18n connection.now: Right now
// i18n connection.verdict.unknown: Not enough activity to judge yet
// i18n connection.verdict.good: Working normally
// i18n connection.verdict.slow: Slow, but getting through
// i18n connection.verdict.flaky: Unstable: some requests never arrive
// i18n connection.verdict.offline: Offline
// i18n connection.reason.tooFewSamples: Use the app for a moment and this will fill in.
// i18n connection.reason.browserOffline: Your device reports that it has no network connection.
// i18n connection.reason.nothingGetsThrough: Your device says it is connected, but nothing has come back for a while.
// i18n connection.reason.manyFailures: A noticeable share of recent requests got no answer at all.
// i18n connection.reason.slowResponses: Replies are arriving, but slowly.
// i18n connection.reason.browserReportsSlow: Your browser estimates a very slow connection.
// i18n connection.reason.normal: Recent requests are getting quick answers.
// i18n connection.blame.server: Other sites are answering, so the problem looks like your server rather than your connection.
// i18n connection.testNow: Test now
// i18n connection.testing: Testing…
// i18n connection.copyReport: Copy report
// i18n connection.copied: Copied
// i18n connection.clear: Clear history
// i18n connection.stat.median: Typical reply
// i18n connection.stat.failed: No answer
// i18n connection.stat.requests: Recent requests
// i18n connection.stat.browserType: Browser estimate
// i18n connection.stat.saveData: Data saver
// i18n connection.stat.on: On
// i18n connection.stat.pictures: Pictures in new posts
// i18n connection.stat.picturesHeld: Held back until you press “Show them” on a post
// i18n connection.stat.picturesLoad: Shown normally
// i18n connection.lastProbe: Last test: {{result}} in {{ms}} ms
// i18n connection.probe.ok: reached
// i18n connection.probe.failed: no answer
// i18n connection.history: History
// i18n connection.spanLabel: Time span
// i18n connection.span.hour: Last hour
// i18n connection.span.day: Last 24 hours
// i18n connection.chartLabel: Requests over time, coloured by connection quality
// i18n connection.legend.good: Working
// i18n connection.legend.slow: Slow
// i18n connection.legend.flaky: Unstable
// i18n connection.legend.offline: Offline
// i18n connection.columnTitle: {{time}}: {{requests}} requests, {{failed}} with no answer, typical reply {{typical}}, {{verdict}}
// i18n connection.summary: Summary
// i18n connection.col.window: Period
// i18n connection.col.requests: Requests
// i18n connection.col.failed: No answer
// i18n connection.col.typical: Typical reply
// i18n connection.col.throughput: Speed
// i18n connection.col.offline: Time offline
// i18n connection.window.5m: Last 5 minutes
// i18n connection.window.15m: Last 15 minutes
// i18n connection.window.1h: Last hour
// i18n connection.window.24h: Last 24 hours
// i18n connection.offlineApp.title: Offline copy
// i18n connection.offlineApp.ready: Mawkingbird can open on this device without a connection. {{files}} app files are saved; screens you haven't opened yet still need a connection the first time.
// i18n connection.offlineApp.saving: Mawkingbird is saving the parts of the app you use, so it can open without a connection.
// i18n connection.offlineApp.removed: No offline copy is kept. Mawkingbird needs a connection to open.
// i18n connection.offlineApp.unsupported: This browser can't keep an offline copy of Mawkingbird.
// i18n connection.offlineApp.remove: Remove offline copy
// i18n connection.offlineApp.allow: Keep an offline copy
// i18n connection.savedReads: Saved for offline reading: {{size}} ({{entries}} saved pages). Feeds, threads and profiles you opened, for this browser only; up to 25 MB.
// i18n connection.openLite: Open Lite, for slow connections
// i18n connection.links: Related pages
// i18n connection.doctor: Which services does this network allow?

/** Reason codes are kebab-case; translation keys must be camelCase. */
const REASON_KEYS: Record<VerdictReason, string> = {
  'too-few-samples': 'connection.reason.tooFewSamples',
  'browser-offline': 'connection.reason.browserOffline',
  'nothing-gets-through': 'connection.reason.nothingGetsThrough',
  'many-failures': 'connection.reason.manyFailures',
  'slow-responses': 'connection.reason.slowResponses',
  'browser-reports-slow': 'connection.reason.browserReportsSlow',
  normal: 'connection.reason.normal',
};

const CHART_HEIGHT = 64;
const COLUMN_WIDTH = 6;

@Component({
  selector: 'app-connection-page',
  imports: [
    DecimalPipe,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbPageHeader,
    MbSection,
    MbStatGrid,
    MbToolbar,
    MbToolbarButton,
    ReadingBack,
  ],
  templateUrl: './connection-page.html',
  styleUrl: './connection-page.css',
})
export class ConnectionPage {
  protected readonly meter = inject(ConnectionMeter);
  protected readonly dataSaver = inject(DataSaver);
  protected readonly offlineApp = inject(OfflineApp);

  private readonly readCache = inject(ReadCache);
  protected readonly savedReads = signal<{ entries: number; size: string } | null>(null);

  constructor() {
    void this.offlineApp.refreshStats();
    void this.readCache
      .usage()
      .then(({ entries, bytes }) =>
        this.savedReads.set(
          entries ? { entries, size: `${(bytes / (1024 * 1024)).toFixed(1)} MB` } : null,
        ),
      );
  }

  protected async removeOfflineCopy(): Promise<void> {
    await this.offlineApp.remove();
  }

  protected async allowOfflineCopy(): Promise<void> {
    await this.offlineApp.allow();
    await this.offlineApp.refreshStats();
  }
  private readonly transloco = inject(TranslocoService);

  protected readonly canProbe = CAN_PROBE;
  protected readonly testing = signal(false);
  protected readonly copied = signal(false);
  protected readonly span = signal<TimelineSpan>('hour');
  protected readonly spans: readonly TimelineSpan[] = ['hour', 'day'];
  protected readonly chartHeight = CHART_HEIGHT;
  protected readonly columnWidth = COLUMN_WIDTH;

  protected readonly assessment = this.meter.assessment;
  protected readonly hints = this.meter.hints;
  protected readonly reasonKey = computed(() => REASON_KEYS[this.assessment().reason]);

  protected readonly columns = computed(() =>
    timeline(this.meter.historySnapshot(), this.span(), this.now()),
  );
  protected readonly chartWidth = computed(() => SPAN_COLUMNS[this.span()].count * COLUMN_WIDTH);
  private readonly peak = computed(() => Math.max(1, ...this.columns().map((c) => c.requests)));

  protected readonly rows = computed(() =>
    summaries(this.meter.historySnapshot(), this.now()).map(({ key, summary }) => {
      const kbps = throughputKbps(summary);
      return {
        key,
        requests: summary.requests,
        failed: percent(summary.failures, summary.requests),
        typical: binLabel(medianBin(summary.lat)),
        throughput: kbps === null ? '—' : `${kbps} kbit/s`,
        offline: formatDuration(summary.offlineMs),
      };
    }),
  );

  protected readonly medianText = computed(() => {
    const ms = this.assessment().medianMs;
    return ms === null ? '—' : `${Math.round(ms)} ms`;
  });
  protected readonly failedText = computed(() => {
    const share = this.assessment().failureShare;
    return share === null ? '—' : `${Math.round(share * 100)}%`;
  });
  protected readonly browserType = computed(() => {
    const h = this.hints();
    if (!h.effectiveType) return null;
    const parts = [h.effectiveType];
    if (h.downlinkMbps !== undefined) parts.push(`${h.downlinkMbps} Mbit/s`);
    if (h.rttMs !== undefined) parts.push(`${h.rttMs} ms`);
    return parts.join(' · ');
  });

  /** Read through the meter's history so the clock advances when samples do. */
  private now(): number {
    this.meter.historySnapshot();
    this.meter.assessment();
    return Date.now();
  }

  protected barHeight(column: TimelineColumn): number {
    if (column.requests === 0) return 0;
    return Math.max(2, Math.round(CHART_HEIGHT * Math.sqrt(column.requests / this.peak())));
  }

  protected columnTitle(column: TimelineColumn): string {
    const time = new Date(column.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return this.transloco.translate('connection.columnTitle', {
      time,
      requests: column.requests,
      failed: column.failures,
      typical: binLabel(column.medianBin),
      verdict: this.transloco.translate(`connection.legend.${legendKey(column)}`),
    });
  }

  protected async testNow(): Promise<void> {
    this.testing.set(true);
    try {
      await this.meter.probe();
    } finally {
      this.testing.set(false);
    }
  }

  protected async copyReport(): Promise<void> {
    const text = plainReport(
      this.assessment(),
      this.hints(),
      this.meter.historySnapshot(),
      Date.now(),
    );
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard refused (permissions, insecure context): nothing to undo.
    }
  }

  protected clear(): void {
    this.meter.clearHistory();
  }
}

function legendKey(column: TimelineColumn): 'good' | 'slow' | 'flaky' | 'offline' {
  return column.worst === 'unknown' ? 'good' : column.worst;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)} s`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
