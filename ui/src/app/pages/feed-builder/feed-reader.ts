import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { Status } from '../../models';
import { adaptAnonymousStatus } from '../../providers/anonymous/anonymous-mastodon-provider';
import { externalFetch } from '../../providers/external-fetch';
import { FeedPerson } from './feed-builder-data';

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * One public request each, read the way anonymous Home reads: no token, no
 * interceptors, posts adapted so they render and act as anonymous posts.
 * Shared by the topic pages' Preview and Flooding tabs.
 */

/** A hashtag's newest posts, from `server` (the anonymous reading server). */
export async function readTag(
  http: HttpClient,
  server: string,
  tag: string,
  limit: number,
): Promise<Status[]> {
  const statuses = await firstValueFrom(
    http
      .get<Status[]>(`${server}/api/v1/timelines/tag/${encodeURIComponent(tag)}`, {
        params: new HttpParams().set('limit', String(limit)),
        context: externalFetch(),
      })
      .pipe(timeout(REQUEST_TIMEOUT_MS)),
  );
  return statuses.map((status) => adaptAnonymousStatus(status, server));
}

/** A person's newest own posts, from their home server, by the id the page carries. */
export async function readPerson(
  http: HttpClient,
  person: FeedPerson,
  limit: number,
): Promise<Status[]> {
  const server = `https://${person.acct.split('@')[1]}`;
  const statuses = await firstValueFrom(
    http
      .get<Status[]>(`${server}/api/v1/accounts/${encodeURIComponent(person.id)}/statuses`, {
        params: new HttpParams()
          .set('limit', String(limit))
          .set('exclude_replies', 'true')
          .set('exclude_reblogs', 'true'),
        context: externalFetch(),
      })
      .pipe(timeout(REQUEST_TIMEOUT_MS)),
  );
  return statuses.map((status) => adaptAnonymousStatus(status, server));
}
