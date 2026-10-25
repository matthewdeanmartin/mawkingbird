import { signal } from '@angular/core';
import { firstValueFrom, Observable, Subject, takeUntil, timeout } from 'rxjs';
import { Status } from './models';
import { matchesMedia, SearchMediaType } from './media-query';

export interface MediaFeedPage {
  statuses: Status[];
  next: string | null;
}

/** A resumable, bounded scan. Cursors advance over raw posts, never filtered matches. */
export class MediaFeedScan {
  readonly posts = signal<Status[]>([]);
  readonly scanned = signal(0);
  readonly loading = signal(false);
  readonly exhausted = signal(false);
  readonly failed = signal(false);
  readonly retryAt = signal(0);
  private cursor: string | undefined;
  private readonly seen = new Set<string>();
  private readonly cursors = new Set<string>();
  private cancelRequest = new Subject<void>();
  private generation = 0;
  private fetch?: (cursor?: string) => Observable<MediaFeedPage>;
  private running?: Promise<void>;

  constructor(private readonly types: readonly SearchMediaType[] = ['audio']) {}

  clear(): void {
    this.cancel();
    this.fetch = undefined;
    this.posts.set([]);
    this.scanned.set(0);
    this.failed.set(false);
    this.exhausted.set(false);
    this.retryAt.set(0);
  }

  start(fetch: (cursor?: string) => Observable<MediaFeedPage>): Promise<void> {
    this.cancel();
    this.fetch = fetch;
    this.cursor = undefined;
    this.seen.clear();
    this.cursors.clear();
    this.posts.set([]);
    this.scanned.set(0);
    this.exhausted.set(false);
    this.retryAt.set(0);
    return this.more();
  }

  cancel(): void {
    this.generation++;
    this.cancelRequest.next();
    this.loading.set(false);
  }

  more(): Promise<void> {
    if (this.loading()) return this.whenIdle();
    const running = this.scanMore();
    this.running = running;
    void running.finally(() => {
      if (this.running === running) this.running = undefined;
    });
    return running;
  }

  whenIdle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async scanMore(): Promise<void> {
    if (!this.fetch || this.loading() || this.exhausted() || Date.now() < this.retryAt()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.failed.set(false);
    const target = this.posts().length + 20;
    try {
      // Ten requests per explicit action; sparse feeds must never scan forever.
      for (let calls = 0; calls < 10 && this.posts().length < target; calls++) {
        const page = await firstValueFrom(
          this.fetch(this.cursor).pipe(timeout(30_000), takeUntil(this.cancelRequest)),
        );
        if (generation !== this.generation) return;
        const fresh: Status[] = [];
        for (const row of page.statuses) {
          const post = row.reblog ?? row;
          const key = post.url || post.id;
          if (this.seen.has(key)) continue;
          this.seen.add(key);
          this.scanned.update((n) => n + 1);
          if (matchesMedia(post, this.types)) fresh.push(post);
        }
        this.posts.update((posts) => [...posts, ...fresh]);
        if (!page.next || this.cursors.has(page.next)) {
          this.exhausted.set(true);
          break;
        }
        this.cursors.add(page.next);
        this.cursor = page.next;
      }
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      this.failed.set(true);
      const response = error as { status?: number; headers?: { get(name: string): string | null } };
      if (response.status === 429) {
        const retry = response.headers?.get('Retry-After');
        const seconds = retry ? Number(retry) : NaN;
        const until = Number.isFinite(seconds)
          ? Date.now() + seconds * 1000
          : Date.parse(retry ?? '');
        this.retryAt.set(
          Math.max(Date.now() + 1000, Number.isFinite(until) ? until : Date.now() + 60_000),
        );
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
