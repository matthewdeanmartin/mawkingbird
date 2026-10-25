import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { AudioCatalogue } from './audio-catalogue';

function post(id: string, type = 'audio'): Status {
  return {
    id,
    created_at: `2026-10-${id.padStart(2, '0')}`,
    spoiler_text: '',
    media_attachments: [{ type, description: 'Recording', url: 'https://private.example/audio' }],
  } as Status;
}

describe('AudioCatalogue', () => {
  it('preserves saved pointers but restarts legacy attachment-only scans for external audio', () => {
    const scan = new AudioCatalogue(vi.fn());
    scan.restore(
      JSON.stringify({
        version: 1,
        posts: [{ id: '9', title: 'Saved', date: '2026-10-09' }],
        newest: '9',
        cursor: '1',
        exhausted: true,
        scanned: 100,
      }),
    );
    expect(scan.data()).toEqual({
      version: 2,
      posts: [{ id: '9', title: 'Saved', date: '2026-10-09' }],
      exhausted: false,
      scanned: 0,
    });
  });
  it('can refresh an account that had no posts on the first scan', async () => {
    const scan = new AudioCatalogue(vi.fn());
    await scan.scan(() => of([]));
    expect(scan.data().exhausted).toBe(true);
    await scan.scan((cursor) => of(cursor ? [] : [post('9')]), true);
    expect(scan.data().posts.map((p) => p.id)).toEqual(['9']);
  });
  it('persists pointers and raw cursors, then resumes across reload without replaying pages', async () => {
    let saved = '';
    const scan = new AudioCatalogue((d) => (saved = JSON.stringify(d)));
    let id = 30;
    await scan.scan(() => of([post(String(id--), id % 2 ? 'image' : 'audio')]));
    expect(scan.data().scanned).toBe(10);
    expect(saved).not.toContain('https://private');
    expect(saved).not.toContain('media_attachments');
    const restored = new AudioCatalogue(vi.fn());
    restored.restore(saved);
    const fetch = vi.fn(() => of([]));
    await restored.scan(fetch);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('21');
    expect(restored.data().exhausted).toBe(true);
    expect(restored.data().posts).toHaveLength(5);
  });

  it('refreshes to the previous newest raw post, preserving the older history cursor', async () => {
    const scan = new AudioCatalogue(vi.fn());
    scan.restore(
      JSON.stringify({
        version: 2,
        posts: [],
        newest: '20',
        cursor: '10',
        scanned: 10,
        exhausted: false,
      }),
    );
    const fetch = vi.fn(() => of([post('22'), post('20', 'image'), post('19')]));
    await scan.scan(fetch, true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(scan.data()).toMatchObject({ newest: '22', cursor: '10', scanned: 11 });
    expect(scan.data().posts.map((p) => p.id)).toEqual(['22']);
    expect(scan.data().refresh).toBeUndefined();
  });

  it('cancels requests and checkpoints an interrupted refresh for reload', async () => {
    let saved = '';
    const scan = new AudioCatalogue((d) => (saved = JSON.stringify(d)));
    scan.restore(
      JSON.stringify({
        version: 2,
        posts: [],
        newest: '10',
        cursor: '1',
        scanned: 10,
        exhausted: true,
      }),
    );
    const pending = new Subject<Status[]>();
    const run = scan.scan((cursor) => (cursor ? pending : of([post('20')])), true);
    await Promise.resolve();
    scan.cancel();
    await run;
    expect(pending.observed).toBe(false);
    const restored = new AudioCatalogue(vi.fn());
    restored.restore(saved);
    const fetch = vi.fn(() => of([post('15'), post('10')]));
    await restored.scan(fetch);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('20');
    expect(restored.data().newest).toBe('20');
    expect(restored.data().exhausted).toBe(true);
    expect(restored.data().posts.map((p) => p.id)).toEqual(['20', '15']);
  });

  it('retains progress and respects the server retry window', async () => {
    const scan = new AudioCatalogue(vi.fn());
    const fetch = vi.fn((cursor?: string) =>
      cursor
        ? throwError(
            () =>
              new HttpErrorResponse({
                status: 429,
                headers: new HttpHeaders({ 'Retry-After': '120' }),
              }),
          )
        : of([post('9')]),
    );
    await scan.scan(fetch);
    expect(scan.failed()).toBe(true);
    expect(scan.data().cursor).toBe('9');
    expect(scan.retryAt()).toBeGreaterThan(Date.now() + 100_000);
    await scan.scan(fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects corrupt caches and marks missing posts without forgetting their pointers', () => {
    const scan = new AudioCatalogue(vi.fn());
    scan.restore('{invalid');
    scan.restore(JSON.stringify({ version: 1, posts: [null], scanned: 0, exhausted: false }));
    expect(scan.data().posts).toEqual([]);
    scan.remember(post('9'));
    scan.unavailable('9');
    expect(scan.data().posts[0].unavailable).toBe(true);
    scan.remember(post('9'));
    expect(scan.data().posts).toHaveLength(1);
    expect(scan.data().posts[0].unavailable).toBeUndefined();
  });
});
