import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { Account } from './models';
import { AnonymousAccount } from './providers/anonymous/anonymous-account';
import { AnonymousFollows } from './providers/anonymous/anonymous-follows';
import { AnonymousPublicApi } from './providers/anonymous/anonymous-public-api';

export type ImportRowStatus =
  | 'pending'
  | 'resolving'
  | 'following'
  | 'followed'
  | 'not_found'
  | 'failed';

export interface ImportRow {
  /** Normalized handle, e.g. "user@host" or "user" (local). */
  handle: string;
  status: ImportRowStatus;
  account?: Account;
  error?: string;
}

/**
 * Turn a pasted blob (or an uploaded file's text) into a deduped list of handles.
 *
 * Accepts, one per line:
 * - Mastodon CSV export (following_accounts.csv — takes the "Account address" column)
 * - @user@host, user@host, or bare @user / user (resolved on the home server)
 * - profile URLs: https://host/@user or https://host/users/user
 */
export function parseHandles(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) {
    return [];
  }

  let addressColumn = 0;
  let rows = lines;
  const header = lines[0].toLowerCase();
  if (header.includes('account address')) {
    addressColumn = lines[0]
      .split(',')
      .findIndex((c) => c.trim().toLowerCase() === 'account address');
    rows = lines.slice(1);
  }

  const seen = new Set<string>();
  const handles: string[] = [];
  for (const line of rows) {
    const cell = (line.split(',')[addressColumn] ?? '').trim().replace(/^["']|["']$/g, '');
    const handle = normalizeHandle(cell);
    if (handle && !seen.has(handle.toLowerCase())) {
      seen.add(handle.toLowerCase());
      handles.push(handle);
    }
  }
  return handles;
}

/** Normalize one entry to "user@host" (or "user" for local); null if unparseable. */
export function normalizeHandle(raw: string): string | null {
  let value = raw.trim();
  if (!value) {
    return null;
  }
  const url = value.match(/^https?:\/\/([^/]+)\/(?:@|users\/)([\w.-]+)\/?$/i);
  if (url) {
    return `${url[2]}@${url[1]}`;
  }
  value = value.replace(/^@/, '');
  if (/^[\w.-]+(@[\w.-]+\.[a-z]{2,})?$/i.test(value)) {
    return value;
  }
  return null;
}

/**
 * Client-side follow importer: resolves each handle via search (resolve=true, so the
 * home server webfingers accounts it hasn't federated with yet) and follows them one
 * at a time. Works against both the mock and real instances — real Mastodon has no
 * public bulk-import API, so sequential is the only client-side option.
 *
 * Rate limits: requests are spaced out, and a 429 waits until X-RateLimit-Reset
 * (capped) — or exponential backoff when the header is missing — then retries the
 * same handle.
 */
@Injectable({ providedIn: 'root' })
export class ImportFollows {
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousAccount);
  private anonymousFollows = inject(AnonymousFollows);
  private anonymousPublic = inject(AnonymousPublicApi);

  readonly rows = signal<ImportRow[]>([]);
  readonly running = signal(false);

  /** Spacing between accounts; tests set this to 0. */
  delayMs = 250;
  /** Longest single rate-limit wait; tests set this low. */
  maxWaitMs = 5 * 60_000;

  private stopRequested = false;

  load(handles: string[]): void {
    this.rows.set(handles.map((handle) => ({ handle, status: 'pending' as const })));
  }

  /** Load already-resolved canonical snapshots (used by code-shipped collections). */
  loadResolved(entries: readonly { handle: string; account: Account }[]): void {
    this.rows.set(
      entries.map(({ handle, account }) => ({ handle, account, status: 'pending' as const })),
    );
  }

  stop(): void {
    this.stopRequested = true;
  }

  reset(): void {
    this.rows.set([]);
    this.running.set(false);
    this.stopRequested = false;
  }

  /** Follow every pending row, sequentially. Resolves when done or stopped. */
  async start(): Promise<void> {
    if (this.running()) {
      return;
    }
    this.stopRequested = false;
    this.running.set(true);
    try {
      for (let i = 0; i < this.rows().length; i++) {
        if (this.stopRequested) {
          break;
        }
        if (this.rows()[i].status !== 'pending') {
          continue;
        }
        await this.processRow(i);
        if (this.delayMs && !this.auth.isAnonymous) {
          await sleep(this.delayMs);
        }
      }
    } finally {
      this.running.set(false);
    }
  }

  private async processRow(i: number): Promise<void> {
    const handle = this.rows()[i].handle;
    let account = this.rows()[i].account;
    if (!account) {
      this.patch(i, { status: 'resolving' });
      try {
        const results = await this.withRateLimitRetry(() => firstValueFrom(this.search(handle)));
        account = pickAccount(handle, results.accounts ?? []);
      } catch (err) {
        this.patch(i, { status: 'failed', error: describeHttpError(err) });
        return;
      }
    }
    if (!account) {
      this.patch(i, { status: 'not_found' });
      return;
    }
    this.patch(i, { status: 'following', account });
    try {
      if (this.auth.isAnonymous) {
        const result = this.anonymousFollows.follow(account, this.serverFor(handle));
        if (!result.ok) throw new Error(result.error);
      } else {
        // Following an already-followed account is a harmless no-op server-side.
        await this.withRateLimitRetry(() => firstValueFrom(this.api.follow(account.id)));
      }
      this.patch(i, { status: 'followed' });
    } catch (err) {
      this.patch(i, { status: 'failed', error: describeHttpError(err) });
    }
  }

  private search(handle: string) {
    return this.auth.isAnonymous
      ? this.anonymousPublic.search(this.serverFor(handle), handle.split('@')[0], 'accounts')
      : this.api.search(handle, 'accounts', { resolve: true, limit: 5 });
  }

  private serverFor(handle: string): string {
    const host = handle.includes('@') ? handle.split('@').at(-1) : null;
    return host ? `https://${host}` : this.anonymous.server();
  }

  private async withRateLimitRetry<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request();
      } catch (err) {
        const status = (err as HttpErrorResponse)?.status;
        if (status !== 429 || attempt >= 4 || this.stopRequested) {
          throw err;
        }
        await sleep(this.rateLimitWaitMs(err as HttpErrorResponse, attempt));
      }
    }
  }

  private rateLimitWaitMs(err: HttpErrorResponse, attempt: number): number {
    const reset = err.headers?.get('X-RateLimit-Reset');
    if (reset) {
      const until = Date.parse(reset) - Date.now();
      if (Number.isFinite(until) && until > 0) {
        return Math.min(until + 1000, this.maxWaitMs);
      }
    }
    return Math.min(5000 * 2 ** attempt, this.maxWaitMs);
  }

  private patch(i: number, changes: Partial<ImportRow>): void {
    this.rows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...changes } : r)));
  }
}

/** Prefer the exact acct match; the mock and real search can both return look-alikes. */
function pickAccount(handle: string, accounts: Account[]): Account | undefined {
  const wanted = handle.toLowerCase();
  return (
    accounts.find((a) => a.acct.toLowerCase() === wanted) ??
    accounts.find((a) => a.username.toLowerCase() === wanted) ??
    accounts[0]
  );
}

function describeHttpError(err: unknown): string {
  const status = (err as HttpErrorResponse)?.status;
  if (status === 429) {
    return 'Rate limited — try again later.';
  }
  if (status) {
    return `Request failed (HTTP ${status}).`;
  }
  // Not every failure here is an HTTP one. The anonymous follow cap is a plain
  // Error carrying the only text that explains why the run stopped, and
  // flattening it to "Request failed." threw away the reason — which reads as a
  // bug rather than a limit.
  const message = err instanceof Error ? err.message.trim() : '';
  return message || 'Request failed.';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
