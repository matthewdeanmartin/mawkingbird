import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, timeout } from 'rxjs';
import { Status, TrendLink } from '../models';
import { ServerFeedKind } from '../lists/list-source';
import { otherServerHost } from '../other-server-url';
import { adaptAnonymousStatus } from './anonymous/anonymous-mastodon-provider';
import { externalFetch } from './external-fetch';

/** Public reads from one explicitly selected instance; never changes the active server. */
@Injectable({ providedIn: 'root' })
export class OtherServerFeeds {
  private http = inject(HttpClient);

  private origin(host: string): string {
    const normalized = otherServerHost(host);
    if (!normalized) throw new Error('Invalid server host');
    return `https://${normalized}`;
  }

  statuses(host: string, feed: ServerFeedKind, maxId?: string): Observable<Status[]> {
    const origin = this.origin(host);
    const timeline = feed === 'local' || feed === 'federated';
    const path = timeline ? '/api/v1/timelines/public' : '/api/v1/trends/statuses';
    let params = new HttpParams().set('limit', 20);
    if (feed === 'local') params = params.set('local', true);
    if (maxId && timeline) params = params.set('max_id', maxId);
    return this.http.get<Status[]>(`${origin}${path}`, { params, context: externalFetch() }).pipe(
      timeout(8000),
      map((statuses) => statuses.map((status) => adaptAnonymousStatus(status, origin))),
    );
  }

  news(host: string): Observable<TrendLink[]> {
    return this.http
      .get<TrendLink[]>(`${this.origin(host)}/api/v1/trends/links`, {
        context: externalFetch(),
      })
      .pipe(timeout(8000));
  }
}
