import { signal } from '@angular/core';
import { firstValueFrom, Observable, Subject, takeUntil, timeout } from 'rxjs';
import { Status } from '../../models';

export interface AudioPointer {
  id: string;
  date: string;
  title: string;
  unavailable?: boolean;
}
export interface AudioCatalogueData {
  version: 1;
  posts: AudioPointer[];
  cursor?: string;
  newest?: string;
  exhausted: boolean;
  scanned: number;
  refresh?: { boundary: string; cursor?: string; newest?: string };
}

/** Only references and scan checkpoints are durable; media bytes and URLs are not. */
export class AudioCatalogue {
  readonly data = signal<AudioCatalogueData>({
    version: 1,
    posts: [],
    exhausted: false,
    scanned: 0,
  });
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly retryAt = signal(0);
  private cancelRequest = new Subject<void>();
  private generation = 0;

  constructor(private readonly save: (data: AudioCatalogueData) => void) {}

  restore(raw: string | null): void {
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as AudioCatalogueData;
      if (
        d.version !== 1 ||
        !Array.isArray(d.posts) ||
        !Number.isFinite(d.scanned) ||
        typeof d.exhausted !== 'boolean' ||
        [d.cursor, d.newest, d.refresh?.boundary, d.refresh?.cursor, d.refresh?.newest].some(
          (v) => v !== undefined && typeof v !== 'string',
        ) ||
        d.posts.some(
          (p) =>
            !p ||
            typeof p.id !== 'string' ||
            typeof p.title !== 'string' ||
            typeof p.date !== 'string',
        )
      )
        return;
      this.data.set(d);
    } catch {
      /* A malformed cache can be rebuilt. */
    }
  }

  remember(post: Status): void {
    if (!post.media_attachments.some((m) => m.type === 'audio')) return;
    const pointer = {
      id: post.id,
      date: post.created_at,
      title:
        post.spoiler_text ||
        post.media_attachments.find((m) => m.type === 'audio')?.description ||
        post.created_at,
    };
    this.commit({
      ...this.data(),
      posts: [pointer, ...this.data().posts.filter((p) => p.id !== post.id)],
    });
  }

  unavailable(id: string): void {
    this.commit({
      ...this.data(),
      posts: this.data().posts.map((p) => (p.id === id ? { ...p, unavailable: true } : p)),
    });
  }

  cancel(): void {
    this.generation++;
    this.cancelRequest.next();
    this.loading.set(false);
  }

  async scan(fetch: (cursor?: string) => Observable<Status[]>, refresh = false): Promise<void> {
    if (this.loading() || Date.now() < this.retryAt()) return;
    let d = this.data();
    if (refresh && !d.newest && d.exhausted) {
      this.commit({ ...d, exhausted: false, cursor: undefined });
      d = this.data();
    }
    if (refresh && d.newest && !d.refresh) {
      this.commit({ ...d, refresh: { boundary: d.newest } });
      d = this.data();
    }
    if (d.exhausted && !d.refresh) return;
    const generation = ++this.generation;
    this.failed.set(false);
    this.loading.set(true);
    try {
      // Explicit batches bound API cost. Both history and refresh checkpoints survive reloads.
      for (let page = 0; page < 10; page++) {
        d = this.data();
        const cursor = d.refresh ? d.refresh.cursor : d.cursor;
        const posts = await firstValueFrom(
          fetch(cursor).pipe(timeout(30_000), takeUntil(this.cancelRequest)),
        );
        if (generation !== this.generation) return;
        const boundary = d.refresh?.boundary;
        const index = boundary ? posts.findIndex((p) => p.id === boundary) : -1;
        const fresh = index < 0 ? posts : posts.slice(0, index);
        const pointers = new Map(d.posts.map((p) => [p.id, p]));
        for (const post of fresh) {
          if (post.media_attachments.some((m) => m.type === 'audio')) {
            pointers.set(post.id, {
              id: post.id,
              date: post.created_at,
              title:
                post.spoiler_text ||
                post.media_attachments.find((m) => m.type === 'audio')?.description ||
                post.created_at,
            });
          }
        }
        const next = posts.at(-1)?.id;
        const end = !next || next === cursor || index >= 0;
        const newest = d.refresh?.newest || d.newest || posts[0]?.id;
        this.commit({
          ...d,
          posts: [...pointers.values()].sort((a, b) => b.date.localeCompare(a.date)),
          scanned: d.scanned + fresh.length,
          ...(d.refresh
            ? {
                newest: end ? d.refresh.newest || posts[0]?.id || d.newest : d.newest,
                refresh: end
                  ? undefined
                  : { ...d.refresh, cursor: next, newest: d.refresh.newest || posts[0]?.id },
              }
            : { cursor: next, newest, exhausted: end }),
        });
        if (end) break;
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.failed.set(true);
      const response = error as { status?: number; headers?: { get(name: string): string | null } };
      if (response.status === 429) {
        const retry = response.headers?.get('Retry-After');
        const seconds = retry ? Number(retry) : NaN;
        const date = retry ? Date.parse(retry) : NaN;
        this.retryAt.set(
          Number.isFinite(seconds)
            ? Date.now() + Math.max(1, seconds) * 1000
            : Number.isFinite(date)
              ? date
              : Date.now() + 60_000,
        );
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  private commit(data: AudioCatalogueData): void {
    this.data.set(data);
    this.save(data);
  }
}
