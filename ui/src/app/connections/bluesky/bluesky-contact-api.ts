import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { BskyProfile } from './bluesky-types';

/**
 * Bluesky's contact matching (`app.bsky.contact.*`). The reader proves a phone
 * number by SMS, which opens an import session; numbers sent with it are kept
 * by Bluesky as hashes, and a match only appears when both people imported
 * each other. `removeData` forgets all of it.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyContactApi {
  private api = inject(BlueskyApi);

  /** When the reader last imported, and how many matches that found; null if never. */
  async status(): Promise<{ syncedAt: string; matchesCount: number } | null> {
    const { syncStatus } = await firstValueFrom(
      this.api.get<{ syncStatus?: { syncedAt: string; matchesCount: number } }>(
        'app.bsky.contact.getSyncStatus',
        new HttpParams(),
      ),
    );
    return syncStatus ?? null;
  }

  async matches(): Promise<BskyProfile[]> {
    const { matches } = await firstValueFrom(
      this.api.get<{ matches: BskyProfile[] }>(
        'app.bsky.contact.getMatches',
        new HttpParams().set('limit', '100'),
      ),
    );
    return matches;
  }

  /** Text a code to the reader's own number (E.164). */
  async startVerification(phone: string): Promise<void> {
    await firstValueFrom(this.api.request('app.bsky.contact.startPhoneVerification', { phone }));
  }

  /** Check the code; the token it returns opens one import. */
  async verify(phone: string, code: string): Promise<string> {
    const { token } = await firstValueFrom(
      this.api.request<{ token: string }>('app.bsky.contact.verifyPhone', {
        phone,
        code: code.trim(),
      }),
    );
    return token;
  }

  /** Import numbers (E.164); resolves to the people they matched. */
  async importContacts(token: string, contacts: string[]): Promise<BskyProfile[]> {
    const { matchesAndContactIndexes } = await firstValueFrom(
      this.api.request<{ matchesAndContactIndexes: { match: BskyProfile }[] }>(
        'app.bsky.contact.importContacts',
        { token, contacts },
      ),
    );
    return matchesAndContactIndexes.map((entry) => entry.match);
  }

  async dismiss(did: string): Promise<void> {
    await firstValueFrom(this.api.request('app.bsky.contact.dismissMatch', { subject: did }));
  }

  /** Forget every stored hash, match and status. */
  async removeData(): Promise<void> {
    await firstValueFrom(this.api.request('app.bsky.contact.removeData', {}));
  }
}
