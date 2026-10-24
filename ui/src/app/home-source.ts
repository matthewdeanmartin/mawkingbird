import { HomeTopics } from './home-topics';
import { inject, Injectable, Injector, signal } from '@angular/core';
import { catchError, defer, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';
import { Api } from './api';
import { HomeAlgoSettings } from './home-algo-settings';
import { Status } from './models';
import { statusHashtags } from './hashtag';
import { byNewestFirst } from './status-sort';

export function matchesInterest(status: Status, interests: readonly string[]): boolean {
  const terms = new Set(
    interests.map((t) => t.replace(/^#/, '').normalize('NFKC').toLocaleLowerCase()),
  );
  if (statusHashtags(status).some((t) => terms.has(t.toLocaleLowerCase()))) return true;
  const target = status.reblog ?? status;
  const doc = new DOMParser().parseFromString(target.content, 'text/html');
  const text = `${target.spoiler_text ?? ''} ${doc.body.textContent ?? ''}`
    .normalize('NFKC')
    .toLocaleLowerCase();
  return (text.match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []).some((word) => terms.has(word));
}

/** One Home instance owns its cursors. No searches or provider interweaving in favorite mode. */
@Injectable()
export class HomeSource {
  readonly settings = inject(HomeAlgoSettings);
  private injector = inject(Injector);
  private api = inject(Api);
  private topics = inject(HomeTopics);
  readonly hasMore = signal(true);
  readonly error = signal(false);
  readonly tags = signal<string[]>([]);
  private cursor: string | null = null;
  private tagsReady: Promise<void> | null = null;
  private tagCursors = new Map<string, string | null>();
  private nextTag = 0;
  private generation = 0;
  reset(): void {
    this.generation++;
    this.error.set(false);
    this.cursor = null;
    this.hasMore.set(true);
    this.tagsReady = null;
    this.tags.set([]);
    this.tagCursors.clear();
    this.nextTag = 0;
  }
  private async catalog() {
    const { HomeFeedCatalog } = await import('./home-feed-catalog');
    return this.injector.get(HomeFeedCatalog);
  }
  private ready(): Promise<void> {
    const generation = this.generation;
    return (this.tagsReady ??= this.topics
      .followed()
      .then((tags) => {
        if (generation !== this.generation) throw new Error('Superseded Home load');
        this.tags.set(tags);
        for (const tag of tags) this.tagCursors.set(tag, null);
      })
      .catch((error) => {
        if (generation === this.generation) this.tagsReady = null;
        throw error;
      }));
  }
  page(home: () => Observable<Status[]>): Observable<Status[]> {
    this.error.set(false);
    return this.fetchPage(home).pipe(
      catchError((error) => {
        this.error.set(true);
        return throwError(() => error);
      }),
    );
  }
  private fetchPage(home: () => Observable<Status[]>): Observable<Status[]> {
    if (this.settings.value().mode === 'favorite') {
      const feed = this.settings.value().favorite;
      if (!feed) {
        this.hasMore.set(false);
        return throwError(() => new Error('Choose a favorite feed'));
      }
      return defer(() => this.catalog()).pipe(
        switchMap((c) => c.page(feed, this.cursor)),
        map((page) => {
          this.cursor = page.cursor;
          this.hasMore.set(page.cursor !== null);
          return page.posts;
        }),
      );
    }
    if (this.settings.value().mode !== 'interests') return home();
    return defer(() => this.ready()).pipe(
      switchMap(() => {
        // A bounded round-robin: later tags get their first page before earlier tags page again.
        const remaining = [...this.tagCursors.keys()];
        const selected = Array.from(
          { length: Math.min(4, remaining.length) },
          (_, i) => remaining[(this.nextTag + i) % remaining.length],
        );
        this.nextTag += selected.length;
        return forkJoin({
          home: home(),
          tags: selected.length
            ? forkJoin(
                selected.map((tag) =>
                  this.api.tagTimeline(tag, this.tagCursors.get(tag) ?? undefined).pipe(
                    map((posts) => {
                      const last = posts.at(-1)?.id;
                      if (posts.length < 20 || !last || last === this.tagCursors.get(tag))
                        this.tagCursors.delete(tag);
                      else this.tagCursors.set(tag, last);
                      return posts;
                    }),
                    catchError(() => {
                      this.error.set(true);
                      this.tagCursors.delete(tag);
                      return of([] as Status[]);
                    }),
                  ),
                ),
              )
            : of([] as Status[][]),
        });
      }),
      map((result) => {
        this.hasMore.set(this.tagCursors.size > 0);
        const seen = new Set<string>();
        return [
          ...result.home.filter((s) => matchesInterest(s, this.tags())),
          ...result.tags.flat(),
        ]
          .filter((s) => {
            const target = s.reblog ?? s;
            const key = target.url || `${target.provider}:${target.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort(byNewestFirst);
      }),
    );
  }
}
