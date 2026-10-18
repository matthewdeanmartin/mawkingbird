import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scopedKey } from '../../account-scope';
import { youtubeSource } from '../../video-player/media-source';
import {
  pickWatchParams,
  queueEntry,
  queueKey,
  validWatchParams,
  WATCH_QUEUE_LIMIT,
  WatchQueue,
} from './watch-queue';

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const C = 'ccccccccccc';
const yt = (id: string, title = id) => ({ title, params: { youtube: id } });

describe('watch queue params', () => {
  it('accepts exactly the shapes Watch loads', () => {
    expect(validWatchParams({ youtube: A })).toBe(true);
    expect(validWatchParams({ post: '1', server: 'https://a.example', youtube: A })).toBe(true);
    expect(validWatchParams({ post: '1', server: 'https://a.example', attachment: '9' })).toBe(
      true,
    );
  });

  it('rejects anything Watch would not, or that names no video', () => {
    expect(validWatchParams({ youtube: 'short' })).toBe(false);
    expect(validWatchParams({ youtube: A, server: 'https://a.example' })).toBe(false);
    expect(validWatchParams({ post: '1' })).toBe(false);
    expect(validWatchParams({ post: '', youtube: A })).toBe(false);
    expect(validWatchParams({ post: 'x'.repeat(4001), youtube: A })).toBe(false);
    expect(validWatchParams({ youtube: A, href: 'javascript:alert(1)' })).toBe(false);
    expect(validWatchParams({ youtube: 1 })).toBe(false);
    expect(validWatchParams(null)).toBe(false);
    expect(validWatchParams([A])).toBe(false);
  });

  it('drops page extras such as party tags before keying', () => {
    expect(pickWatchParams({ youtube: A, tags: 'Anime2000' })).toEqual({ youtube: A });
  });

  it('keys the same post video the same way however it was reached', () => {
    expect(queueKey({ post: '1', server: 'https://a.example', youtube: A })).toBe(
      queueKey({ youtube: A, server: 'https://a.example', post: '1' }),
    );
    expect(queueKey({ youtube: A })).not.toBe(
      queueKey({ post: '1', server: 'https://a.example', youtube: A }),
    );
  });

  it('makes a YouTube source queueable without Watch params, but not a bare upload', () => {
    const source = { ...youtubeSource(`https://youtu.be/${A}`)!, title: 'Talk' };
    expect(queueEntry(source, null)).toEqual({
      key: `youtube:${A}`,
      title: 'Talk',
      params: { youtube: A },
    });
    // The generic placeholder title is not a name worth keeping.
    expect(queueEntry({ ...source, title: 'YouTube' }, null)?.title).toBe('');
    expect(
      queueEntry(
        { kind: 'native', key: 'native:x', url: 'https://a.example/v.mp4', title: '' },
        null,
      ),
    ).toBeNull();
  });
});

describe('WatchQueue', () => {
  let queue: WatchQueue;
  const key = () => scopedKey('mockingbird_watch_queue');

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    queue = TestBed.inject(WatchQueue);
  });

  afterEach(() => vi.restoreAllMocks());

  it('adds in order, once per video, and survives a reload', () => {
    expect(queue.add(yt(A))).toBe(true);
    expect(queue.add(yt(B))).toBe(true);
    expect(queue.add(yt(A, 'again'))).toBe(false);
    expect(queue.items().map((item) => item.params['youtube'])).toEqual([A, B]);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(
      TestBed.inject(WatchQueue)
        .items()
        .map((item) => item.title),
    ).toEqual([A, B]);
  });

  it('refuses entries Watch could not replay', () => {
    expect(queue.add({ title: 'x', params: { youtube: A, href: 'https://evil.example' } })).toBe(
      false,
    );
    expect(queue.items()).toEqual([]);
  });

  it('stops at the limit', () => {
    const ids = Array.from({ length: WATCH_QUEUE_LIMIT }, (_, i) => i.toString().padStart(11, '0'));
    for (const id of ids) queue.add(yt(id));
    expect(queue.full()).toBe(true);
    expect(queue.add(yt(A))).toBe(false);
    expect(queue.items()).toHaveLength(WATCH_QUEUE_LIMIT);
  });

  it('moves entries and clamps at the ends', () => {
    [A, B, C].forEach((id) => queue.add(yt(id)));
    queue.move(`youtube:${C}`, -1);
    expect(queue.items().map((item) => item.title)).toEqual([A, C, B]);
    queue.move(`youtube:${A}`, -5);
    queue.move(`youtube:${B}`, 5);
    expect(queue.items().map((item) => item.title)).toEqual([A, C, B]);
  });

  it('plays the entry after the current one, or the head when the current is not queued', () => {
    [A, B].forEach((id) => queue.add(yt(id)));
    expect(queue.next(`youtube:${A}`)?.title).toBe(B);
    expect(queue.next(`youtube:${B}`)).toBeNull();
    expect(queue.next(`youtube:${C}`)?.title).toBe(A);
    expect(queue.next(null)?.title).toBe(A);
  });

  it('removes and clears', () => {
    [A, B].forEach((id) => queue.add(yt(id)));
    queue.remove(`youtube:${A}`);
    expect(queue.has(`youtube:${A}`)).toBe(false);
    queue.clear();
    expect(queue.items()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(key())!)).toEqual([]);
  });

  it('ignores tampered or duplicated stored rows and recomputes their keys', () => {
    localStorage.setItem(
      key(),
      JSON.stringify([
        { key: 'forged', title: 'ok', params: { youtube: A }, addedAt: 1 },
        { key: 'dupe', title: 'dupe', params: { youtube: A }, addedAt: 2 },
        { key: 'bad', title: 'bad', params: { youtube: A, src: 'x' }, addedAt: 3 },
        { key: 'nodate', title: 'nodate', params: { youtube: B } },
        'junk',
      ]),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const items = TestBed.inject(WatchQueue).items();
    expect(items.map((item) => [item.key, item.title])).toEqual([[`youtube:${A}`, 'ok']]);
  });

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(queue.add(yt(A))).toBe(true);
    expect(queue.has(`youtube:${A}`)).toBe(true);
  });
});
