import { Injectable, signal } from '@angular/core';

/** Severity used by the browser console and the in-app diagnostic timeline. */
export type DiagnosticLevel = 'info' | 'warn' | 'error';

/** One privacy-scrubbed diagnostic entry retained for the lifetime of this tab. */
export interface DiagnosticEntry {
  /** Wall-clock time, so entries retained through a reload still make sense. */
  at: number;
  level: DiagnosticLevel;
  /** Console label without brackets, for example `Mockingbird Search`. */
  area: string;
  event: string;
  /** Compact JSON (or a short scalar) after redaction and size limiting. */
  details: string;
}

interface StoredDiagnostics {
  v: 1;
  entries: DiagnosticEntry[];
}

const STORAGE_KEY = 'mockingbird_diagnostic_log';
const MAX_ENTRIES = 1_000;
/** Keep the sessionStorage payload comfortably below common per-origin quotas. */
const MAX_SERIALIZED_LENGTH = 1_000_000;
const MAX_DETAILS_LENGTH = 2_000;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 4;
const FLUSH_DEBOUNCE_MS = 250;
const SECRET_KEY = /authorization|cookie|credential|password|secret|token|api.?key/i;

/** Values that can be safely serialized into the retained log. */
type SafeValue = boolean | number | string | null | SafeValue[] | SafeObject;

/** Interface indirection permits a recursive JSON object without an unsafe `any`. */
declare const safeObjectBrand: unique symbol;
interface SafeObject extends Record<string, SafeValue> {
  readonly [safeObjectBrand]?: never;
}

/** Remove credentials, query strings, and fragments while retaining a useful endpoint. */
function scrubUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) {
      return value;
    }
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function scrubString(value: string): string {
  const withoutBearer = value.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]');
  const scrubbed = withoutBearer.replace(/https?:\/\/[^\s)\]}]+/gi, (url) => scrubUrl(url));
  return scrubbed.slice(0, MAX_STRING_LENGTH);
}

function safeValue(value: unknown, seen: WeakSet<object>, depth: number): SafeValue {
  if (value === null || value === undefined) {
    return value === null ? null : '[undefined]';
  }
  if (typeof value === 'string') {
    return scrubString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    return scrubString(String(value));
  }
  if (value instanceof Error) {
    const error: Record<string, SafeValue> = {
      name: scrubString(value.name),
      message: scrubString(value.message),
    };
    const status = (value as Error & { status?: unknown }).status;
    if (typeof status === 'number') {
      error['status'] = status;
    }
    const url = (value as Error & { url?: unknown }).url;
    if (typeof url === 'string') {
      error['url'] = scrubUrl(url);
    }
    if (value.stack) {
      error['stack'] = scrubString(value.stack.split('\n').slice(0, 4).join('\n'));
    }
    return error;
  }
  if (depth >= MAX_DEPTH) {
    return '[truncated]';
  }
  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => safeValue(item, seen, depth + 1));
  }
  const output: Record<string, SafeValue> = {};
  for (const [key, child] of Object.entries(value).slice(0, 40)) {
    // Presence flags such as `tokenPresent: true` describe state without exposing
    // the credential itself and are useful when diagnosing signed-in flows.
    output[key] =
      SECRET_KEY.test(key) && typeof child !== 'boolean'
        ? '[redacted]'
        : safeValue(child, seen, depth + 1);
  }
  return output;
}

/** Serialize details without retaining credentials, response bodies, or giant objects. */
export function safeDiagnosticDetails(details: unknown): string {
  try {
    const safe = safeDiagnosticValue(details);
    const text = typeof safe === 'string' ? safe : JSON.stringify(safe);
    return text.slice(0, MAX_DETAILS_LENGTH);
  } catch {
    return '[unserializable details]';
  }
}

/** Privacy-safe object form used for console output as well as retained text. */
export function safeDiagnosticValue(details: unknown): SafeValue {
  return safeValue(details, new WeakSet<object>(), 0);
}

/** A single pasteable line, shared by Observability downloads and bug reports. */
export function formatDiagnosticEntry(entry: DiagnosticEntry): string {
  const stamp = new Date(entry.at).toISOString();
  const suffix = entry.details && entry.details !== '{}' ? ` ${entry.details}` : '';
  return `${stamp} ${entry.level.toUpperCase()} [${entry.area}] ${entry.event}${suffix}`;
}

/**
 * Bounded, privacy-scrubbed diagnostic timeline for this browser tab.
 *
 * Entries are mirrored to the existing production-visible console format and
 * retained in sessionStorage, so a reload after a failure does not erase the
 * evidence. The log never leaves the browser automatically and disappears when
 * the tab's session ends. Oldest entries roll off by both count and byte budget.
 */
@Injectable({ providedIn: 'root' })
export class DiagnosticLog {
  private readonly buffer = signal<DiagnosticEntry[]>(this.load());
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly throttles = new Map<string, { at: number; suppressed: number }>();

  readonly entries = this.buffer.asReadonly();

  write(
    level: DiagnosticLevel,
    area: string,
    event: string,
    details: unknown = {},
    consoleDetails: unknown = details,
  ): void {
    const entry: DiagnosticEntry = {
      at: Date.now(),
      level,
      area,
      event,
      details: safeDiagnosticDetails(details),
    };
    this.buffer.update((all) => this.trim([...all, entry]));
    if (level === 'info') {
      this.schedulePersist();
    } else {
      this.persist();
    }
    console[level](`[${area}] ${event}`, safeDiagnosticValue(consoleDetails));
  }

  /**
   * Write the first occurrence in a window and summarize repeats on the next.
   * Useful for polling and retry loops where one outage must not flood the log.
   */
  writeThrottled(
    level: DiagnosticLevel,
    area: string,
    event: string,
    key: string,
    details: Record<string, unknown>,
    windowMs = 60_000,
  ): void {
    const now = Date.now();
    const previous = this.throttles.get(key);
    if (previous && now - previous.at < windowMs) {
      previous.suppressed += 1;
      return;
    }
    const payload = previous?.suppressed
      ? { ...details, repeatedSinceLastLog: previous.suppressed }
      : details;
    this.throttles.set(key, { at: now, suppressed: 0 });
    if (this.throttles.size > 200) {
      const oldest = [...this.throttles.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
      if (oldest) {
        this.throttles.delete(oldest);
      }
    }
    this.write(level, area, event, payload);
  }

  clear(): void {
    this.buffer.set([]);
    this.persist();
  }

  toText(): string {
    return this.buffer().map(formatDiagnosticEntry).join('\n');
  }

  private trim(entries: DiagnosticEntry[]): DiagnosticEntry[] {
    const bounded = entries.slice(-MAX_ENTRIES);
    let serialized = JSON.stringify({ v: 1, entries: bounded } satisfies StoredDiagnostics);
    while (bounded.length > 1 && serialized.length > MAX_SERIALIZED_LENGTH) {
      bounded.shift();
      serialized = JSON.stringify({ v: 1, entries: bounded } satisfies StoredDiagnostics);
    }
    return bounded;
  }

  private persist(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      const stored: StoredDiagnostics = { v: 1, entries: this.buffer() };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Storage can be disabled or full. The in-memory log and console remain useful.
    }
  }

  private schedulePersist(): void {
    if (this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => this.persist(), FLUSH_DEBOUNCE_MS);
  }

  private load(): DiagnosticEntry[] {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as StoredDiagnostics) : null;
      if (!stored || stored.v !== 1 || !Array.isArray(stored.entries)) {
        return [];
      }
      return this.trim(
        stored.entries.filter(
          (entry) =>
            typeof entry?.at === 'number' &&
            ['info', 'warn', 'error'].includes(entry.level) &&
            typeof entry.area === 'string' &&
            typeof entry.event === 'string' &&
            typeof entry.details === 'string',
        ),
      );
    } catch {
      return [];
    }
  }
}
