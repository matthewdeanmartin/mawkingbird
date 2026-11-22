import { inject, Injectable } from '@angular/core';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { ReadMarkers } from '../home/read-markers';

const KEY = 'mockingbird_inbox_seen_v1';

/**
 * When the inbox was last read, for the digest's "+N since you last looked".
 *
 * Mastodon keeps a notifications read marker on the server, so the answer
 * agrees across devices; its `updated_at` is when the reader last read the
 * list. Bluesky, Misskey and older servers have none, so this device also
 * remembers when the inbox was opened, per account.
 */
@Injectable({ providedIn: 'root' })
export class InboxSeen {
  private readonly markers = inject(ReadMarkers);

  /**
   * The previous visit's time (ms), then records this visit. Null on a first
   * visit: with nothing to compare against, nothing is called new.
   */
  async previousVisit(): Promise<number | null> {
    const key = KEY + accountScopeSuffix();
    let local: number | null = null;
    try {
      const raw = localStorage.getItem(key);
      local = raw ? Date.parse(raw) : null;
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      // Storage blocked: the server marker, if any, still answers.
    }
    const server = (await this.markers.refresh())?.notifications?.updated_at;
    const serverTime = server ? Date.parse(server) : NaN;
    if (!Number.isNaN(serverTime)) return serverTime;
    return local !== null && !Number.isNaN(local) ? local : null;
  }
}
