export { binLabel } from '../../platform/network/connection-history';
import {
  ConnectionHistory,
  HISTORY_BUCKET_MS,
  HistorySummary,
  LATENCY_BIN_EDGES,
  binLabel,
  medianBin,
  offlineTime,
  summarize,
} from '../../platform/network/connection-history';
import {
  BrowserHints,
  ConnectionAssessment,
  ConnectionVerdict,
  VERDICT_RANK,
} from '../../platform/network/connection-quality';

/**
 * Pure shaping for the Connection page: timeline columns, window summaries and
 * the plain-text report. Kept apart from the component so it can be tested
 * without rendering, and so the page template stays a thin projection.
 */

export type TimelineSpan = 'hour' | 'day';

export interface TimelineColumn {
  /** Column start, epoch ms. */
  t: number;
  requests: number;
  failures: number;
  /** Worst verdict reached in the column; `unknown` when nothing was measured. */
  worst: ConnectionVerdict;
  /** Share of the column the browser reported being offline, 0..1. */
  offlineShare: number;
  /** Median latency bin of ordinary reads, or null. */
  medianBin: number | null;
}

export const SPAN_COLUMNS: Record<TimelineSpan, { count: number; width: number }> = {
  // One column per minute.
  hour: { count: 60, width: HISTORY_BUCKET_MS },
  // Fifteen minutes per column keeps a day readable at phone width.
  day: { count: 96, width: 15 * HISTORY_BUCKET_MS },
};

export function timeline(
  history: ConnectionHistory,
  span: TimelineSpan,
  now: number,
): TimelineColumn[] {
  const { count, width } = SPAN_COLUMNS[span];
  const end = Math.floor(now / width) * width + width;
  const start = end - count * width;
  const columns: TimelineColumn[] = [];
  for (let i = 0; i < count; i++) {
    const t = start + i * width;
    columns.push({
      t,
      requests: 0,
      failures: 0,
      worst: 'unknown',
      offlineShare: 0,
      medianBin: null,
    });
  }
  const lat = columns.map(() => new Array(LATENCY_BIN_EDGES.length + 1).fill(0) as number[]);
  for (const b of history.buckets) {
    const index = Math.floor((b.t - start) / width);
    if (index < 0 || index >= count) continue;
    const column = columns[index];
    column.requests += b.n;
    column.failures += b.fail;
    b.lat.forEach((n, bin) => (lat[index][bin] += n));
    if (VERDICT_RANK[b.worst] > VERDICT_RANK[column.worst]) column.worst = b.worst;
  }
  columns.forEach((column, index) => {
    column.medianBin = medianBin(lat[index]);
    const until = Math.min(column.t + width, now);
    if (until > column.t) {
      column.offlineShare = offlineTime(history.transitions, column.t, until) / (until - column.t);
    }
    if (column.offlineShare > 0.5 && column.worst !== 'offline') {
      column.worst = 'offline';
    }
  });
  return columns;
}

export const SUMMARY_WINDOWS: readonly { key: string; ms: number }[] = [
  { key: '5m', ms: 5 * 60_000 },
  { key: '15m', ms: 15 * 60_000 },
  { key: '1h', ms: 60 * 60_000 },
  { key: '24h', ms: 24 * 60 * 60_000 },
];

export function summaries(
  history: ConnectionHistory,
  now: number,
): { key: string; summary: HistorySummary }[] {
  return SUMMARY_WINDOWS.map(({ key, ms }) => ({
    key,
    summary: summarize(history, now - ms, now),
  }));
}

/** Average throughput, kbit/s, when response sizes were known; else null. */
export function throughputKbps(summary: HistorySummary): number | null {
  if (summary.bytes < 8_192 || summary.xferMs <= 0) return null;
  return Math.round((summary.bytes * 8) / summary.xferMs);
}

export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((100 * part) / whole)}%` : '—';
}

/**
 * A plain-text report for pasting into a bug report or a message. English and
 * unlocalized on purpose, like the fail whale's: it is read by whoever fixes
 * things, and it must not depend on which language the reader chose.
 */
export function plainReport(
  assessment: ConnectionAssessment,
  hints: BrowserHints,
  history: ConnectionHistory,
  now: number,
): string {
  const lines = [
    'Mawkingbird connection report',
    `Time:      ${new Date(now).toISOString()}`,
    `Verdict:   ${assessment.verdict} (${assessment.reason})`,
    `Blame:     ${assessment.blame ?? 'none'}`,
    `Window:    ${assessment.samples} requests, median ${
      assessment.medianMs === null ? '—' : `${Math.round(assessment.medianMs)} ms`
    }, failed ${
      assessment.failureShare === null ? '—' : `${Math.round(assessment.failureShare * 100)}%`
    }`,
    `Browser:   online=${hints.online}` +
      (hints.effectiveType ? ` type=${hints.effectiveType}` : '') +
      (hints.downlinkMbps !== undefined ? ` downlink=${hints.downlinkMbps}Mbps` : '') +
      (hints.rttMs !== undefined ? ` rtt=${hints.rttMs}ms` : '') +
      (hints.saveData ? ' save-data' : ''),
    '',
    'Window  requests  failed  typical     offline  worst',
  ];
  for (const { key, summary } of summaries(history, now)) {
    lines.push(
      [
        key.padEnd(6),
        String(summary.requests).padStart(8),
        percent(summary.failures, summary.requests).padStart(7),
        binLabel(medianBin(summary.lat)).padStart(11),
        `${Math.round(summary.offlineMs / 1000)}s`.padStart(8),
        summary.worst,
      ].join('  '),
    );
  }
  const recent = timeline(history, 'hour', now).filter((c) => c.requests > 0 || c.offlineShare > 0);
  if (recent.length) {
    lines.push('', 'Last hour, per minute (UTC): requests/failed typical worst');
    for (const c of recent.slice(-30)) {
      lines.push(
        `${new Date(c.t).toISOString().slice(11, 16)}  ${c.requests}/${c.failures}  ${binLabel(
          c.medianBin,
        )}  ${c.worst}${c.offlineShare > 0 ? ` offline ${Math.round(c.offlineShare * 100)}%` : ''}`,
      );
    }
  }
  return lines.join('\n');
}
