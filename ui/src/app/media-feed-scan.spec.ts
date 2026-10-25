import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MediaFeedPage, MediaFeedScan } from './media-feed-scan';
import { Status } from './models';

function post(id: string, type = 'audio'): Status {
  return { id, media_attachments: [{ type }] } as Status;
}

describe('MediaFeedScan', () => {
  it('scans past non-audio pages, uses raw cursors, and deduplicates boosted audio', async () => {
    const scan = new MediaFeedScan();
    const fetch = vi.fn((cursor?: string) =>
      of(
        cursor
          ? {
              statuses: [post('8'), { id: '7', reblog: post('8') } as Status],
              next: null,
            }
          : { statuses: [post('10', 'image')], next: '10' },
      ),
    );
    await scan.start(fetch);
    expect(fetch.mock.calls).toEqual([[undefined], ['10']]);
    expect(scan.posts().map((row) => row.id)).toEqual(['8']);
    expect(scan.scanned()).toBe(2);
    expect(scan.exhausted()).toBe(true);
  });

  it('bounds sparse scans and resumes without fetching old pages again', async () => {
    const scan = new MediaFeedScan();
    let calls = 0;
    const fetch = vi.fn(() =>
      of({ statuses: [post(String(++calls), 'image')], next: String(calls) }),
    );
    await scan.start(fetch);
    expect(calls).toBe(10);
    expect(scan.exhausted()).toBe(false);
    await scan.more();
    expect(calls).toBe(20);
    expect(scan.scanned()).toBe(20);
  });

  it('stops after enough matches and protects against repeated cursors', async () => {
    const scan = new MediaFeedScan();
    const fetch = vi.fn(() =>
      of({ statuses: Array.from({ length: 20 }, (_, i) => post(String(i))), next: 'cursor' }),
    );
    await scan.start(fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    await scan.more();
    expect(scan.posts()).toHaveLength(20);
    expect(scan.exhausted()).toBe(true);
  });

  it('cancels an in-flight request and resumes at the last completed cursor', async () => {
    const scan = new MediaFeedScan();
    const pending = new Subject<MediaFeedPage>();
    const fetch = vi.fn((cursor?: string) =>
      cursor ? pending : of({ statuses: [post('9')], next: '9' }),
    );
    const run = scan.start(fetch);
    await Promise.resolve();
    scan.cancel();
    await run;
    expect(pending.observed).toBe(false);
    expect(scan.posts()).toHaveLength(1);
    expect(scan.failed()).toBe(false);
    const resumed = scan.more();
    expect(fetch).toHaveBeenLastCalledWith('9');
    pending.next({ statuses: [post('8')], next: null });
    await resumed;
    expect(scan.posts()).toHaveLength(2);
  });

  it('does not let a superseded request overwrite a new source', async () => {
    const scan = new MediaFeedScan();
    const pending = new Subject<MediaFeedPage>();
    const old = scan.start(() => pending);
    await scan.start(() => of({ statuses: [post('new')], next: null }));
    pending.next({ statuses: [post('old')], next: null });
    await old;
    expect(scan.posts().map((row) => row.id)).toEqual(['new']);
  });

  it('retains results and respects Retry-After before retrying the failed cursor', async () => {
    const scan = new MediaFeedScan();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetch = vi.fn((cursor?: string) =>
      cursor
        ? throwError(
            () =>
              new HttpErrorResponse({
                status: 429,
                headers: new HttpHeaders({ 'Retry-After': '5' }),
              }),
          )
        : of({ statuses: [post('9')], next: '9' }),
    );
    try {
      await scan.start(fetch);
      expect(scan.retryAt()).toBe(6000);
      expect(scan.failed()).toBe(true);
      await scan.more();
      expect(fetch).toHaveBeenCalledTimes(2);
      now.mockReturnValue(7000);
      await scan.more();
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenLastCalledWith('9');
      expect(scan.posts()).toHaveLength(1);
    } finally {
      now.mockRestore();
    }
  });
});
