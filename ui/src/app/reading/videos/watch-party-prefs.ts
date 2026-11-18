import { Injectable, signal, WritableSignal } from '@angular/core';

const PREFS_KEY = 'mockingbird_watch_party';

/** Compact is the IRC/AOL one-line chat; cards is the full post card per message. */
export type PartyView = 'compact' | 'cards';
/**
 * Which conversation the chat shows: the video post's replies, the party
 * hashtags, both, or (Native) the video's own YouTube comments, read-only.
 * Chosen per visit from how Watch was opened, not stored (spec/youtube-client.md).
 */
export type PartyMode = 'replies' | 'hashtag' | 'both' | 'youtube';
/**
 * How the chat asks for new messages. `stream` uses the server's hashtag
 * stream where one is available and polls everything else every 15 seconds;
 * the poll settings never open a stream; `manual` only fetches on Refresh.
 */
export type PartyRefresh = 'stream' | 'poll5' | 'poll15' | 'poll60' | 'manual';

export const PARTY_REFRESH_SECONDS: Record<PartyRefresh, number | null> = {
  stream: 15,
  poll5: 5,
  poll15: 15,
  poll60: 60,
  manual: null,
};

const VIEWS: readonly PartyView[] = ['compact', 'cards'];
const REFRESHES: readonly PartyRefresh[] = ['stream', 'poll5', 'poll15', 'poll60', 'manual'];

interface Stored {
  view?: unknown;
  refresh?: unknown;
}

function read(): Stored {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return value && typeof value === 'object' ? (value as Stored) : {};
  } catch {
    return {};
  }
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * The watch party chat's view and refresh choices. These are about how
 * the reader likes to watch rather than about any one account, so they are
 * kept in one device-wide key.
 */
@Injectable({ providedIn: 'root' })
export class WatchPartyPrefs {
  private readonly stored = read();
  readonly view = signal<PartyView>(pick(this.stored.view, VIEWS, 'compact'));
  readonly refresh = signal<PartyRefresh>(pick(this.stored.refresh, REFRESHES, 'stream'));

  setView(view: PartyView): void {
    this.save(this.view, view);
  }
  setRefresh(refresh: PartyRefresh): void {
    this.save(this.refresh, refresh);
  }

  private save<T>(target: WritableSignal<T>, value: T): void {
    target.set(value);
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ view: this.view(), refresh: this.refresh() }),
      );
    } catch {
      // The choice still holds for this page load without storage.
    }
  }
}
