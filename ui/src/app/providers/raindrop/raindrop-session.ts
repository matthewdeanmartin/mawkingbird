import { inject, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';
import { Status } from '../../models';
import {
  credentialExpiresAt,
  ensureStamped,
  ExpiringCredential,
  ExpiringConnection,
  stampCredential,
} from '../credential-lifetime';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { reconcileScalar, type VaultReconcileOutcome } from '../vault/vault-reconcile';

const TOKEN_KEY_BASE = 'mockingbird_raindrop_token';
const LEGACY_CREDENTIALS_KEY_BASE = 'mockingbird_raindrop_credentials';

interface StoredRaindropToken extends ExpiringCredential {
  accessToken: string;
}

interface RaindropErrorResponse {
  error?: string | number;
  errorMessage?: string;
}

export type RaindropBookmarkTarget = 'post' | 'external-link';

export interface RaindropCollection {
  _id: number;
  title: string;
  count: number;
}

export interface RaindropBookmark {
  _id: number;
  title: string;
  link: string;
  excerpt: string;
  created: string;
  cover?: string;
  collection: { $id: number };
}

interface RaindropListResponse<T> {
  result: boolean;
  items: T[];
}

/**
 * Browser-only Raindrop.io connection using the account's non-expiring Test token.
 *
 * The token is stored **unscoped** — one Raindrop.io connection per browser,
 * shared by every Mastodon account including Anonymous. Raindrop is a private
 * bookmark drawer belonging to the person at the keyboard, not a public identity
 * attached to a persona (that distinction is what {@link ConnectionScope} is
 * about), so making each alt paste the same Test token bought nothing: any of
 * them could read the others' copy out of this same localStorage regardless.
 */
@Injectable({ providedIn: 'root' })
export class RaindropSession implements ExpiringConnection {
  private bridge = inject(VaultBridge);
  private readonly tokenKey = TOKEN_KEY_BASE;
  private token = signal<StoredRaindropToken | null>(adoptScopedToken(this.tokenKey));

  readonly connected = signal(this.token() !== null);

  /**
   * Connected, but the token is not in this browser right now.
   *
   * Set when local retention expired a vaulted token. Rendered as locked rather
   * than disconnected — see `VaultBridge.verdictFor`.
   */
  readonly needsFetch = signal(false);

  constructor() {
    // Do not retain client secrets saved by the superseded OAuth implementation,
    // under either the current or the old per-account key.
    localStorage.removeItem(LEGACY_CREDENTIALS_KEY_BASE);
    localStorage.removeItem(scopedKey(LEGACY_CREDENTIALS_KEY_BASE));
    // Retention is applied here rather than in `readToken`, which cannot tell a
    // vaulted token from a local-only one. Same construction-time timing as
    // every other connector.
    this.enforceLifetime();
  }

  connect(accessToken: string): void {
    const trimmed = accessToken.trim();
    if (!trimmed) {
      throw new Error('Paste the Test token from your Raindrop.io app settings.');
    }
    this.store(stampCredential({ accessToken: trimmed }));
  }

  /**
   * The access token, falling back to the vault on a local miss.
   *
   * `localStorage` first, always — this connector worked before the vault
   * existed and must keep working with it locked, unavailable or never set up.
   */
  accessToken(): string | null {
    const local = this.token()?.accessToken;
    if (local) {
      return local;
    }
    const fromVault = this.bridge.readThrough(TOKEN_KEY_BASE);
    if (fromVault) {
      // Repopulate, so the next call is local and the retention clock restarts
      // from this use rather than from the original connection.
      this.store(stampCredential({ accessToken: fromVault }), false);
    }
    return fromVault;
  }

  /** Persist locally, then push to the vault. */
  private store(token: StoredRaindropToken, sync = true): void {
    localStorage.setItem(this.tokenKey, JSON.stringify(token));
    this.token.set(token);
    this.connected.set(true);
    this.needsFetch.set(false);
    // Not awaited: pasting a token should feel instant. Failures are observable
    // via `syncToVault()`, which the settings page calls when the user opts in.
    if (sync) {
      void this.bridge.writeThrough(TOKEN_KEY_BASE, token.accessToken);
    }
  }

  /** Push the current token to the vault and report what happened. */
  async syncToVault(): Promise<SyncOutcome> {
    const token = this.token()?.accessToken;
    return token ? this.bridge.writeThrough(TOKEN_KEY_BASE, token) : { kind: 'skipped' };
  }

  /** Fill an empty browser from the vault, or an empty vault from this browser. */
  reconcileVault(): Promise<VaultReconcileOutcome> {
    return reconcileScalar({
      local: this.token()?.accessToken ?? null,
      remote: this.bridge.readThrough(TOKEN_KEY_BASE),
      restore: (accessToken) => {
        if (!accessToken) {
          return false;
        }
        this.store(stampCredential({ accessToken }), false);
        return true;
      },
      store: () => this.syncToVault(),
      conflictMessage:
        'Raindrop has different non-empty tokens here and in Mawkingbird; neither copy was replaced.',
    });
  }

  /** When this token ages out under the retention policy, or null. */
  expiresAt(): number | null {
    return credentialExpiresAt(this.token()?.connectedAt);
  }

  /**
   * Apply the local retention policy: lock if vaulted, disconnect otherwise.
   *
   * For a vaulted token this clears the plaintext and keeps the connection —
   * the next {@link accessToken} pulls it back. See `VaultBridge.verdictFor`.
   */
  enforceLifetime(): void {
    const token = this.token();
    if (!token) {
      return;
    }
    const verdict = this.bridge.verdictFor(TOKEN_KEY_BASE, token.connectedAt);
    if (verdict.kind === 'disconnect') {
      this.disconnect();
    } else if (verdict.kind === 'lock') {
      this.forgetLocally();
      this.needsFetch.set(true);
    }
  }

  async addBookmark(
    status: Status,
    target: RaindropBookmarkTarget,
    externalUrl?: string,
    collectionId?: number,
  ): Promise<void> {
    const link = target === 'external-link' ? externalUrl : status.url;
    if (!link) {
      throw new Error(
        target === 'external-link'
          ? 'This post does not contain an external link to save.'
          : 'This post does not have a public URL to save.',
      );
    }
    const body =
      target === 'external-link'
        ? { link, pleaseParse: {} }
        : {
            link,
            title: `@${status.account.acct}: ${plainText(status.content).slice(0, 180)}`,
            excerpt: plainText(status.content),
            pleaseParse: {},
          };
    if (collectionId !== undefined) {
      Object.assign(body, { collection: { $id: collectionId } });
    }
    await this.request(
      'https://api.raindrop.io/rest/v1/raindrop',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      "Raindrop.io couldn't save that bookmark.",
    );
  }

  /** The first root collections, in Raindrop's own order. */
  async collections(limit = 3): Promise<RaindropCollection[]> {
    const response = await this.request(
      'https://api.raindrop.io/rest/v1/collections',
      {},
      "Raindrop.io couldn't load your collections.",
    );
    const body = (await response.json()) as RaindropListResponse<RaindropCollection>;
    return Array.isArray(body.items) ? body.items.slice(0, limit) : [];
  }

  /** Fetch one bounded, zero-based page from All or a collection. */
  async bookmarks(
    collectionId = 0,
    page = 0,
    perPage = 20,
    search?: string,
  ): Promise<RaindropBookmark[]> {
    const params = new URLSearchParams({ page: String(page), perpage: String(perPage) });
    if (search?.trim()) {
      params.set('search', search.trim());
    }
    const response = await this.request(
      `https://api.raindrop.io/rest/v1/raindrops/${collectionId}?${params.toString()}`,
      {},
      "Raindrop.io couldn't load your bookmarks.",
    );
    const body = (await response.json()) as RaindropListResponse<RaindropBookmark>;
    return Array.isArray(body.items) ? body.items : [];
  }

  /** Remove one item after a successful conversion to a native bookmark. */
  async removeBookmark(id: number): Promise<void> {
    await this.request(
      `https://api.raindrop.io/rest/v1/raindrop/${id}`,
      { method: 'DELETE' },
      "Raindrop.io couldn't remove the converted bookmark.",
    );
  }

  /**
   * Disconnect here, and remove the stored copy too.
   *
   * The vault removal is the same reasoning as the legacy-key removal below:
   * "Disconnect" must not be undone by the next read finding another copy.
   */
  disconnect(): void {
    void this.bridge.removeThrough(TOKEN_KEY_BASE);
    this.forgetLocally();
    this.connected.set(false);
    this.needsFetch.set(false);
  }

  /** Clear every local copy. The vault copy, if any, survives. */
  private forgetLocally(): void {
    localStorage.removeItem(this.tokenKey);
    // Also clear the pre-unscoping copy, so a reload cannot find the old key and
    // adopt it again.
    localStorage.removeItem(scopedKey(TOKEN_KEY_BASE));
    localStorage.removeItem(LEGACY_CREDENTIALS_KEY_BASE);
    this.token.set(null);
  }

  private async request(url: string, init: RequestInit, fallback: string): Promise<Response> {
    // Through `accessToken()` rather than the signal, so a request made while
    // the local copy is locked pulls the vault copy back instead of telling the
    // user to connect something that is already connected.
    const accessToken = this.accessToken();
    if (!accessToken) {
      throw new Error('Connect Raindrop.io in Settings → Connections first.');
    }
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      if (response.status === 401) this.disconnect();
      throw new Error(await raindropError(response, fallback));
    }
    return response;
  }
}

/** Find the first ordinary web link, skipping hashtags and links back to the viewer's instance. */
export function firstExternalLink(content: string, instanceUrl: string): string | null {
  const instanceOrigin = safeOrigin(instanceUrl || location.origin);
  const doc = new DOMParser().parseFromString(content, 'text/html');
  for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = anchor.getAttribute('href');
    if (!href || anchor.classList.contains('hashtag')) continue;
    try {
      const url = new URL(href, instanceOrigin ?? location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (/^\/tags?\/[^/?#]+\/?$/i.test(url.pathname)) continue;
      if (instanceOrigin && url.origin === instanceOrigin) continue;
      return url.toString();
    } catch {
      // Malformed links are not bookmark targets.
    }
  }
  return null;
}

/**
 * Read the unscoped token, migrating the signed-in account's old per-account one
 * up to it if that is all there is.
 *
 * Raindrop used to store under `scopedKey(TOKEN_KEY_BASE)`. Without this, every
 * existing user would silently look disconnected and have to go find their Test
 * token again. The old key is left in place rather than deleted: another account
 * in this browser may still be holding the only copy of *its* token there, and
 * whichever one signs in next adopts it the same way. `disconnect()` clears
 * both, so forgetting still means forgetting.
 */
function adoptScopedToken(key: string): StoredRaindropToken | null {
  const current = readToken(key);
  if (current) {
    return current;
  }
  const legacy = readToken(scopedKey(key));
  if (legacy) {
    localStorage.setItem(key, JSON.stringify(legacy));
  }
  return legacy;
}

function readToken(key: string): StoredRaindropToken | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(key) ?? 'null',
    ) as Partial<StoredRaindropToken> | null;
    if (typeof parsed?.accessToken !== 'string' || !parsed.accessToken) {
      return null;
    }
    const stored = ensureStamped(key, {
      accessToken: parsed.accessToken,
      connectedAt: parsed.connectedAt,
    });
    // Expiry is *not* decided here any more. This function has no injector and
    // so cannot ask whether the token is vaulted, and dropping it unconditionally
    // would delete the plaintext of a vaulted token while reporting it as never
    // connected — the resurrection bug from the other direction. `enforceLifetime`
    // owns the decision, and it can tell lock from disconnect.
    return stored;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function plainText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}

async function raindropError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as RaindropErrorResponse;
    return body.errorMessage ?? (typeof body.error === 'string' ? body.error : fallback);
  } catch {
    return fallback;
  }
}
