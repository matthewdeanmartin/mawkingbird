import { inject, Injectable } from '@angular/core';
import { PageDiagnostics } from '../../page-diagnostics';
import { MawkingbirdSession } from './mawkingbird-session';
import { ProfileAccountKey } from './profile-account-key';
import { PROFILE_ORIGIN } from './profile-client';

/**
 * The wire client for Plus provider collections.
 *
 * ## This is a provider, not a sync
 *
 * The server holds the **only** copy. There is no local mirror, so nothing can
 * diverge, and none of `ProfileSync`'s machinery applies here: no revisions to
 * compare, no conflicts to show a user, no sidecars. A failed write is a failed
 * write — the same posture as Mastodon being unreachable, not a new vocabulary.
 *
 * The service resolves index contention internally with a bounded, jittered
 * retry, so a 412 never reaches this code. If one ever does, it is a bug in the
 * service rather than a state this client should learn to resolve.
 *
 * ## Why there is no cache here
 *
 * Tempting, and deliberately absent. A read-through cache is the seed of exactly
 * the divergence this model was chosen to avoid, and it would need `cache`
 * classification plus an inability to win a disagreement. Listed under "not in
 * this plan" in the roadmap; when it arrives it should be a considered addition,
 * not something that accumulated.
 */

/** One item in a collection index. */
export interface CollectionItem<T = unknown> {
  id: string;
  updatedAt: string;
  size: number;
  /** Present when the item was small enough to store inside the index. */
  inline?: T;
  title?: string;
}

export interface CollectionIndex<T = unknown> {
  kind: 'mawkingbird-profile-index';
  collection: string;
  revision: number;
  updatedAt: string;
  items: CollectionItem<T>[];
}

/**
 * Every way a collection request can end.
 *
 * Deliberately similar to `ProfileResult` but not the same type: that one
 * carries `conflict`, which cannot happen here, and sharing it would invite a
 * caller to write a branch for a state this API never produces.
 */
export type CollectionResult<T> =
  | { kind: 'ok'; value: T }
  /** Nothing stored under that id. */
  | { kind: 'absent' }
  /** Unchanged since the ETag we sent. */
  | { kind: 'unchanged' }
  /** Not entitled: free tier, or a lapsed subscription. Reads still work. */
  | { kind: 'payment-required'; message: string }
  /**
   * The credential was not accepted (401). Says nothing about entitlement.
   *
   * Split from `forbidden` because they call for opposite messages and were
   * previously collapsed into one: an expired sign-in was reported to the user
   * as a lapsed subscription, which is both wrong and an accusation. A 401 means
   * the service does not know who is asking, so the only honest thing to say is
   * "sign in again".
   */
  | { kind: 'unauthenticated'; message: string }
  /** Known, but not allowed: anonymous, or not on the tester list (403). */
  | { kind: 'forbidden'; message: string }
  /** No account key could be determined. Never a default bucket. */
  | { kind: 'no-account'; message: string }
  /** Anything else: offline, CORS, 5xx, a malformed body. */
  | { kind: 'failed'; message: string };

/** One mutation in a batch. */
export type BatchOperation<T = unknown> =
  | { op: 'put'; id: string; value: T }
  | { op: 'delete'; id: string };

@Injectable({ providedIn: 'root' })
export class ProfileCollections {
  private base = inject(PROFILE_ORIGIN);
  private session = inject(MawkingbirdSession);
  private accountKey = inject(ProfileAccountKey);
  /**
   * Console logging, matching `ProfileClient`.
   *
   * This client has its own `fetch` and was entirely unlogged, so a collection
   * that could not be read said so on screen and nowhere else — including the
   * pre-network refusal below, which is not an HTTP failure at all and so left
   * no trace even in the network tab.
   */
  private log = inject(PageDiagnostics);

  /**
   * Fetch a collection's index.
   *
   * `knownEtag` makes a no-change poll cheap: the service answers 304, which is
   * one small request rather than a full index download.
   */
  async index<T>(
    collection: string,
    knownEtag?: string,
  ): Promise<CollectionResult<{ index: CollectionIndex<T>; etag: string }>> {
    const headers: Record<string, string> = {};
    if (knownEtag) {
      headers['If-None-Match'] = knownEtag;
    }
    const response = await this.send(`/collections/${collection}`, { method: 'GET', headers });
    if (typeof response === 'string') {
      return this.transportFailure(response);
    }
    if (response.status === 304) {
      return { kind: 'unchanged' };
    }
    const refusal = await this.refusalFor(response);
    if (refusal) {
      return refusal;
    }
    try {
      return {
        kind: 'ok',
        value: {
          index: (await response.json()) as CollectionIndex<T>,
          etag: response.headers.get('ETag') ?? '',
        },
      };
    } catch {
      return { kind: 'failed', message: 'The profile service returned an unreadable index.' };
    }
  }

  /** Fetch one item. Small items come from the index, but the URL is the same. */
  async get<T>(collection: string, id: string): Promise<CollectionResult<T>> {
    const response = await this.send(`/collections/${collection}/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
    if (typeof response === 'string') {
      return this.transportFailure(response);
    }
    if (response.status === 404) {
      return { kind: 'absent' };
    }
    const refusal = await this.refusalFor(response);
    if (refusal) {
      return refusal;
    }
    try {
      return { kind: 'ok', value: (await response.json()) as T };
    } catch {
      return { kind: 'failed', message: 'The profile service returned an unreadable item.' };
    }
  }

  /** Create or replace one item. */
  async put<T>(
    collection: string,
    id: string,
    value: T,
  ): Promise<CollectionResult<{ revision: number }>> {
    const response = await this.send(`/collections/${collection}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    return this.mutationResult(response);
  }

  /** Remove one item. Allowed even on a lapsed account. */
  async remove(collection: string, id: string): Promise<CollectionResult<{ revision: number }>> {
    const response = await this.send(`/collections/${collection}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (typeof response === 'string') {
      return this.transportFailure(response);
    }
    if (response.status === 404) {
      // Already gone. Reported as success: the caller asked for it to not exist,
      // and it does not exist. Surfacing an error here would make a double-click
      // look like a failure.
      return { kind: 'ok', value: { revision: 0 } };
    }
    return this.mutationResult(response);
  }

  /**
   * Several mutations, one index write.
   *
   * The cheap path, and the one to prefer for anything bulk: N separate writes
   * would be N index updates racing each other, where this is one. Used by the
   * copy-from-local flow.
   */
  async batch<T>(
    collection: string,
    operations: BatchOperation<T>[],
  ): Promise<CollectionResult<{ written: number; deleted: number; revision: number }>> {
    const response = await this.send(`/collections/${collection}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations }),
    });
    if (typeof response === 'string') {
      return this.transportFailure(response);
    }
    const refusal = await this.refusalFor(response);
    if (refusal) {
      return refusal;
    }
    try {
      const body = (await response.json()) as {
        written?: number;
        deleted?: number;
        revision?: number;
      };
      return {
        kind: 'ok',
        value: {
          written: body.written ?? 0,
          deleted: body.deleted ?? 0,
          revision: body.revision ?? 0,
        },
      };
    } catch {
      return { kind: 'failed', message: 'The profile service returned an unreadable answer.' };
    }
  }

  private async mutationResult(
    response: Response | string,
  ): Promise<CollectionResult<{ revision: number }>> {
    if (typeof response === 'string') {
      return this.transportFailure(response);
    }
    const refusal = await this.refusalFor(response);
    if (refusal) {
      return refusal;
    }
    try {
      const body = (await response.json()) as { revision?: number };
      return { kind: 'ok', value: { revision: body.revision ?? 0 } };
    } catch {
      return { kind: 'failed', message: 'The profile service returned an unreadable answer.' };
    }
  }

  /**
   * A transport-level string turned into a result.
   *
   * The sentinel for "no account key" is checked here rather than at every call
   * site, so a caller cannot forget it and end up reporting a missing persona as
   * a network problem.
   */
  private transportFailure<T>(message: string): CollectionResult<T> {
    return message === NO_ACCOUNT
      ? { kind: 'no-account', message: 'Sign in to an account to use its Mawkingbird lists.' }
      : { kind: 'failed', message };
  }

  private async refusalFor(response: Response): Promise<CollectionResult<never> | null> {
    if (response.ok) {
      return null;
    }
    const message = await this.messageFrom(response);
    if (response.status === 402) {
      return {
        kind: 'payment-required',
        message: message ?? 'Mawkingbird lists are part of Mawkingbird Plus.',
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
    if (response.status === 400) {
      // The service refusing an account key. Reported distinctly because the
      // remedy is "sign in properly", not "try again later".
      return { kind: 'no-account', message: message ?? 'Could not tell which account this is.' };
    }
    return {
      kind: 'failed',
      message: message ?? `The profile service answered ${response.status}.`,
    };
  }

  private async messageFrom(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === 'string' && body.error ? body.error : null;
    } catch {
      return null;
    }
  }

  /**
   * One authenticated, account-scoped request.
   *
   * Refuses before reaching the network when no account key can be determined.
   * That is the client half of the same guard the service enforces: never fall
   * back to a default bucket.
   */
  private async send(path: string, init: RequestInit): Promise<Response | string> {
    const account = this.accountKey.header();
    if (account === null) {
      // Not a network failure, and the reason it was previously invisible: this
      // returns before any request is made, so nothing appears in the network
      // tab either. On screen it reads as "could not read", which points at the
      // server for a decision made entirely on this side.
      this.log.warn('ProfileCollections', 'send:no-account', {
        method: init.method ?? 'GET',
        path,
      });
      return NO_ACCOUNT;
    }
    const token = await this.session.token();
    if (!token) {
      this.log.warn('ProfileCollections', 'send:no-token', {
        method: init.method ?? 'GET',
        path,
      });
      return 'Could not reach the Mawkingbird account service.';
    }
    try {
      const response = await fetch(`${this.base}${path}`, {
        ...init,
        // No cookies, ever — the service authenticates by bearer header and
        // deliberately does not send Access-Control-Allow-Credentials.
        credentials: 'omit',
        headers: { ...init.headers, ...account, Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        this.log.warn('ProfileCollections', 'http:not-ok', {
          method: init.method ?? 'GET',
          path,
          status: response.status,
        });
      }
      return response;
    } catch (error: unknown) {
      this.log.warn('ProfileCollections', 'http:unreachable', {
        method: init.method ?? 'GET',
        path,
      });
      return error instanceof Error && error.message
        ? `Could not reach the profile service. (${error.message})`
        : 'Could not reach the profile service.';
    }
  }
}

/** Internal sentinel: no account key could be determined. */
const NO_ACCOUNT = ' no-account';
