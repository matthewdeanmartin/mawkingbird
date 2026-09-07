import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  credentialExpired,
  credentialExpiresAt,
  ExpiringConnection,
  ExpiringCredential,
  stampCredential,
} from '../credential-lifetime';
import { externalFetch } from '../external-fetch';

const KEY_BASE = 'mockingbird_pastepile_key';
const SITE = 'https://www.pastepile.com';

/**
 * Turn a failed key mint into something actionable.
 *
 * Pastepile reports errors as `{"error":{"code","message"}}`, and its messages
 * are genuinely useful — the daily key cap says "try again tomorrow", which a
 * generic failure string would throw away.
 */
function describeKeyError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message: unknown = error.error?.error?.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    if (error.status === 429) {
      return 'Pastepile is rate-limiting new keys from this network (5 per day). Try again tomorrow.';
    }
    if (error.status === 0) {
      return "Couldn't reach Pastepile to get a key. Check your connection and try again.";
    }
    return `Pastepile answered ${error.status} when asked for a key.`;
  }
  return error instanceof Error ? error.message : 'Could not get a key from Pastepile.';
}

/** What `POST /api/keys` hands back. Both secrets are shown exactly once. */
interface MintedKey {
  key: string;
  revocation_secret: string;
  prefix: string;
  plan: string;
}

interface StoredPastepileKey extends ExpiringCredential {
  apiKey: string;
  /** Needed to revoke the key later; the server keeps only its hash. */
  revocationSecret: string;
  prefix: string;
  plan: string;
}

function load(): StoredPastepileKey | null {
  try {
    const raw = localStorage.getItem(KEY_BASE);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof (parsed as StoredPastepileKey).apiKey === 'string'
      ? (parsed as StoredPastepileKey)
      : null;
  } catch {
    return null;
  }
}

/**
 * An optional Pastepile API key — the thing that makes the paste feed worth
 * having.
 *
 * Pastepile works fully without one, so this is never required. What a key buys
 * is the loop that justifies a public feed at all: pastes created with it become
 * listable under `?scope=mine`, *including unlisted ones*, so you can post
 * something and then actually see your own paste in your timeline. A feed you
 * cannot post into is just strangers' content.
 *
 * Keys are free and need no account — `POST /api/keys` mints one on the spot,
 * which is why {@link mint} exists rather than a "paste your key here" field
 * that would send people off to a signup form that does not exist.
 *
 * Stored **unscoped**, shared by every account in this browser: like the
 * OpenRouter and Raindrop credentials, this authorises the browser to talk to a
 * service and says nothing about which Mastodon persona you are. Which feeds a
 * persona *subscribes* to stays per-account in `PasteFeedSubscriptions`.
 *
 * The revocation secret is kept alongside the key because the server stores only
 * hashes of both: discard it and the key can never be revoked, only abandoned.
 */
@Injectable({ providedIn: 'root' })
export class PastepileKey implements ExpiringConnection {
  private http = inject(HttpClient);
  private stored = signal<StoredPastepileKey | null>(load());

  readonly connected = signal(this.stored() !== null);

  /** The key itself, or null when none is set. */
  key(): string | null {
    return this.stored()?.apiKey ?? null;
  }

  /** Short non-secret identifier, safe to show in the UI. */
  prefix(): string | null {
    return this.stored()?.prefix ?? null;
  }

  /**
   * The key's plan. Matters because a **free** key rejects `expiry: "never"`
   * outright, while keyless anonymous requests allow it — see
   * `PastepileProvider.expiries`.
   */
  plan(): string | null {
    return this.stored()?.plan ?? null;
  }

  /** True when no-expiry pastes are allowed on this key's plan. */
  allowsNeverExpiry(): boolean {
    const plan = this.plan();
    return plan === 'pro' || plan === 'enterprise';
  }

  /**
   * Mint a fresh free key. No account, no signup — one POST.
   *
   * Pastepile caps key generation at 5 per day per IP, and answers 429 with a
   * `rate_limited` code. That is a normal outcome worth repeating verbatim
   * ("try again tomorrow" is actionable; "could not get a key" is not), so the
   * service's own message wins over anything invented here.
   */
  async mint(label = 'Mockingbird'): Promise<void> {
    let minted: MintedKey;
    try {
      minted = await firstValueFrom(
        this.http.post<MintedKey>(`${SITE}/api/keys`, { label }, { context: externalFetch() }),
      );
    } catch (error: unknown) {
      throw new Error(describeKeyError(error), { cause: error });
    }
    if (!minted?.key) {
      throw new Error('Pastepile did not return a key. Try again in a moment.');
    }
    this.persist({
      apiKey: minted.key,
      revocationSecret: minted.revocation_secret ?? '',
      prefix: minted.prefix ?? minted.key.slice(0, 12),
      plan: minted.plan ?? 'free',
    });
  }

  /** Adopt a key the user already holds (e.g. a Pro one from elsewhere). */
  connect(apiKey: string, plan = 'free'): void {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error('Paste a Pastepile API key, or generate a free one.');
    }
    this.persist({
      apiKey: trimmed,
      // A hand-pasted key brings no revocation secret; revoking it is then only
      // possible wherever it was originally minted.
      revocationSecret: '',
      prefix: trimmed.slice(0, 12),
      plan,
    });
  }

  /**
   * Forget the key, revoking it first when we hold the secret.
   *
   * Revocation is best-effort: a key the server no longer honours is strictly
   * better than one left live, but a network failure must not strand the user
   * with a credential they cannot remove locally.
   */
  async disconnect(): Promise<void> {
    const record = this.stored();
    if (record?.revocationSecret) {
      try {
        await firstValueFrom(
          this.http.post(
            `${SITE}/api/keys/revoke`,
            { revocation_secret: record.revocationSecret },
            { context: externalFetch() },
          ),
        );
      } catch {
        // Already revoked, or the network is down. Drop it locally regardless.
      }
    }
    this.forget();
  }

  /** Drop the local copy without contacting the service. */
  private forget(): void {
    try {
      localStorage.removeItem(KEY_BASE);
    } catch {
      // Nothing to remove when storage is unavailable.
    }
    this.stored.set(null);
    this.connected.set(false);
  }

  private persist(value: Omit<StoredPastepileKey, 'connectedAt'>): void {
    const record = stampCredential(value);
    try {
      localStorage.setItem(KEY_BASE, JSON.stringify(record));
    } catch {
      // Storage-disabled browsers keep the key for this session only.
    }
    this.stored.set(record);
    this.connected.set(true);
  }

  /** When this key ages out under the retention policy, or null. */
  expiresAt(): number | null {
    return credentialExpiresAt(this.stored()?.connectedAt);
  }

  /** Drop the key if it has outlived the retention policy. */
  enforceLifetime(): void {
    const record = this.stored();
    if (record && credentialExpired(record.connectedAt)) {
      // Local-only: an expiring retention window is about not hoarding the
      // secret here, not about destroying a key the user may use elsewhere.
      this.forget();
    }
  }
}
