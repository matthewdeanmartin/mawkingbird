import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { externalFetch } from '../external-fetch';
import { MisskeyApi } from './misskey-api';
import { misskeyOrigin, saveMisskeyIdentity } from './misskey-identity-store';

/**
 * Permissions asked for at sign-in (M2: reading and writing). Tokens from the
 * read-only M1 sign-in lack the `write:*` half and are re-approved once.
 * Not asked for: account settings, Drive deletion, admin, chat (M4), pages,
 * gallery, flash, notifications writes (marking read happens on reading).
 */
export const MISSKEY_PERMISSIONS = [
  'read:account',
  'read:following',
  'read:notifications',
  'read:reactions',
  'read:favorites',
  'read:mutes',
  'read:blocks',
  'read:channels',
  'read:drive',
  'write:notes',
  'write:reactions',
  'write:votes',
  'write:following',
  'write:mutes',
  'write:blocks',
  // M3: following channels from their feed page.
  'write:channels',
  'write:favorites',
  'write:drive',
  'write:report-abuse',
] as const;

/** Where a MiAuth round trip is remembered between leaving and coming back. */
export const MK_MIAUTH_PENDING_KEY = 'mockingbird_misskey_miauth_pending';

/** A pending sign-in older than this is ignored (the reader abandoned it). */
const PENDING_TTL_MS = 30 * 60 * 1000;

interface PendingMiAuth {
  session: string;
  server: string;
  adding: boolean;
  startedAt: number;
}

/** Why a server cannot be signed in to, as a code the page turns into copy. */
export type MisskeyServerProblem =
  'invalid-address' | 'unreachable' | 'mastodon' | 'fork' | 'not-misskey';

export class MisskeySignInError extends Error {
  constructor(
    readonly problem: MisskeyServerProblem | 'session-missing' | 'session-rejected',
    /** The software name NodeInfo reported, when that is the problem. */
    readonly software: string | null = null,
  ) {
    super(problem);
    this.name = 'MisskeySignInError';
  }
}

/** Software names that speak the Mastodon API and have their own sign-in door. */
const MASTODON_LIKE = new Set([
  'mastodon',
  'glitch',
  'hometown',
  'gotosocial',
  'pleroma',
  'akkoma',
]);

/**
 * Sign in with Misskey's own MiAuth flow.
 *
 * MiAuth needs no app registration: the client invents a session id, sends the
 * reader to `/miauth/<session>` on their server to approve, is sent back to the
 * callback with `?session=`, and exchanges the session for a token once. That
 * makes it work on every Misskey version, where Misskey's newer OAuth 2 needs a
 * published client page and a recent server.
 *
 * Only Misskey itself is accepted today (owner decision 2026-11-09). Forks
 * such as Sharkey speak the same API but are refused with a clear message
 * rather than a session that half works.
 */
@Injectable({ providedIn: 'root' })
export class MisskeyAuth {
  private http = inject(HttpClient);
  private api = inject(MisskeyApi);

  /** Check that `input` is a reachable Misskey server; resolves to its origin. */
  async checkServer(input: string): Promise<string> {
    const origin = misskeyOrigin(input.replace(/^@?[^@\s]+@/, ''));
    if (!origin) throw new MisskeySignInError('invalid-address');
    const software = await this.softwareName(origin);
    if (software === null) throw new MisskeySignInError('unreachable');
    if (software === 'misskey') return origin;
    if (MASTODON_LIKE.has(software)) throw new MisskeySignInError('mastodon', software);
    // Probe the Misskey API itself: a fork answers it, anything else does not.
    const speaksMisskey = await firstValueFrom(this.api.meta(origin)).then(
      () => true,
      () => false,
    );
    throw new MisskeySignInError(speaksMisskey ? 'fork' : 'not-misskey', software);
  }

  /** NodeInfo `software.name`, lowercased; null when NodeInfo is unreachable. */
  private async softwareName(origin: string): Promise<string | null> {
    try {
      const wellKnown = await firstValueFrom(
        this.http.get<{ links?: { rel?: string; href?: string }[] }>(
          `${origin}/.well-known/nodeinfo`,
          { context: externalFetch() },
        ),
      );
      const href = (wellKnown.links ?? [])
        .filter(
          (l) =>
            typeof l.href === 'string' &&
            /nodeinfo\.diaspora\.software\/ns\/schema\/2\./.test(l.rel ?? ''),
        )
        .map((l) => l.href as string)
        .sort()
        .pop();
      if (!href || misskeyOrigin(href) !== origin) return null;
      const info = await firstValueFrom(
        this.http.get<{ software?: { name?: string } }>(href, { context: externalFetch() }),
      );
      const name = info.software?.name;
      return typeof name === 'string' ? name.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /** The MiAuth approval URL for `origin`, remembering the round trip. */
  begin(origin: string, adding: boolean): string {
    const session = crypto.randomUUID();
    const pending: PendingMiAuth = { session, server: origin, adding, startedAt: Date.now() };
    sessionStorage.setItem(MK_MIAUTH_PENDING_KEY, JSON.stringify(pending));
    const callback = new URL('login/misskey', document.baseURI).href;
    const icon = new URL('android-chrome-192x192.png', document.baseURI).href;
    const params = new URLSearchParams({
      name: environment.brand,
      icon,
      callback,
      permission: MISSKEY_PERMISSIONS.join(','),
    });
    return `${origin}/miauth/${session}?${params.toString()}`;
  }

  /** The pending round trip for `session`, if this tab started it recently. */
  pending(session: string): PendingMiAuth | null {
    try {
      const raw = JSON.parse(
        sessionStorage.getItem(MK_MIAUTH_PENDING_KEY) ?? 'null',
      ) as PendingMiAuth | null;
      if (
        !raw ||
        raw.session !== session ||
        typeof raw.server !== 'string' ||
        Date.now() - raw.startedAt > PENDING_TTL_MS
      ) {
        return null;
      }
      return raw;
    } catch {
      return null;
    }
  }

  /**
   * Finish sign-in: exchange the session for a token and save the identity.
   * Resolves to the saved identity key and whether this was an "add account".
   */
  async complete(session: string): Promise<{ key: string; adding: boolean }> {
    const pending = this.pending(session);
    sessionStorage.removeItem(MK_MIAUTH_PENDING_KEY);
    if (!pending) throw new MisskeySignInError('session-missing');
    const result = await firstValueFrom(this.api.miauthCheck(pending.server, session));
    if (!result.ok) throw new MisskeySignInError('session-rejected');
    const key = saveMisskeyIdentity(
      {
        server: pending.server,
        userId: result.user.id,
        username: result.user.username,
        name: result.user.name,
        avatarUrl: result.user.avatarUrl,
        ...(result.user.emojis ? { emojis: result.user.emojis } : {}),
      },
      { token: result.token, connectedAt: Date.now(), permissions: [...MISSKEY_PERMISSIONS] },
    );
    return { key, adding: pending.adding };
  }
}
