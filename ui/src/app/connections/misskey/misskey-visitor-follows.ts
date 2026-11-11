import { computed, Injectable, signal } from '@angular/core';
import { MK_VISITOR_FOLLOWS_KEY, misskeyOrigin } from './misskey-identity-store';

export { MK_VISITOR_FOLLOWS_KEY };
/** Like Anonymous: enough for a real feed, small enough to page from a browser. */
export const MISSKEY_VISITOR_FOLLOW_LIMIT = 50;

export interface MisskeyVisitorFollow {
  /** `username@host`, lowercase: one person, whichever server they were found through. */
  key: string;
  /** The server that knows {@link userId}: where the visitor followed them from. */
  server: string;
  /** The user's id on {@link server}. Ids are per server. */
  userId: string;
  username: string;
  /** The user's own host (theirs, not {@link server}'s, for a remote user). */
  host: string;
  name: string | null;
  avatarUrl: string | null;
  followedAt: string;
}

/** What following needs to know about a user, as `users/show` describes them. */
export interface MisskeyFollowTarget {
  id: string;
  username: string;
  host?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

/** `username@host` for a user read through `server` (a null host is that server's). */
export function misskeyFollowKey(target: MisskeyFollowTarget, server: string): string {
  let host = target.host ?? null;
  if (!host) {
    try {
      host = new URL(server).host;
    } catch {
      host = server;
    }
  }
  return `${target.username}@${host}`.toLowerCase();
}

function isFollow(value: unknown): value is MisskeyVisitorFollow {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw['key'] === 'string' &&
    typeof raw['server'] === 'string' &&
    !!misskeyOrigin(raw['server']) &&
    typeof raw['userId'] === 'string' &&
    raw['userId'].length > 0 &&
    typeof raw['username'] === 'string' &&
    typeof raw['host'] === 'string'
  );
}

function load(): MisskeyVisitorFollow[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MK_VISITOR_FOLLOWS_KEY) ?? 'null');
    return Array.isArray(parsed)
      ? parsed.filter(isFollow).slice(0, MISSKEY_VISITOR_FOLLOW_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/**
 * Who the Misskey visitor follows. There is no account on the server to
 * follow from, so a follow is a bookmark of a user that Home's Following
 * timeline reads with `users/notes`, through the server it was found on.
 *
 * Unscoped: there is one visitor per browser, and changing the visited server
 * must not lose these.
 */
@Injectable({ providedIn: 'root' })
export class MisskeyVisitorFollows {
  private state = signal<MisskeyVisitorFollow[]>(load());

  readonly follows = this.state.asReadonly();
  readonly count = computed(() => this.state().length);

  isFollowing(target: MisskeyFollowTarget, server: string): boolean {
    const key = misskeyFollowKey(target, server);
    return this.state().some((follow) => follow.key === key);
  }

  /** Follow; false when the list is full. Following twice is a no-op. */
  follow(target: MisskeyFollowTarget, server: string): boolean {
    const key = misskeyFollowKey(target, server);
    if (this.state().some((follow) => follow.key === key)) return true;
    if (this.count() >= MISSKEY_VISITOR_FOLLOW_LIMIT) return false;
    const origin = misskeyOrigin(server) ?? server;
    this.persist([
      ...this.state(),
      {
        key,
        server: origin,
        userId: target.id,
        username: target.username,
        host: key.slice(key.lastIndexOf('@') + 1),
        name: target.name ?? null,
        avatarUrl: target.avatarUrl ?? null,
        followedAt: new Date().toISOString(),
      },
    ]);
    return true;
  }

  unfollow(target: MisskeyFollowTarget, server: string): void {
    const key = misskeyFollowKey(target, server);
    this.persist(this.state().filter((follow) => follow.key !== key));
  }

  clear(): void {
    this.persist([]);
  }

  private persist(follows: MisskeyVisitorFollow[]): void {
    this.state.set(follows);
    try {
      if (follows.length) localStorage.setItem(MK_VISITOR_FOLLOWS_KEY, JSON.stringify(follows));
      else localStorage.removeItem(MK_VISITOR_FOLLOWS_KEY);
    } catch {
      // Still followed for this visit.
    }
  }
}
