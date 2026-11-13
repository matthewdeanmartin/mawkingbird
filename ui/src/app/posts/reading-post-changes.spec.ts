import { describe, expect, it } from 'vitest';
import { ReadingPostChanges, reconcileReadingPost } from './reading-post-changes';
import { Status } from '../platform/api/models';

const post = (id: string, url = 'https://origin.example/post/1'): Status =>
  ({
    id,
    url,
    provider: 'mastodon',
    account: { id: 'local-author' },
    favourited: false,
    favourites_count: 0,
  }) as Status;

describe('user actions across retained reading views', () => {
  it('updates a saved boosted copy without replacing its wrapper or server-local ids', () => {
    const saved = { ...post('boost'), reblog: post('local-id') };
    const updated = {
      ...post('remote-id'),
      account: { id: 'remote-author' },
      favourited: true,
      favourites_count: 1,
    } as Status;
    const result = reconcileReadingPost(saved, updated)!;
    expect(result.id).toBe('boost');
    expect(result.reblog?.id).toBe('local-id');
    expect(result.reblog?.account.id).toBe('local-author');
    expect(result.reblog?.favourited).toBe(true);
    expect(result.reblog?.favourites_count).toBe(1);
  });

  it('does not confuse matching numeric ids on different servers', () => {
    expect(reconcileReadingPost(post('1'), post('1', 'https://other.example/post/1'))).toBeNull();
  });

  it('delivers deletes and changes once, even when recipients emit their own list outputs', () => {
    const bus = new ReadingPostChanges();
    const received: boolean[] = [];
    bus.changes.subscribe((event) => {
      received.push(event.deleted);
      bus.publish(event);
    });
    bus.publish({ owner: {}, status: post('1'), deleted: false });
    bus.publish({ owner: {}, status: post('1'), deleted: true });
    expect(received).toEqual([false, true]);
  });
});
