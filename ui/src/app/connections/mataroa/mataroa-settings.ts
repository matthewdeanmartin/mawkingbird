import { PLATFORM_CONNECTORS } from '../../platform/http/platform-http';
import { isNativeConnectorHandle } from '../../platform/http/connector-types';
import { computed, inject, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../platform/session/account-scope';
import { ProfileAccountKey } from '../../accounts/mawkingbird/profile-account-key';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { reconcileScalar, type VaultReconcileOutcome } from '../vault/vault-reconcile';
import {
  credentialExpiresAt,
  ensureStamped,
  ExpiringConnection,
  ExpiringCredential,
  stampCredential,
} from '../credential-lifetime';

const STORAGE_KEY_BASE = 'mockingbird_mataroa_connection';

export interface MataroaConnection extends ExpiringCredential {
  apiKey: string;
  blogUrl: string;
}

function load(key: string, native = false): MataroaConnection | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<MataroaConnection>;
    if (!parsed || typeof parsed.apiKey !== 'string' || typeof parsed.blogUrl !== 'string') {
      return null;
    }
    if (native && !isNativeConnectorHandle(parsed.apiKey)) {
      localStorage.removeItem(key);
      return null;
    }
    return ensureStamped(key, {
      apiKey: parsed.apiKey,
      // An `includeInProfile` written by older versions is ignored: blogs are
      // no longer mixed into your own profile.
      blogUrl: normalizeBlogUrl(parsed.blogUrl),
      connectedAt: parsed.connectedAt,
    });
  } catch {
    return null;
  }
}

/** One Mataroa blog linked to the current Mawkingbird account. */
@Injectable({ providedIn: 'root' })
export class MataroaSettings implements ExpiringConnection {
  private native = inject(PLATFORM_CONNECTORS);
  private bridge = inject(VaultBridge);
  private accountKey = inject(ProfileAccountKey);
  private readonly storageKey = scopedKey(STORAGE_KEY_BASE);
  private readonly connection = signal<MataroaConnection | null>(
    load(this.storageKey, !!this.native),
  );

  /**
   * Connected, but the credential is not in this browser right now.
   *
   * Set when local retention expired a vaulted connection. Rendered as locked
   * rather than disconnected — see `VaultBridge.verdictFor`.
   */
  readonly needsFetch = signal(false);

  readonly connected = computed(() => this.connection() !== null);
  readonly blogUrl = computed(() => this.connection()?.blogUrl ?? null);
  readonly feedUrl = computed(() => {
    const blogUrl = this.blogUrl();
    return blogUrl ? new URL('rss/', blogUrl).toString() : null;
  });
  connect(apiKey: string, blogUrl: string): void | Promise<void> {
    if (this.native) return this.connectNative(apiKey, blogUrl);
    const key = apiKey.trim();
    if (!key) {
      throw new Error('Paste your Mataroa API key.');
    }
    const next = stampCredential({
      apiKey: key,
      blogUrl: normalizeBlogUrl(blogUrl),
    });
    localStorage.setItem(this.storageKey, JSON.stringify(next));
    this.connection.set(next);
    this.needsFetch.set(false);
    // The whole record, not just the key: the blog URL is part of what makes the
    // credential usable, and re-pasting a key without it would still leave the
    // connector unconfigured on the second device.
    void this.bridge.writeThrough(
      STORAGE_KEY_BASE,
      JSON.stringify(next),
      this.accountKey.current(),
    );
  }

  /**
   * The connection, falling back to the vault on a local miss.
   *
   * `localStorage` first, always — this connector worked before the vault
   * existed and must keep working with it locked or absent.
   */
  resolve(): MataroaConnection | null {
    const local = this.connection();
    if (local) {
      return local;
    }
    if (this.native) return null;
    const fromVault = this.bridge.readThrough(STORAGE_KEY_BASE, this.accountKey.current());
    if (!fromVault) {
      return null;
    }
    const parsed = parseConnection(fromVault);
    if (parsed) {
      localStorage.setItem(this.storageKey, JSON.stringify(parsed));
      this.connection.set(parsed);
      this.needsFetch.set(false);
    }
    return parsed;
  }

  /** Disconnect here and remove the stored copy, so it cannot come back. */
  private async connectNative(apiKey: string, blogUrl: string): Promise<void> {
    const blog = normalizeBlogUrl(blogUrl);
    const previous = this.connection()?.apiKey;
    const handle = await this.native!.connect('mataroa', apiKey.trim(), previous);
    const next = stampCredential({ apiKey: handle, blogUrl: blog });
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(next));
    } catch (error) {
      if (!previous) await this.native!.forget(handle);
      throw error;
    }
    this.connection.set(next);
    this.needsFetch.set(false);
  }

  disconnect(): void | Promise<void> {
    if (this.native) return this.disconnectNative();
    void this.bridge.removeThrough(STORAGE_KEY_BASE, this.accountKey.current());
    this.forgetLocally();
    this.needsFetch.set(false);
  }

  private async disconnectNative(): Promise<void> {
    const handle = this.connection()?.apiKey;
    if (handle) await this.native!.forget(handle);
    this.forgetLocally();
    this.needsFetch.set(false);
  }

  /** Clear the local plaintext only. The vault copy, if any, survives. */
  private forgetLocally(): void {
    localStorage.removeItem(this.storageKey);
    this.connection.set(null);
  }

  /** Push the current connection to the vault and report what happened. */
  async syncToVault(): Promise<SyncOutcome> {
    if (this.native) return { kind: 'skipped' };
    const current = this.connection();
    return current
      ? this.bridge.writeThrough(
          STORAGE_KEY_BASE,
          JSON.stringify(current),
          this.accountKey.current(),
        )
      : { kind: 'skipped' };
  }

  /** Reconcile the self-contained blog record without replacing two non-empty copies. */
  reconcileVault(): Promise<VaultReconcileOutcome> {
    if (this.native) return Promise.resolve({ kind: 'skipped' });
    const current = this.connection();
    return reconcileScalar({
      local: current ? JSON.stringify(current) : null,
      remote: this.bridge.readThrough(STORAGE_KEY_BASE, this.accountKey.current()),
      restore: (raw) => {
        const parsed = parseConnection(raw);
        if (!parsed) {
          return false;
        }
        localStorage.setItem(this.storageKey, JSON.stringify(parsed));
        this.connection.set(parsed);
        this.needsFetch.set(false);
        return true;
      },
      store: () => this.syncToVault(),
      conflictMessage:
        'Mataroa has different non-empty connections here and in Mawkingbird; neither copy was replaced.',
    });
  }

  expiresAt(): number | null {
    if (this.native) return null;
    return credentialExpiresAt(this.connection()?.connectedAt);
  }

  /**
   * Apply the local retention policy: lock if vaulted, disconnect otherwise.
   */
  enforceLifetime(): void {
    if (this.native) return;
    const current = this.connection();
    if (!current) {
      return;
    }
    const verdict = this.bridge.verdictFor(STORAGE_KEY_BASE, current.connectedAt);
    if (verdict.kind === 'disconnect') {
      this.disconnect();
    } else if (verdict.kind === 'lock') {
      this.forgetLocally();
      this.needsFetch.set(true);
    }
  }
}

/** Parse a connection read back out of the vault. */
function parseConnection(raw: string): MataroaConnection | null {
  try {
    const parsed = JSON.parse(raw) as MataroaConnection;
    return typeof parsed?.apiKey === 'string' && typeof parsed?.blogUrl === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function normalizeBlogUrl(value: string): string {
  const raw = value.trim();
  if (!raw) {
    throw new Error('Enter your public Mataroa blog address.');
  }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error('Enter a valid public blog address.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The blog address must start with https:// or http://.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}
