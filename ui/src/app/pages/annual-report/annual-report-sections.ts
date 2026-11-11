import { Account, Status } from '../../models';

/**
 * Shape a server annual report for display.
 *
 * Mastodon's report `data` has changed between schema versions (and Phanpy
 * renders it generically for that reason). This does the same, with a few
 * readable touches: month numbers become month names, `account_id` columns
 * become the referenced accounts, and `top_statuses` become the posts
 * themselves. Unknown keys still render, as tables or key/value pairs.
 */

export type ReportCell =
  | { kind: 'text'; text: string; numeric?: boolean }
  | { kind: 'account'; account: Account }
  | { kind: 'missing-account' };

export type ReportSection =
  | { kind: 'text'; key: string; label: string; text: string }
  | { kind: 'table'; key: string; label: string; columns: string[]; rows: ReportCell[][] }
  | { kind: 'pairs'; key: string; label: string; rows: { label: string; value: string }[] }
  | { kind: 'statuses'; key: string; label: string; items: { label: string; status: Status }[] };

/** `top_hashtags` → "Top hashtags"; `byReblogs` → "By reblogs". */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/[_-]+/gu, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function monthName(month: number, locale?: string): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return String(month);
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString(locale, {
    month: 'long',
    timeZone: 'UTC',
  });
}

function formatNumber(value: number, locale?: string): string {
  return value.toLocaleString(locale);
}

function scalar(value: unknown, locale?: string): string {
  if (typeof value === 'number') return formatNumber(value, locale);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? '✓' : '—';
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
}

const isAccountKey = (key: string) => /^account_?id$/iu.test(key);
const isStatusMap = (key: string) => /^top_?statuses$/iu.test(key);

export function reportSections(
  data: Record<string, unknown> | null | undefined,
  accounts: readonly Account[],
  statuses: readonly Status[],
  locale?: string,
): ReportSection[] {
  if (!data) return [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const sections: ReportSection[] = [];
  for (const [key, value] of Object.entries(data)) {
    const label = humanize(key);
    if (value === null || value === undefined) continue;
    if (typeof value !== 'object') {
      sections.push({
        kind: 'text',
        key,
        label,
        text: typeof value === 'string' ? humanize(value) : scalar(value, locale),
      });
      continue;
    }
    if (Array.isArray(value)) {
      const rows = value.filter(
        (row): row is Record<string, unknown> => !!row && typeof row === 'object',
      );
      if (!rows.length) continue;
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      sections.push({
        kind: 'table',
        key,
        label,
        columns: columns.map((c) => (isAccountKey(c) ? 'Account' : humanize(c))),
        rows: rows.map((row) =>
          columns.map((column): ReportCell => {
            const cell = row[column];
            if (isAccountKey(column)) {
              const account = accountById.get(String(cell));
              return account ? { kind: 'account', account } : { kind: 'missing-account' };
            }
            if (column === 'month' && typeof cell === 'number') {
              return { kind: 'text', text: monthName(cell, locale) };
            }
            return { kind: 'text', text: scalar(cell, locale), numeric: typeof cell === 'number' };
          }),
        ),
      });
      continue;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (isStatusMap(key)) {
      const items = entries
        .map(([k, id]) => ({ label: humanize(k), status: statusById.get(String(id)) }))
        .filter((item): item is { label: string; status: Status } => !!item.status);
      if (items.length) sections.push({ kind: 'statuses', key, label, items });
      continue;
    }
    sections.push({
      kind: 'pairs',
      key,
      label,
      rows: entries.map(([k, v]) => ({ label: humanize(k), value: scalar(v, locale) })),
    });
  }
  return sections;
}
