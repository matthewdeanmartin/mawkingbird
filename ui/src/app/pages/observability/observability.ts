import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ALL_SCOPES,
  ApiError,
  ApiMetrics,
  BUCKET_MS,
  ClientErrorGroup,
  DayBucket,
  EndpointStat,
  LatencyFamily,
  LatencyPoint,
  TimeBucket,
} from '../../observability/api-metrics';
import { EndpointDoc, endpointDoc } from '../../observability/api-docs';
import { CorsProxySettings } from '../../providers/cors-proxy/cors-proxy-settings';
import { CorsProxyUsageStore } from '../../providers/cors-proxy/cors-proxy-usage';
import { TwitterUsage } from '../../providers/twitter/twitter-usage';
import { RssSubscriptions } from '../../providers/rss/rss-subscriptions';
import {
  StorageReport,
  formatBytes,
  inspectLocalStorage,
} from '../../observability/local-storage-inspector';
import { RouteLog, RouteStat, formatDuration } from '../../observability/route-log';
import {
  MawkingbirdMetrics,
  MawkingbirdService,
  ServiceStat,
} from '../../observability/mawkingbird-metrics';
import { DiagnosticEntry, DiagnosticLog } from '../../diagnostic-log';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/** How the endpoint table is sorted. */
type SortKey = 'count' | 'avg' | 'max' | 'errors';

/** A point on the calls-over-time chart, laid out in SVG space. */
interface ChartPoint {
  x: number;
  y: number;
  yErr: number;
  bucket: TimeBucket;
}

const CHART_W = 720;
const CHART_H = 160;
const CHART_PAD = 4;
/** Heights of the two stacked charts. Latency is shorter; it is a trend, not a total. */
const VOLUME_H = 150;
const LATENCY_H = 130;
/**
 * Minimum bar slots on the volume chart. With fewer days than this, bars keep
 * their width and the chart is left-aligned rather than stretching three days
 * across an axis that would then imply three months.
 */
const MIN_VOLUME_SLOTS = 14;
/** Space a latency axis label needs above a gridline before it clips. */
const TICK_LABEL_MARGIN = 11;

/** One day's latency point, laid out in SVG space. */
interface LatencyPlot {
  point: LatencyPoint;
  x: number;
  /** Null when the day had too few samples to place a median. */
  y: number | null;
}

/** One family's drawn geometry. */
interface LatencySeries {
  name: LatencyFamily;
  /** Median polylines, split at gaps. */
  segments: string[];
  /** Filled p25–p95 band polygons, split at gaps. */
  band: string[];
  points: LatencyPlot[];
}

/**
 * Split a series into polyline strings, breaking wherever a day has no median.
 *
 * The break is the point. Joining across a quiet day would draw a confident
 * line through a period that was never measured, and the reader has no way to
 * tell that segment from a measured one.
 */
function segmentsOf(
  points: LatencyPoint[],
  x: (i: number) => number,
  y: (ms: number) => number,
): string[] {
  const out: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p.median === null) {
      if (run.length > 1) {
        out.push(run.join(' '));
      }
      run = [];
      return;
    }
    run.push(`${x(i).toFixed(1)},${y(p.median).toFixed(1)}`);
  });
  if (run.length > 1) {
    out.push(run.join(' '));
  }
  return out;
}

/**
 * The p25–p95 band as filled polygons, again split at gaps.
 *
 * A run of a single banded day yields no polygon: a band needs two points to
 * have a width, and a lone day's spread is shown by its tooltip instead.
 */
function bandOf(
  points: LatencyPoint[],
  x: (i: number) => number,
  y: (ms: number) => number,
): string[] {
  const out: string[] = [];
  let upper: string[] = [];
  let lower: string[] = [];
  const close = (): void => {
    if (upper.length > 1) {
      out.push([...upper, ...lower.reverse()].join(' '));
    }
    upper = [];
    lower = [];
  };
  points.forEach((p, i) => {
    if (p.p25 === null || p.p95 === null) {
      close();
      return;
    }
    upper.push(`${x(i).toFixed(1)},${y(p.p95).toFixed(1)}`);
    lower.push(`${x(i).toFixed(1)},${y(p.p25).toFixed(1)}`);
  });
  close();
  return out;
}

/** How the route table is sorted. */
type RouteSortKey = 'visits' | 'time';

/**
 * The Observability page — everything this browser knows about how the app is
 * behaving, and how it's being used:
 *
 *  - **API calls** — per-endpoint stats, a calls-over-time chart, and a link
 *    from every endpoint to its official documentation ({@link endpointDoc}).
 *  - **Recent errors** — the last failing API calls.
 *  - **Client errors** — JS exceptions grouped by kind, with counts.
 *  - **Local storage** — per-key sizes, with delete.
 *  - **IndexedDB** — databases, stores, record counts, and the origin's quota.
 *  - **Route log** — visits and time spent per route.
 *
 * Data comes from {@link ApiMetrics} and {@link RouteLog} (see those services
 * for the count-don't-store storage schemes) plus live storage scans. Nothing
 * on this page is sent anywhere.
 */
// i18n pages.observability.title: Observability
// i18n pages.observability.intro: API traffic and errors generated by all of your accounts, captured in this browser and grouped by server. Nothing on this page is sent anywhere.
// i18n pages.observability.scope.server: Server
// i18n pages.observability.scope.allServers: All servers
// i18n pages.observability.scope.combined.one: {{count}} server combined · currently signed in to {{server}}
// i18n pages.observability.scope.combined.other: {{count}} servers combined · currently signed in to {{server}}
// i18n pages.observability.storageDiagnostics: Storage Diagnostics →
// i18n pages.observability.api.title: API calls
// i18n pages.observability.api.reset: Reset metrics
// i18n pages.observability.stats.totalCalls: total calls
// i18n pages.observability.stats.endpoints: endpoints
// i18n pages.observability.stats.avgResponse: avg response
// i18n pages.observability.stats.errors: errors ({{percent}})
// i18n pages.observability.highlight.busiest: Busiest
// i18n pages.observability.highlight.calls.one: {{count}} call
// i18n pages.observability.highlight.calls.other: {{count}} calls
// i18n pages.observability.highlight.slowest: Slowest avg
// i18n pages.observability.highlight.fastest: Fastest avg
// i18n pages.observability.highlight.mostErrors: Most errors
// i18n pages.observability.chart.volume.one: Calls per day, over the last {{count}} day
// i18n pages.observability.chart.volume.other: Calls per day, over the last {{count}} days
// i18n pages.observability.chart.peak: · peak {{count}}
// i18n pages.observability.chart.callsPerDayAria: API calls per day
// i18n pages.observability.chart.noTraffic: No traffic recorded yet. Use the app and come back.
// i18n pages.observability.chart.responseCaption: Response time per day — median line, shaded p25–p95 band.
// i18n pages.observability.chart.normalCalls: normal calls
// i18n pages.observability.chart.searchMedia: search & media
// i18n pages.observability.chart.responseAria: API response time per day
// i18n pages.observability.chart.responseNote: Failed calls are excluded — a refused connection and a timeout are both “no answer”, and neither says how fast the API is. A day with fewer than 5 successful calls is left blank rather than drawn, and the band appears only once a day has 20; below that the spread would be an artefact of the sample size rather than a property of the API.
// i18n pages.observability.chart.notEnoughResponse: Not enough successful calls yet to chart response time. It needs at least five in a day.
// i18n pages.observability.table.endpoint: Endpoint
// i18n pages.observability.table.calls: Calls
// i18n pages.observability.table.avg: Avg
// i18n pages.observability.table.sd: ± SD
// i18n pages.observability.table.min: Min
// i18n pages.observability.table.max: Max
// i18n pages.observability.table.errors: Errors
// i18n pages.observability.table.last: Last
// i18n pages.observability.chart.unitMs: ms
// i18n pages.observability.chart.seconds: {{count}}s
// i18n pages.observability.chart.milliseconds: {{count}}ms
// i18n pages.observability.table.noCalls: No API calls recorded yet.
// i18n pages.observability.errors.title: Recent errors
// i18n pages.observability.errors.logged: {{count}} logged
// i18n pages.observability.errors.network: NET
// i18n pages.observability.errors.none: Nothing has gone wrong recently. 🎉
// i18n pages.observability.docs.documentationFor: Documentation for {{key}}
// i18n pages.observability.diagnostics.title: Recent diagnostics
// i18n pages.observability.diagnostics.retained: {{count}} retained in this tab
// i18n pages.observability.diagnostics.latest: · showing latest {{count}}
// i18n pages.observability.diagnostics.copy: Copy
// i18n pages.observability.diagnostics.download: Download
// i18n pages.observability.diagnostics.clear: Clear
// i18n pages.observability.diagnostics.note: User actions, workflow outcomes, warnings, and errors retained in sessionStorage for this tab. The oldest entries roll off at 1,000 entries or 1 MB. Values, visible labels, credentials, query strings, and external destinations are not captured. Nothing is sent automatically.
// i18n pages.observability.diagnostics.none: No diagnostics retained in this tab yet.
// i18n pages.observability.clientErrors.title: Client errors
// i18n pages.observability.clientErrors.occurrence.one: {{count}} occurrence
// i18n pages.observability.clientErrors.occurrence.other: {{count}} occurrences
// i18n pages.observability.clientErrors.kind.one: {{count}} kind
// i18n pages.observability.clientErrors.kind.other: {{count}} kinds
// i18n pages.observability.clientErrors.note: JavaScript errors from the app itself, grouped by type and message — counted rather than stored one by one, so a bug that fires a thousand times stays one row. Ids, numbers and URLs in the message are replaced with placeholders to make that grouping work.
// i18n pages.observability.clientErrors.error: Error
// i18n pages.observability.clientErrors.count: Count
// i18n pages.observability.clientErrors.first: First
// i18n pages.observability.clientErrors.last: Last
// i18n pages.observability.clientErrors.none: No client-side errors recorded. 🎉
// i18n pages.observability.cors.title: CORS proxy
// i18n pages.observability.cors.note: Requests this browser sent through a third-party CORS proxy, which can read every address it is given and every response it returns. Counts only — the addresses are deliberately not recorded here.
// i18n pages.observability.cors.requests: proxied requests
// i18n pages.observability.cors.failed: failed
// i18n pages.observability.cors.feeds: feeds set to use it
// i18n pages.observability.cors.reset: Reset counters
// i18n pages.observability.cors.none: Nothing has been sent through a CORS proxy.
// i18n pages.observability.twitter.title: Twitter data requests
// i18n pages.observability.twitter.billed: billed per request
// i18n pages.observability.twitter.note: Every request to the Twitter data service draws on credits you have paid for. Counts only — which accounts you looked up is deliberately not recorded here.
// i18n pages.observability.twitter.today: today
// i18n pages.observability.twitter.sinceConnecting: since connecting
// i18n pages.observability.twitter.remaining: left before the daily limit
// i18n pages.observability.twitter.limitReached: Today's limit of {{limit}} has been reached. It resets at midnight; the limit itself is on the
// i18n pages.observability.twitter.connector: Twitter connector page
// i18n pages.observability.mawkingbird.title: Mawkingbird services
// i18n pages.observability.mawkingbird.reset: Reset counters
// i18n pages.observability.mawkingbird.note: Calls to Mawkingbird's own services — signing in, syncing settings, and fetching feeds through the CORS proxy. Each call is counted against whichever tier paid for it at the time, so subscribing later does not relabel what came before. Counters only: no paths and no URLs are recorded.
// i18n pages.observability.mawkingbird.totalCalls: total calls
// i18n pages.observability.mawkingbird.paid: paid
// i18n pages.observability.mawkingbird.free: free
// i18n pages.observability.mawkingbird.errors: errors ({{percent}})
// i18n pages.observability.mawkingbird.service: Service
// i18n pages.observability.mawkingbird.tier: Tier
// i18n pages.observability.mawkingbird.calls: Calls
// i18n pages.observability.mawkingbird.avg: Avg
// i18n pages.observability.mawkingbird.errorsHeader: Errors
// i18n pages.observability.mawkingbird.last: Last
// i18n pages.observability.mawkingbird.none: No calls to Mawkingbird services yet. Signing in or turning on settings sync will start the count.
// i18n pages.observability.storage.title: Storage
// i18n pages.observability.storage.refresh: Refresh
// i18n pages.observability.storage.entries.one: across {{count}} key
// i18n pages.observability.storage.entries.other: across {{count}} keys
// i18n pages.observability.route.title: Route log
// i18n pages.observability.route.summary: {{visits}} visits · {{total}} total · {{routes}} routes
// i18n pages.observability.route.refresh: Refresh
// i18n pages.observability.route.reset: Reset
// i18n pages.observability.route.noteA: Where you spend your time in this app — your own analytics, kept in this browser and never sent anywhere. Paths are recorded as shapes (
// i18n pages.observability.route.noteB: ), so it counts that you opened profiles, not whose. Time doesn’t accrue while the tab is in the background.
// i18n pages.observability.route.route: Route
// i18n pages.observability.route.visits: Visits
// i18n pages.observability.route.time: Time
// i18n pages.observability.route.avg: Avg
// i18n pages.observability.route.last: Last
// i18n pages.observability.route.none: No navigations recorded yet.
// i18n pages.observability.route.lastVisited: Last visited {{time}}
// i18n pages.observability.confirm.mawkingbird: Clear the Mawkingbird call counters?
// i18n pages.observability.confirm.metrics: Clear all collected API metrics, the timeline, and both error logs for this server?
// i18n pages.observability.confirm.diagnostics: Clear the recent diagnostics retained for this tab?
// i18n pages.observability.confirm.routes: Clear the route log (visit counts and time spent)?
// i18n pages.observability.notice.copied: Copied diagnostics.
// i18n pages.observability.notice.clipboardFailed: Clipboard access failed. Use Download instead.
// i18n pages.observability.notice.downloaded: Downloaded diagnostics.
// i18n pages.observability.notice.downloadFailed: The download could not be created.
// i18n pages.observability.notice.cleared: Cleared diagnostics.
// i18n pages.observability.service.token: Token service
// i18n pages.observability.service.account: Account service
// i18n pages.observability.service.profile: Profile sync
// i18n pages.observability.service.proxy: CORS proxy
// i18n pages.observability.service.other: Other
// i18n pages.observability.docs.view: View documentation
// i18n pages.observability.docs.exact: {{summary}} — opens docs.joinmastodon.org
// i18n pages.observability.docs.approx: No exact match; opens the documentation section for this API family
// i18n pages.observability.errorDetail.network: Network failure (no response)
// i18n pages.observability.errorDetail.http: HTTP {{status}}
// i18n pages.observability.errorDetail.at: at {{time}}
// i18n pages.observability.clientErrors.detail.one: {{count}} occurrence ({{source}})
// i18n pages.observability.clientErrors.detail.other: {{count}} occurrences ({{source}})
// i18n pages.observability.clientErrors.detailFirst: first {{time}}
// i18n pages.observability.clientErrors.detailLast: last {{time}}
// i18n pages.observability.tooltip.calls.one: {{date}} · {{count}} call
// i18n pages.observability.tooltip.calls.other: {{date}} · {{count}} calls
// i18n pages.observability.tooltip.errors.one: · {{count}} error
// i18n pages.observability.tooltip.errors.other: · {{count}} errors
// i18n pages.observability.tooltip.latencyTooFew.one: {{date}} · {{family}} · {{count}} sample — too few to summarise
// i18n pages.observability.tooltip.latencyTooFew.other: {{date}} · {{family}} · {{count}} samples — too few to summarise
// i18n pages.observability.tooltip.latencyNoSpread: (no spread shown: {{count}} samples)
// i18n pages.observability.tooltip.latencyBand: · p25 {{p25}}ms · p95 {{p95}}ms
// i18n pages.observability.tooltip.latencySummary: {{date}} · {{family}} · median {{median}}ms{{band}} · n={{count}}
// i18n pages.observability.tooltip.family.fast: normal calls
// i18n pages.observability.tooltip.family.slow: search & media
// i18n pages.observability.tooltip.bucket.one: {{time}} · {{count}} call
// i18n pages.observability.tooltip.bucket.other: {{time}} · {{count}} calls
// i18n pages.observability.tooltip.bucketErrors: · {{count}} err
@Component({
  selector: 'app-observability',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './observability.html',
  styleUrls: ['./diagnostics-shared.css', './observability.css'],
})
export class Observability {
  private transloco = inject(TranslocoService);
  private metrics = inject(ApiMetrics);
  private routeLog = inject(RouteLog);
  private proxyUsageStore = inject(CorsProxyUsageStore);
  /** Twitter spend, for the section that exists because these requests cost money. */
  protected twitterUsage = inject(TwitterUsage);
  private proxySettings = inject(CorsProxySettings);
  private rssSubs = inject(RssSubscriptions);
  private diagnosticLog = inject(DiagnosticLog);

  protected readonly totals = this.metrics.totals;
  protected readonly errors = this.metrics.errors;
  protected readonly clientErrors = this.metrics.clientErrors;
  protected readonly clientErrorTotals = this.metrics.clientErrorTotals;
  protected readonly serverLabel = this.metrics.serverLabel;
  protected readonly formatBytes = formatBytes;
  protected readonly formatDuration = formatDuration;
  protected readonly diagnostics = this.diagnosticLog.entries;
  protected readonly diagnosticNotice = signal<string | null>(null);
  protected readonly diagnosticRows = computed(() => this.diagnostics().slice(-100).reverse());

  protected readonly proxyUsage = this.proxyUsageStore.usage;
  protected readonly proxyLabel = computed(() => this.proxySettings.chosen()?.label ?? null);
  protected readonly proxiedFeedCount = computed(() => this.rssSubs.proxiedCount());

  // ------------------------------------------------------------- Mawkingbird

  private mawkingbirdMetrics = inject(MawkingbirdMetrics);

  protected readonly mawkingbirdTotals = this.mawkingbirdMetrics.totals;
  protected readonly mawkingbirdRows = this.mawkingbirdMetrics.rows;

  /** Mean response time for a Mawkingbird row (ms). */
  protected mawkingbirdMean(s: ServiceStat): number {
    return MawkingbirdMetrics.mean(s);
  }

  /** How the service is named in the table. */
  protected serviceLabel(service: MawkingbirdService): string {
    const key = (() => {
      switch (service) {
        case 'auth':
          return 'pages.observability.service.token';
        case 'account':
          return 'pages.observability.service.account';
        case 'profile':
          return 'pages.observability.service.profile';
        case 'proxy':
          return 'pages.observability.service.proxy';
        default:
          return 'pages.observability.service.other';
      }
    })();
    return this.transloco.translate(key);
  }

  resetMawkingbird(): void {
    if (!confirm(this.transloco.translate('pages.observability.confirm.mawkingbird'))) {
      return;
    }
    this.mawkingbirdMetrics.reset();
    this.refreshStorage();
  }

  // ----------------------------------------------------------- server picker

  protected readonly allScopes = ALL_SCOPES;
  protected readonly scopes = this.metrics.scopes;
  protected readonly scope = this.metrics.scope;

  /** True when the view is merged across every server. */
  protected readonly merged = computed(() => this.scope() === ALL_SCOPES);

  selectScope(value: string): void {
    this.metrics.selectScope(value);
  }

  onScopeChange(event: Event): void {
    this.selectScope((event.target as HTMLSelectElement).value);
  }

  /** A server origin without its scheme, for a label that fits a dropdown. */
  protected scopeLabel(scope: string): string {
    return scope.replace(/^https?:\/\//, '');
  }

  resetProxyUsage(): void {
    this.proxyUsageStore.reset();
  }

  constructor() {
    // Bank the time spent getting here, so this page's own row isn't stale.
    this.routeLog.refresh();
  }

  protected readonly sortKey = signal<SortKey>('count');

  /** The endpoint stat rows, sorted by the chosen column. */
  protected readonly rows = computed<EndpointStat[]>(() => {
    const key = this.sortKey();
    const stats = [...this.metrics.stats()];
    const value = (s: EndpointStat): number => {
      switch (key) {
        case 'avg':
          return ApiMetrics.mean(s);
        case 'max':
          return s.maxMs;
        case 'errors':
          return s.errors;
        default:
          return s.count;
      }
    };
    return stats.sort((a, b) => value(b) - value(a));
  });

  /** The single busiest / slowest / most-error-prone endpoints, for the tiles. */
  protected readonly highlights = computed(() => {
    const stats = this.metrics.stats();
    if (!stats.length) {
      return null;
    }
    const busiest = stats.reduce((a, b) => (b.count > a.count ? b : a));
    const slowest = stats.reduce((a, b) => (ApiMetrics.mean(b) > ApiMetrics.mean(a) ? b : a));
    const fastest = stats.reduce((a, b) => (ApiMetrics.mean(b) < ApiMetrics.mean(a) ? b : a));
    const worst = stats.reduce((a, b) => (this.rate(b) > this.rate(a) ? b : a));
    return { busiest, slowest, fastest, worst };
  });

  private rate(s: EndpointStat): number {
    return s.count ? s.errors / s.count : 0;
  }

  // ---------------------------------------------------------------- helpers

  protected mean(s: EndpointStat): number {
    return ApiMetrics.mean(s);
  }

  protected stddev(s: EndpointStat): number {
    return ApiMetrics.stddev(s);
  }

  protected round(n: number): number {
    return Math.round(n);
  }

  protected pct(n: number): string {
    return `${(n * 100).toFixed(1)}%`;
  }

  protected method(key: string): string {
    return key.split(' ', 1)[0];
  }

  protected endpoint(key: string): string {
    return key.slice(this.method(key).length + 1);
  }

  protected time(at: number): string {
    return new Date(at).toLocaleTimeString();
  }

  protected when(at: number): string {
    return new Date(at).toLocaleString();
  }

  /**
   * Compact date + time for a table column ("Jul 30, 7:37 AM"). The full
   * timestamp is still in the row's tooltip; the column just has to fit.
   */
  protected stamp(at: number): string {
    return new Date(at).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  // -------------------------------------------------------------- docs links

  /**
   * The documentation link for an endpoint key, or null if it isn't a Mastodon
   * endpoint. Memoized because the table re-renders on every sort and every
   * recorded call, and a miss walks the whole shape bucket.
   */
  private readonly docCache = new Map<string, EndpointDoc | null>();

  protected doc(key: string): EndpointDoc | null {
    const cached = this.docCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const found = endpointDoc(key);
    this.docCache.set(key, found);
    return found;
  }

  /** Tooltip for the docs link: what the call does, and how sure we are. */
  protected docTitle(key: string): string {
    const d = this.doc(key);
    if (!d) {
      return '';
    }
    return d.match === 'exact'
      ? this.transloco.translate('pages.observability.docs.exact', {
          summary: d.summary || this.transloco.translate('pages.observability.docs.view'),
        })
      : this.transloco.translate('pages.observability.docs.approx');
  }

  // ----------------------------------------------------------- client errors

  /** Full detail for a client-error row's hover tooltip. */
  protected clientErrorDetail(g: ClientErrorGroup): string {
    const occurrenceKey =
      g.count === 1
        ? 'pages.observability.clientErrors.detail.one'
        : 'pages.observability.clientErrors.detail.other';
    return [
      `${g.type}: ${g.message}`,
      g.where ? g.where : null,
      this.transloco.translate(occurrenceKey, { count: g.count, source: g.source }),
      this.transloco.translate('pages.observability.clientErrors.detailFirst', {
        time: this.when(g.firstAt),
      }),
      this.transloco.translate('pages.observability.clientErrors.detailLast', {
        time: this.when(g.lastAt),
      }),
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  // ------------------------------------------------------ recent diagnostics

  protected diagnosticDetail(entry: DiagnosticEntry): string {
    return [
      `${entry.level.toUpperCase()} [${entry.area}] ${entry.event}`,
      entry.details,
      new Date(entry.at).toLocaleString(),
    ]
      .filter(Boolean)
      .join('\n');
  }

  protected async copyDiagnostics(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.diagnosticLog.toText());
      this.showDiagnosticNotice(this.transloco.translate('pages.observability.notice.copied'));
    } catch (error: unknown) {
      this.diagnosticLog.write('error', 'Mockingbird Observability', 'diagnostics:copy-failed', {
        error,
      });
      this.showDiagnosticNotice(
        this.transloco.translate('pages.observability.notice.clipboardFailed'),
      );
    }
  }

  protected downloadDiagnostics(): void {
    try {
      const blob = new Blob([this.diagnosticLog.toText()], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `mockingbird-diagnostics-${stamp}.log`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      this.showDiagnosticNotice(this.transloco.translate('pages.observability.notice.downloaded'));
    } catch (error: unknown) {
      this.diagnosticLog.write(
        'error',
        'Mockingbird Observability',
        'diagnostics:download-failed',
        {
          error,
        },
      );
      this.showDiagnosticNotice(
        this.transloco.translate('pages.observability.notice.downloadFailed'),
      );
    }
  }

  protected clearDiagnostics(): void {
    if (!confirm(this.transloco.translate('pages.observability.confirm.diagnostics'))) {
      return;
    }
    this.diagnosticLog.clear();
    this.showDiagnosticNotice(this.transloco.translate('pages.observability.notice.cleared'));
  }

  private showDiagnosticNotice(message: string): void {
    this.diagnosticNotice.set(message);
    setTimeout(() => this.diagnosticNotice.set(null), 3_000);
  }

  // --------------------------------------------------------------- route log

  protected readonly routeTotals = this.routeLog.totals;
  protected readonly routeSortKey = signal<RouteSortKey>('visits');

  protected readonly routeRows = computed<RouteStat[]>(() => {
    const key = this.routeSortKey();
    const stats = [...this.routeLog.stats()];
    return stats.sort((a, b) => (key === 'time' ? b.totalMs - a.totalMs : b.visits - a.visits));
  });

  setRouteSort(key: RouteSortKey): void {
    this.routeSortKey.set(key);
  }

  /** Average time per visit — the "is this a glance or a session" number. */
  protected avgDwell(s: RouteStat): number {
    return s.visits ? s.totalMs / s.visits : 0;
  }

  refreshRoutes(): void {
    this.routeLog.refresh();
  }

  resetRoutes(): void {
    if (!confirm(this.transloco.translate('pages.observability.confirm.routes'))) {
      return;
    }
    this.routeLog.reset();
    this.refreshStorage();
  }

  /** Full, multi-line error detail for the row's hover tooltip. */
  protected errorDetail(e: ApiError): string {
    const status =
      e.status === 0
        ? this.transloco.translate('pages.observability.errorDetail.network')
        : this.transloco.translate('pages.observability.errorDetail.http', { status: e.status });
    return [
      `${e.method} ${e.endpoint}`,
      status,
      e.message,
      this.transloco.translate('pages.observability.errorDetail.at', {
        time: new Date(e.at).toLocaleString(),
      }),
    ].join('\n');
  }

  setSort(key: SortKey): void {
    this.sortKey.set(key);
  }

  // ----------------------------------------------------- volume + latency charts

  protected readonly volumeH = VOLUME_H;
  protected readonly latencyH = LATENCY_H;

  /**
   * The daily volume chart: one bar per day, errors stacked on top.
   *
   * Bars rather than the old line, because the quantity is a *count over an
   * interval* and a line between two daily totals implies intermediate values
   * that were never measured. The previous chart drew a line across one-minute
   * buckets, which is why it looked like noise: it was noise, faithfully
   * rendered.
   */
  protected readonly volumeChart = computed(() => {
    const days = this.metrics.daily();
    if (!days.length) {
      return null;
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    const innerW = CHART_W - CHART_PAD * 2;
    const innerH = VOLUME_H - CHART_PAD * 2;
    // Bars are laid out on a fixed slot width so a 3-day history reads as three
    // bars near the left, not three columns stretched across the whole box —
    // stretching would imply the axis covers a span it does not.
    const slot = innerW / Math.max(days.length, MIN_VOLUME_SLOTS);
    const barW = Math.max(1, slot * 0.7);
    const bars = days.map((d, i) => {
      const h = (d.count / max) * innerH;
      const errH = (d.errors / max) * innerH;
      return {
        day: d,
        x: CHART_PAD + i * slot + (slot - barW) / 2,
        w: barW,
        // Errors sit at the top of the bar, so the total height stays the total.
        y: CHART_PAD + innerH - h,
        h: Math.max(d.count ? 1 : 0, h),
        errY: CHART_PAD + innerH - h,
        errH,
      };
    });
    return { bars, max, baseline: CHART_PAD + innerH };
  });

  /**
   * The latency chart: median line plus a p25–p95 band, one series per family.
   *
   * Both families share a y-axis so they are honestly comparable, and the axis
   * is logarithmic — a linear axis with search at 900 ms and a timeline read at
   * 8 ms flattens the fast series onto the floor, which is exactly the series
   * most calls belong to.
   */
  protected readonly latencyChart = computed(() => {
    const fast = this.metrics.latencySeries('fast');
    const slow = this.metrics.latencySeries('slow');
    const all = [...fast, ...slow];
    const values = all.flatMap((p) =>
      [p.median, p.p25, p.p95].filter((v): v is number => v !== null),
    );
    if (values.length < 2) {
      return null;
    }
    const lo = Math.max(1, Math.min(...values));
    const hi = Math.max(...values, lo * 2);
    const innerW = CHART_W - CHART_PAD * 2;
    const innerH = LATENCY_H - CHART_PAD * 2;
    const span = Math.max(1, all.length ? fast.length - 1 : 1);
    const logLo = Math.log(lo);
    const logHi = Math.log(hi);
    const y = (ms: number): number =>
      CHART_PAD + innerH - ((Math.log(Math.max(1, ms)) - logLo) / (logHi - logLo)) * innerH;
    const x = (i: number): number => CHART_PAD + (span === 0 ? 0 : i / span) * innerW;

    const series = (points: LatencyPoint[], name: LatencyFamily): LatencySeries => ({
      name,
      // Segments, not one polyline: a day below the sample floor is a gap, and
      // a polyline would bridge it with a straight line that asserts continuity
      // the data does not have.
      segments: segmentsOf(points, x, y),
      band: bandOf(points, x, y),
      points: points.map((p, i) => ({
        point: p,
        x: x(i),
        y: p.median === null ? null : y(p.median),
      })),
    });
    return { fast: series(fast, 'fast'), slow: series(slow, 'slow'), lo, hi };
  });

  /** Axis ticks for the latency chart, at readable round magnitudes. */
  protected readonly latencyTicks = computed(() => {
    const c = this.latencyChart();
    if (!c) {
      return [];
    }
    const innerH = LATENCY_H - CHART_PAD * 2;
    const logLo = Math.log(c.lo);
    const logHi = Math.log(c.hi);
    return [1, 10, 100, 1_000, 10_000]
      .filter((ms) => ms >= c.lo && ms <= c.hi)
      .map((ms) => {
        const y = CHART_PAD + innerH - ((Math.log(ms) - logLo) / (logHi - logLo)) * innerH;
        return {
          ms,
          label:
            ms >= 1_000
              ? this.transloco.translate('pages.observability.chart.seconds', { count: ms / 1_000 })
              : this.transloco.translate('pages.observability.chart.milliseconds', { count: ms }),
          y,
          // The label sits above its gridline, except near the top of the box
          // where that would clip it against the border — there it drops below.
          labelY: y < TICK_LABEL_MARGIN ? y + TICK_LABEL_MARGIN : y - 3,
        };
      });
  });

  /** Day label for an axis or tooltip ("Aug 18"). */
  protected dayLabel(t: number): string {
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** Tooltip text for a volume bar. */
  protected volumeLabel(d: DayBucket): string {
    const callKey =
      d.count === 1
        ? 'pages.observability.tooltip.calls.one'
        : 'pages.observability.tooltip.calls.other';
    const label = this.transloco.translate(callKey, {
      date: this.dayLabel(d.t),
      count: d.count.toLocaleString(),
    });
    if (!d.errors) {
      return label;
    }
    const errorKey =
      d.errors === 1
        ? 'pages.observability.tooltip.errors.one'
        : 'pages.observability.tooltip.errors.other';
    return `${label} ${this.transloco.translate(errorKey, { count: d.errors })}`;
  }

  /** Tooltip text for a latency point, including why a band may be missing. */
  protected latencyLabel(p: LatencyPoint, family: LatencyFamily): string {
    const familyLabel = this.transloco.translate(`pages.observability.tooltip.family.${family}`);
    if (p.median === null) {
      return this.transloco.translate(
        p.n === 1
          ? 'pages.observability.tooltip.latencyTooFew.one'
          : 'pages.observability.tooltip.latencyTooFew.other',
        { date: this.dayLabel(p.t), family: familyLabel, count: p.n },
      );
    }
    const band =
      p.p25 === null
        ? this.transloco.translate('pages.observability.tooltip.latencyNoSpread', { count: p.n })
        : this.transloco.translate('pages.observability.tooltip.latencyBand', {
            p25: this.round(p.p25),
            p95: this.round(p.p95!),
          });
    return this.transloco.translate('pages.observability.tooltip.latencySummary', {
      date: this.dayLabel(p.t),
      family: familyLabel,
      median: this.round(p.median),
      band,
      count: p.n,
    });
  }

  // ------------------------------------------------------------ calls chart

  protected readonly chartW = CHART_W;
  protected readonly chartH = CHART_H;

  /** Chart geometry: one point per time bucket, scaled into the SVG box. */
  protected readonly chart = computed(() => {
    const buckets = this.metrics.timeline();
    if (buckets.length < 2) {
      return null;
    }
    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    const innerW = CHART_W - CHART_PAD * 2;
    const innerH = CHART_H - CHART_PAD * 2;
    const span = buckets.length - 1;
    const points: ChartPoint[] = buckets.map((b, i) => ({
      x: CHART_PAD + (i / span) * innerW,
      y: CHART_PAD + innerH - (b.count / maxCount) * innerH,
      yErr: CHART_PAD + innerH - (b.errors / maxCount) * innerH,
      bucket: b,
    }));
    const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${CHART_PAD},${CHART_PAD + innerH} ${line} ${(CHART_PAD + innerW).toFixed(1)},${(
      CHART_PAD + innerH
    ).toFixed(1)}`;
    const anyErrors = buckets.some((b) => b.errors > 0);
    const errLine = anyErrors
      ? points.map((p) => `${p.x.toFixed(1)},${p.yErr.toFixed(1)}`).join(' ')
      : null;
    return { points, line, area, errLine, maxCount };
  });

  /** The bucket the pointer is hovering, for the chart tooltip. */
  protected readonly hover = signal<ChartPoint | null>(null);

  onChartMove(event: MouseEvent, svg: Element): void {
    const c = this.chart();
    if (!c) {
      return;
    }
    const rect = svg.getBoundingClientRect();
    // Map the pointer's client x into SVG viewBox x, then to the nearest point.
    const svgX = ((event.clientX - rect.left) / rect.width) * CHART_W;
    let nearest = c.points[0];
    for (const p of c.points) {
      if (Math.abs(p.x - svgX) < Math.abs(nearest.x - svgX)) {
        nearest = p;
      }
    }
    this.hover.set(nearest);
  }

  onChartLeave(): void {
    this.hover.set(null);
  }

  bucketLabel(b: TimeBucket): string {
    const d = new Date(b.t);
    const label = this.transloco.translate(
      b.count === 1
        ? 'pages.observability.tooltip.bucket.one'
        : 'pages.observability.tooltip.bucket.other',
      { time: d.toLocaleTimeString(), count: b.count },
    );
    return b.errors
      ? `${label} ${this.transloco.translate('pages.observability.tooltip.bucketErrors', {
          count: b.errors,
        })}`
      : label;
  }

  protected readonly bucketMinutes = BUCKET_MS / 60_000;

  // ---------------------------------------------------- localStorage inspector

  protected readonly storage = signal<StorageReport>(inspectLocalStorage());

  refreshStorage(): void {
    this.storage.set(inspectLocalStorage());
  }

  // ------------------------------------------------------------------- reset

  resetMetrics(): void {
    if (!confirm(this.transloco.translate('pages.observability.confirm.metrics'))) {
      return;
    }
    this.metrics.reset();
    this.refreshStorage();
  }
}
