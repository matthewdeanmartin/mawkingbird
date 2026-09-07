import { inject, Injectable, InjectionToken } from '@angular/core';
import { PageDiagnostics } from '../../page-diagnostics';
import { MawkingbirdSession } from './mawkingbird-session';
import { MawkingbirdMetrics, billingTier } from '../../observability/mawkingbird-metrics';
import { RemoteStorageUsage } from '../../observability/remote-storage-usage';
import { profileOrigin } from './profile-origin';
import type { PortableConfig } from '../../portable-config';

/**
 * The wire client for the profile service.
 *
 * Deliberately thin and deliberately not a sync engine: this module knows how to
 * make one request and interpret one response. Deciding *whether* to write, and
 * what to do about a conflict, is `ProfileSync`'s job.
 *
 * ## Conditional requests are the whole protocol
 *
 * Every write carries `If-Match` (update) or `If-None-Match: *` (create). The
 * service refuses an unconditional write with 428, on purpose — an
 * unconditional write is the lost-update bug, and making it impossible to
 * express beats documenting that it is discouraged. So there is no method here
 * that writes without a precondition.
 *
 * ## Bearer, never cookies
 *
 * Unlike the auth services, this one is called with `credentials: 'omit'`. The
 * token goes in a header. That keeps the service out of cookie semantics
 * entirely — no `SameSite`, no third-party blocking, no CSRF surface — and it is
 * why the service refuses to send `Access-Control-Allow-Credentials`.
 */

/** Where the profile service lives. Overridable so specs need no network. */
export const PROFILE_ORIGIN = new InjectionToken<string>('PROFILE_ORIGIN', {
  providedIn: 'root',
  factory: () => profileOrigin(),
});

/** The settings document as stored. Extends the portable config's shape. */
export interface SettingsDocument {
  kind: 'mawkingbird-profile-settings';
  schemaVersion: number;
  minimumReaderVersion: number;
  revision: number;
  updatedAt: string;
  writer: string;
  values: Record<string, string>;
  /**
   * The exact set of global keys this document is authoritative for.
   *
   * Sent so the service can validate precisely rather than guessing. It cannot
   * derive this itself: telling `mockingbird_rss_feeds_a1b2c3` from a
   * legitimately underscored global key needs the registry's `base` names, and
   * the service deliberately holds no copy of the registry.
   *
   * It is also what makes a *removal* meaningful. Without it, "this key is
   * absent" and "this key was deleted" are the same bytes.
   */
  keys: string[];
}

/** What `GET /manifest` reports. */
export interface ProfileCollectionSummary {
  revision: number;
  count: number;
}

/** One persona beneath the global Mawkingbird Plus identity. */
export interface ProfileAccountSummary {
  accountKey: string;
  collections: Record<string, ProfileCollectionSummary>;
}

export interface ProfileManifest {
  readOnly: boolean;
  settings?: { etag: string; revision: number; updatedAt: string; size: number };
  /** Present only on the opt-in, user-triggered diagnostics request. */
  accounts?: ProfileAccountSummary[];
  quota: { used: number; limit: number };
  conflicts: number;
}

/** A settings document plus the ETag needed to write over it. */
export interface FetchedSettings {
  document: SettingsDocument;
  etag: string;
}

/**
 * What a subscription has done, in the only terms a subscriber cares about.
 *
 * Deliberately just a total and a start date. No per-article history: this
 * Worker turns off invocation logs so that a person's reading is not recorded,
 * and building a reading list in the response body would undo that at the back
 * door.
 */
export interface ReadingStats {
  /** Articles opened in the reader, across every device, ever. */
  articles: number;
  /** ISO-8601 date counting began, or '' before the first article. */
  since: string;
}

/**
 * Every way a profile request can end.
 *
 * A discriminated union rather than exceptions, because most of these are
 * *expected* outcomes the caller must branch on — a conflict and a lapsed
 * subscription are both normal, and neither is exceptional in the sense that
 * word usually implies.
 */
export type ProfileResult<T> =
  | { kind: 'ok'; value: T }
  /** Nothing stored yet. */
  | { kind: 'absent' }
  /** Unchanged since the ETag we sent. */
  | { kind: 'unchanged' }
  /** Someone else wrote first. Carries the winning document. */
  | { kind: 'conflict'; current: SettingsDocument; etag: string }
  /** Not entitled: free tier, or a lapsed subscription. Reads still work. */
  | { kind: 'payment-required'; message: string }
  /** 401: the credential was not accepted. Says nothing about entitlement. */
  | { kind: 'unauthenticated'; message: string }
  /** Signed out, anonymous, or not on the tester list. */
  | { kind: 'forbidden'; message: string }
  /** Anything else: offline, CORS, 5xx, a malformed body. */
  | { kind: 'failed'; message: string };

/**
 * The message `send()` reports when it declines to call for an anonymous
 * session. Matched by {@link ProfileClient.refusalForSend} so the caller gets
 * `forbidden` — the same kind the service's own 403 would have produced.
 */
const ANONYMOUS_REFUSAL = 'anonymous-session';

/** Wording for the local refusal; mirrors the service's own message. */
const ANONYMOUS_MESSAGE =
  'An anonymous session cannot store a profile. Confirm an email address to keep settings across browsers.';

@Injectable({ providedIn: 'root' })
export class ProfileClient {
  /**
   * Console logging for every profile request.
   *
   * Added after a deployed session where a `PUT /settings` answered 402 and
   * nothing anywhere said so: the UI reported "nothing stored" and offered a
   * Sync button that silently did nothing. The request layer is the only place
   * that knows the status code, so it is the only place that can report it.
   *
   * Status and path only — never a response body, which carries settings.
   */
  private log = inject(PageDiagnostics);
  private base = inject(PROFILE_ORIGIN);
  private session = inject(MawkingbirdSession);
  private metrics = inject(MawkingbirdMetrics);
  private remoteStorage = inject(RemoteStorageUsage);

  /** What the account has stored, and whether writes are allowed. */
  async manifest(
    options: { includeAccounts?: boolean } = {},
  ): Promise<ProfileResult<ProfileManifest>> {
    const path = options.includeAccounts ? '/manifest?accounts=all' : '/manifest';
    const result = await this.request<ProfileManifest>(path, { method: 'GET' });
    // Bank the quota on the way past. It is the service's own accounting —
    // a KV counter it keeps per user — so it is the only honest source for
    // "how much am I storing remotely", and it arrives free on a request the
    // app already makes. Captured here rather than at the call sites because
    // every caller comes through this method.
    if (result.kind === 'ok' && result.value.quota) {
      this.remoteStorage.record(result.value.quota, billingTier(this.session.heldTier()));
    }
    return result;
  }

  /**
   * Fetch the settings document.
   *
   * `knownEtag` turns this into a cheap poll: the service answers 304 when
   * nothing changed, which is what makes a focus-triggered check affordable.
   */
  async fetchSettings(knownEtag?: string): Promise<ProfileResult<FetchedSettings>> {
    const headers: Record<string, string> = {};
    if (knownEtag) {
      headers['If-None-Match'] = knownEtag;
    }
    const response = await this.send('/settings', { method: 'GET', headers });
    if (typeof response === 'string') {
      return this.refusalForSend(response);
    }
    if (response.status === 304) {
      return { kind: 'unchanged' };
    }
    if (response.status === 404) {
      return { kind: 'absent' };
    }
    const refusal = await this.refusalFor(response);
    if (refusal) {
      return refusal;
    }
    // A 2xx that is not a document. The service answers `GET /settings` with
    // 200, 304 or 404 and always sets an ETag on the 200 — so a bodyless or
    // ETag-less success did not come from the settings handler: a preflight
    // answered as the request, a redirect followed to somewhere else, or an
    // intermediary rewrote it. `absent` rather than `failed`, because there is
    // demonstrably no document here and that is a state the caller already
    // handles by writing one, where `failed` only produces a stuck sync.
    if (response.status === 204) {
      this.log.warn('ProfileClient', 'settings:no-content', { status: response.status });
      return { kind: 'absent' };
    }

    const etag = response.headers.get('ETag');
    if (!etag) {
      // Without an ETag there is nothing to write back against, so treating this
      // as success would produce a document that can never be updated.
      //
      // Logged with what is actually knowable, because the bare message was
      // undiagnosable in the field: the header is set by the Worker on every
      // 200 and exposed via `Access-Control-Expose-Headers`, so reaching here
      // means either something between us rewrote the response, or the browser
      // could not read the header — and `type` distinguishes those. An opaque
      // response reads as status 0 with no headers at all.
      this.log.warn('ProfileClient', 'settings:no-etag', {
        status: response.status,
        type: response.type,
        // Present when the body arrived but the header did not, which points at
        // header exposure rather than at a wrong response.
        hasBody: response.headers.get('Content-Type') !== null,
      });
      return {
        kind: 'failed',
        message: 'The profile service returned no ETag, so this document cannot be updated safely.',
      };
    }
    try {
      return { kind: 'ok', value: { document: (await response.json()) as SettingsDocument, etag } };
    } catch {
      return { kind: 'failed', message: 'The profile service returned an unreadable document.' };
    }
  }

  /**
   * Write the settings document.
   *
   * `etag` updates; its absence creates. There is no third option, which is the
   * point — see the class comment.
   */
  async putSettings(
    document: SettingsDocument,
    etag?: string,
  ): Promise<ProfileResult<{ etag: string; revision: number }>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (etag) {
      headers['If-Match'] = etag;
    } else {
      headers['If-None-Match'] = '*';
    }

    const response = await this.send('/settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify(document),
    });
    if (typeof response === 'string') {
      return this.refusalForSend(response);
    }

    // 412 carries the winning document, which is what lets a conflict resolve in
    // one round trip instead of two.
    if (response.status === 412) {
      try {
        const body = (await response.json()) as { current?: SettingsDocument };
        const currentEtag = response.headers.get('ETag') ?? '';
        if (body.current) {
          return { kind: 'conflict', current: body.current, etag: currentEtag };
        }
      } catch {
        // Fall through to the generic failure below.
      }
      return { kind: 'failed', message: 'The stored settings changed while saving.' };
    }

    // 409 means the revision did not advance — the client is behind and does not
    // know it. Reported as a conflict so the caller re-reads, which is the same
    // remedy.
    if (response.status === 409) {
      return { kind: 'failed', message: 'This browser is behind. Re-reading before saving.' };
    }

    const refusal = await this.refusalFor(response);
    if (refusal) {
      return refusal;
    }
    try {
      const body = (await response.json()) as { etag?: string; revision?: number };
      const newEtag = body.etag ?? response.headers.get('ETag');
      if (!newEtag || typeof body.revision !== 'number') {
        return { kind: 'failed', message: 'The profile service returned an unexpected answer.' };
      }
      return { kind: 'ok', value: { etag: newEtag, revision: body.revision } };
    } catch {
      return { kind: 'failed', message: 'The profile service returned an unreadable answer.' };
    }
  }

  /** Delete the stored settings document. Allowed even on a lapsed account. */
  async deleteSettings(etag: string): Promise<ProfileResult<true>> {
    const response = await this.send('/settings', {
      method: 'DELETE',
      headers: { 'If-Match': etag },
    });
    if (typeof response === 'string') {
      return this.refusalForSend(response);
    }
    if (response.status === 404) {
      return { kind: 'absent' };
    }
    const refusal = await this.refusalFor(response);
    if (refusal) {
      return refusal;
    }
    return { kind: 'ok', value: true };
  }

  /**
   * Everything stored, as one document.
   *
   * Works on a lapsed account, which is the point: nobody should be held hostage
   * by a service holding data they cannot get back out. The cancellation flow
   * calls this.
   */
  async exportAll(): Promise<ProfileResult<unknown>> {
    return this.request<unknown>('/export', { method: 'GET' });
  }

  /**
   * The running total of articles read, across every device.
   *
   * Readable on a lapsed account for the same reason `exportAll` is: the person
   * deciding whether to resubscribe is exactly the one who benefits from seeing
   * what the subscription did. Only the write is entitled.
   */
  async readingStats(): Promise<ProfileResult<ReadingStats>> {
    return this.request<ReadingStats>('/reading-stats', { method: 'GET' });
  }

  /**
   * Add to that total.
   *
   * Batched by the caller rather than sent per article — see
   * `ArticleReadingTally`. The service caps how much one call may add, so a
   * client loop cannot inflate the number arbitrarily.
   */
  async recordArticlesRead(articles: number): Promise<ProfileResult<ReadingStats>> {
    return this.request<ReadingStats>('/reading-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
    });
  }

  /**
   * A generic JSON GET.
   *
   * Only used for endpoints with no conditional-request semantics; anything
   * involving an ETag has its own method above so the header handling cannot
   * drift.
   */
  private async request<T>(path: string, init: RequestInit): Promise<ProfileResult<T>> {
    const method = init.method ?? 'GET';
    const response = await this.send(path, init);
    if (typeof response === 'string') {
      if (response === ANONYMOUS_REFUSAL) {
        // Not a warning: declining to call for an anonymous session is the
        // designed path, not a fault worth flagging in the diagnostics log.
        this.log.info('ProfileClient', 'request:skipped-anonymous', { method, path });
      } else {
        this.log.warn('ProfileClient', 'request:unreachable', { method, path, message: response });
      }
      return this.refusalForSend(response);
    }
    if (response.status === 404) {
      // Expected whenever nothing is stored yet, so `info` rather than `warn`.
      this.log.info('ProfileClient', 'request:absent', { method, path, status: 404 });
      return { kind: 'absent' };
    }
    const refusal = await this.refusalFor(response);
    if (refusal) {
      this.log.warn('ProfileClient', 'request:refused', {
        method,
        path,
        status: response.status,
        kind: refusal.kind,
        message: 'message' in refusal ? refusal.message : null,
      });
      return refusal;
    }
    this.log.info('ProfileClient', 'request:ok', { method, path, status: response.status });
    try {
      return { kind: 'ok', value: (await response.json()) as T };
    } catch {
      return { kind: 'failed', message: 'The profile service returned an unreadable answer.' };
    }
  }

  /**
   * Turn `send()`'s string failure into the result its callers should report.
   *
   * Everything `send()` declines to do arrives here as a string. Almost all of
   * it is genuinely a failure — offline, CORS, a dead service — but the
   * anonymous refusal is not: it is this client answering on the service's
   * behalf, so it must produce the same `forbidden` the 403 would have, or a
   * signed-out visitor would see "could not reach the service" for a service
   * that is perfectly reachable and simply says no.
   */
  private refusalForSend(message: string): ProfileResult<never> {
    return message === ANONYMOUS_REFUSAL
      ? { kind: 'forbidden', message: ANONYMOUS_MESSAGE }
      : { kind: 'failed', message };
  }

  /**
   * Turn a non-OK response into the matching refusal, or null if it was fine.
   *
   * All three refusals stay distinct because they mean different things to the
   * UI: 402 is "not entitled, your data is safe and readable", 401 is "we do not
   * know who you are", 403 is "we know, and no". The comment here used to claim
   * this while the code below still collapsed 401 into 403 — so an expired
   * sign-in was reported as a permissions problem, and callers that treated
   * `forbidden` as an entitlement signal went on to call it a lapsed
   * subscription.
   */
  private async refusalFor(response: Response): Promise<ProfileResult<never> | null> {
    if (response.ok) {
      return null;
    }
    const message = await this.messageFrom(response);
    if (response.status === 402) {
      return {
        kind: 'payment-required',
        message: message ?? 'Profile storage is part of Mawkingbird Plus.',
      };
    }
    if (response.status === 401) {
      return {
        kind: 'unauthenticated',
        message:
          message ?? 'Your sign-in has expired. Sign in again to use your Mawkingbird profile.',
      };
    }
    if (response.status === 403) {
      return {
        kind: 'forbidden',
        message: message ?? 'This account is not allowed to use Mawkingbird profile storage.',
      };
    }
    return {
      kind: 'failed',
      message: message ?? `The profile service answered ${response.status}.`,
    };
  }

  /**
   * The service's own error sentence, when it sent one.
   *
   * Safe to show verbatim: every error string these Workers emit is written for
   * a person to read, and they deliberately never relay an upstream provider's
   * message.
   */
  private async messageFrom(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === 'string' && body.error ? body.error : null;
    } catch {
      return null;
    }
  }

  /**
   * One authenticated request.
   *
   * Returns the `Response`, or a string when the request never completed —
   * offline, DNS, or a CORS refusal, which are indistinguishable from here and
   * all mean "no answer" rather than "an answer I did not like".
   */
  private async send(path: string, init: RequestInit): Promise<Response | string> {
    const token = await this.session.token();
    if (!token) {
      return 'Could not reach the Mawkingbird account service.';
    }
    // An anonymous session cannot own stored data, so every profile call it
    // makes is answered `403 code: anonymous` — see `canOwnStorage()` on the
    // session, which mirrors the service's own rule. Stopping here rather than
    // at one call site because the answer is a property of the session and so
    // holds for every path: on production this fired on cold load for every
    // signed-out visitor, one guaranteed-403 request each.
    //
    // Checked after the mint, never before: `canOwnStorage()` reads the held
    // token, and until `token()` has resolved there is nothing to read.
    if (this.session.canOwnStorage() === false) {
      return ANONYMOUS_REFUSAL;
    }
    // The tier of the token actually being sent, captured before the request
    // rather than after it: this is what the service will bill against, and a
    // subscription that starts or lapses mid-flight must not relabel a call
    // that was already paid for at the old rate.
    const tier = billingTier(this.session.heldTier());
    const start = performance.now();
    try {
      const response = await fetch(`${this.base}${path}`, {
        ...init,
        // No cookies, ever. See the class comment.
        credentials: 'omit',
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
      // A 402 or 409 is a real answer from a service that did the work of
      // deciding, so it counts as a call. Only a request that never completed
      // is an error here, which is the `catch` below.
      this.metrics.record('profile', tier, performance.now() - start, response.ok);
      if (!response.ok) {
        // Every non-OK answer, logged once, here — the only place that sees the
        // status. `sentTier` is included because a mismatch between the tier in
        // the token and the service's verdict is precisely the bug that is
        // otherwise invisible: the UI says Plus, the Worker answers 402, and
        // nothing on either side names the disagreement.
        this.log.warn('ProfileClient', 'http:not-ok', {
          method: init.method ?? 'GET',
          path,
          status: response.status,
          sentTier: tier,
        });
      }
      return response;
    } catch (error: unknown) {
      this.metrics.record('profile', tier, performance.now() - start, false);
      this.log.warn('ProfileClient', 'http:unreachable', {
        method: init.method ?? 'GET',
        path,
        sentTier: tier,
      });
      return error instanceof Error && error.message
        ? `Could not reach the profile service. (${error.message})`
        : 'Could not reach the profile service.';
    }
  }
}

/** Re-exported so a caller building a document needs one import. */
export type { PortableConfig };
