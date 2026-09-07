/**
 * The wire client for the vault routes.
 *
 * Thin, like `ProfileClient` and for the same reason: this knows how to make one
 * request and read one answer. Deciding whether to write, and what to do about a
 * conflict, belongs to {@link VaultService}.
 *
 * Separate from `ProfileClient` rather than folded into it, because the two
 * carry different things and answer to different rules — `/settings` holds
 * preferences and refuses credential-shaped content, while these routes carry
 * nothing but ciphertext. Sharing a class would make it easy to reach for the
 * wrong method, and the wrong method here uploads a secret to a route that
 * refuses secrets.
 */

import { inject, Injectable } from '@angular/core';
import { MawkingbirdSession } from '../account/mawkingbird-session';
import { MawkingbirdMetrics, billingTier } from '../../observability/mawkingbird-metrics';
import { PROFILE_ORIGIN } from '../account/profile-client';
import type { KdfParams } from './vault-crypto';

/**
 * The header carrying the version a write is based on.
 *
 * Must match `VAULT_VERSION_HEADER` in `mawkingbird_profile/src/vault.ts`, and
 * must appear in that Worker's `Access-Control-Allow-Headers` — a custom header
 * missing from the preflight allowlist makes every write fail in a browser while
 * passing every test on both sides.
 */
export const VAULT_VERSION_HEADER = 'If-Vault-Version';

/** What the server knows about a vault without being able to read it. */
export interface VaultMeta {
  version: number;
  saltB64: string;
  kdf: KdfParams;
  policy: { kind: 'idle' | 'absolute' | 'never'; days?: 90 | 365 };
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  bytes: number;
  masterKeyVersion: number;
  expiresAt: string | null;
  graceKind: 'none' | 'trial' | 'paid';
  lapsedAt?: string;
}

/** A stored vault: still encrypted, and stays that way until the service opens it. */
export interface StoredVault {
  blob: string;
  version: number;
  meta: VaultMeta;
}

export type VaultResult<T> =
  | { kind: 'ok'; value: T }
  /** No vault stored for this account. */
  | { kind: 'absent' }
  /** Someone else wrote first. Carries the version to merge against. */
  | { kind: 'conflict'; currentVersion: number }
  /** Free tier or lapsed. Reads of metadata still work. */
  | { kind: 'payment-required'; message: string }
  /** Signed out, anonymous, not a tester, or not on an identity provider. */
  | { kind: 'forbidden'; message: string; code?: string }
  /** Offline, CORS, 5xx, or an unreadable body. */
  | { kind: 'failed'; message: string };

@Injectable({ providedIn: 'root' })
export class VaultClient {
  private base = inject(PROFILE_ORIGIN);
  private session = inject(MawkingbirdSession);
  private metrics = inject(MawkingbirdMetrics);

  /**
   * Metadata only, and the one route a lapsed account can still reach.
   *
   * Fetched **before** the ciphertext: it carries the salt and KDF parameters
   * needed to derive the key, so a wrong passphrase costs one small request
   * rather than a full vault transfer.
   */
  async meta(): Promise<VaultResult<VaultMeta>> {
    const result = await this.request<{ meta: VaultMeta }>('/vault/meta', { method: 'GET' });
    return result.kind === 'ok' ? { kind: 'ok', value: result.value.meta } : result;
  }

  /** The stored ciphertext. Still opaque here. */
  async fetch(): Promise<VaultResult<StoredVault>> {
    return this.request<StoredVault>('/vault', { method: 'GET' });
  }

  /**
   * Store a sealed bundle.
   *
   * `version` is the one this edit was based on, omitted when creating. The
   * service answers 428 if a vault exists and no version was sent, which is the
   * same posture `/settings` takes toward unconditional writes: the lost-update
   * bug is made inexpressible rather than merely discouraged.
   */
  async store(
    blob: string,
    saltB64: string,
    kdf: KdfParams,
    version: number | null,
  ): Promise<VaultResult<{ version: number; meta: VaultMeta }>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (version !== null) {
      headers[VAULT_VERSION_HEADER] = String(version);
    }
    return this.request('/vault', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ blob, saltB64, kdf }),
    });
  }

  /** Destroy the stored copy. Open to lapsed accounts, as deletion always is. */
  async destroy(): Promise<VaultResult<{ deleted: boolean }>> {
    return this.request('/vault', { method: 'DELETE' });
  }

  /** Change retention. Requires a paying tier — a lapsed account cannot extend its own grace. */
  async setPolicy(policy: VaultMeta['policy']): Promise<VaultResult<{ meta: VaultMeta }>> {
    return this.request('/vault/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy }),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<VaultResult<T>> {
    const token = await this.session.token();
    if (!token) {
      return { kind: 'forbidden', message: 'Sign in to use your stored connections.' };
    }

    const tier = billingTier(this.session.heldTier());
    const start = performance.now();
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        ...init,
        // No cookies, ever — the service refuses to send
        // `Access-Control-Allow-Credentials`, so asking for them fails the
        // preflight rather than degrading quietly.
        credentials: 'omit',
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
      this.metrics.record('profile', tier, performance.now() - start, response.ok);
    } catch (error: unknown) {
      this.metrics.record('profile', tier, performance.now() - start, false);
      return {
        kind: 'failed',
        message:
          error instanceof Error && error.message
            ? `Could not reach your stored connections. (${error.message})`
            : 'Could not reach your stored connections.',
      };
    }

    if (response.status === 404) {
      return { kind: 'absent' };
    }

    if (!response.ok) {
      const body = await this.bodyOf(response);
      if (response.status === 409 || response.status === 428) {
        // Both mean "you are not writing over what you think you are". 428 is a
        // missing version and 409 a stale one; the caller's response to each is
        // identical, so they collapse.
        return {
          kind: 'conflict',
          currentVersion: typeof body?.['currentVersion'] === 'number' ? body['currentVersion'] : 0,
        };
      }
      const message = typeof body?.['error'] === 'string' ? body['error'] : null;
      const code = typeof body?.['code'] === 'string' ? body['code'] : undefined;
      if (response.status === 402) {
        return {
          kind: 'payment-required',
          message: message ?? 'Stored connections are part of Mawkingbird Plus.',
        };
      }
      if (response.status === 401 || response.status === 403) {
        // `code` is carried through because the three refusals need different
        // offers: sign in, upgrade the sign-in, or ask to be added to the tester
        // list. Collapsing them into one message produces a dead end for two of
        // the three.
        return {
          kind: 'forbidden',
          message: message ?? 'You cannot store connections on this account.',
          ...(code ? { code } : {}),
        };
      }
      return {
        kind: 'failed',
        message: message ?? `Your stored connections answered ${response.status}.`,
      };
    }

    try {
      return { kind: 'ok', value: (await response.json()) as T };
    } catch {
      return { kind: 'failed', message: 'Your stored connections returned an unreadable answer.' };
    }
  }

  private async bodyOf(response: Response): Promise<Record<string, unknown> | null> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
