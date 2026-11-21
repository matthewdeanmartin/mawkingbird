import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { BSKY_MODERATION_DID } from './bluesky-moderation-state';
import { BlueskyPds } from './bluesky-pds';

/** Bluesky's moderation service answers the inbox calls; the PDS proxies them. */
const MOD_PROXY = `${BSKY_MODERATION_DID}#atproto_labeler`;

/** One report the reader filed (`tools.ozone.inbox.listReports#reportView`). */
export interface BskyInboxReport {
  id: number;
  status?: string;
  reasonType?: string;
  reason?: string;
  createdAt: string;
  updatedAt?: string;
  lastActionTaken?: string;
  subject?: { $type?: string; uri?: string; did?: string };
}

/** The account's standing with Bluesky's moderators (`getAccountStatus`). */
export interface BskyAccountStanding {
  standing?: string;
  expiresAt?: string;
  updatedAt?: string;
}

/**
 * Bluesky's moderation inbox, read-only: the reports the reader filed and
 * what happened to them, and the account's standing. Calls go to the
 * account's own PDS, which proxies them to Bluesky's moderation service, as
 * bsky.app does (spec/bsky_parity.md, sprint 5). Appeals stay on bsky.app.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyModerationInbox {
  private api = inject(BlueskyApi);
  private pds = inject(BlueskyPds);

  async reports(cursor: string | null = null): Promise<{
    reports: BskyInboxReport[];
    cursor: string | null;
  }> {
    let params = new HttpParams().set('limit', '50');
    if (cursor) params = params.set('cursor', cursor);
    const page = await this.call<{ reports?: BskyInboxReport[]; cursor?: string }>(
      'tools.ozone.inbox.listReports',
      params,
    );
    const reports = page.reports ?? [];
    return { reports, cursor: reports.length && page.cursor ? page.cursor : null };
  }

  async standing(): Promise<BskyAccountStanding> {
    return this.call<BskyAccountStanding>('tools.ozone.inbox.getAccountStatus', new HttpParams());
  }

  private async call<T>(nsid: string, params: HttpParams): Promise<T> {
    const pds = await firstValueFrom(this.pds.resolve());
    return firstValueFrom(
      this.api.get<T>(nsid, params, { 'atproto-proxy': MOD_PROXY }, pds || undefined),
    );
  }
}
