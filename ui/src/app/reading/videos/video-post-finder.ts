import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Status } from '../../platform/api/models';
import { statusVideo } from '../video-player/media-source';

const LIMIT = 20;

/** Newest first, once each, and only posts whose video really is `videoId`. */
export function postsAboutVideo(pages: Status[][], videoId: string): Status[] {
  const byKey = new Map<string, Status>();
  for (const status of pages.flat()) {
    const post = status.reblog ?? status;
    const key = post.url || post.id;
    if (!byKey.has(key) && statusVideo(post)?.videoId === videoId) byKey.set(key, post);
  }
  return [...byKey.values()]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, LIMIT);
}

/**
 * Posts on the reader's server that share a YouTube video, so a bare video
 * (`/watch?youtube=`) can become a replies conversation. Mastodon has no
 * "posts linking X" query for every link: the link timeline (4.3+) answers
 * only for links the server is trending, and post search is often limited to
 * posts you interacted with. Both are asked; a failure of either is empty.
 */
@Injectable({ providedIn: 'root' })
export class VideoPostFinder {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);

  /** Needs a Mastodon account: Anonymous and Bluesky sessions have neither query. */
  available(): boolean {
    return this.auth.kind() === 'mastodon' && !this.auth.isAnonymous;
  }

  find(videoId: string): Observable<Status[]> {
    if (!/^[\w-]{11}$/.test(videoId) || !this.available()) return of([]);
    const quiet = (request: Observable<Status[]>) => request.pipe(catchError(() => of([])));
    return forkJoin([
      quiet(this.api.linkTimeline(`https://www.youtube.com/watch?v=${videoId}`)),
      quiet(this.api.linkTimeline(`https://youtu.be/${videoId}`)),
      quiet(
        this.api
          .search(`youtu.be/${videoId}`, 'statuses', { limit: LIMIT })
          .pipe(map((results) => results.statuses)),
      ),
      quiet(this.api.search(videoId, 'statuses', { limit: LIMIT }).pipe(map((r) => r.statuses))),
    ]).pipe(map((pages) => postsAboutVideo(pages, videoId)));
  }
}
