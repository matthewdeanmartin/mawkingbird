import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { VideoSubscriptions } from './video-subscriptions';
const id = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
describe('Video subscriptions', () => {
  beforeEach(() => localStorage.clear());
  it('persists subscriptions independently of RSS and supports unsubscribe and inclusion', () => {
    const subs = TestBed.inject(VideoSubscriptions);
    subs.add(id, 'Example');
    subs.add(id, 'Duplicate');
    expect(subs.feeds()).toHaveLength(1);
    expect(localStorage.getItem('mockingbird_rss_feeds')).toBeNull();
    subs.setEnabled(id, false);
    expect(subs.enabled()).toHaveLength(0);
    expect(new VideoSubscriptions().feeds()).toEqual(subs.feeds());
    subs.remove(id);
    expect(new VideoSubscriptions().feeds()).toEqual([]);
  });
  it('rejects malformed stored subscriptions and unsafe IDs', () => {
    localStorage.setItem(
      'mockingbird_video_feeds',
      JSON.stringify([
        { id: 'evil', title: 'Bad', enabled: true },
        { id, title: 'Good', enabled: true },
        { id, title: 'Duplicate', enabled: true },
      ]),
    );
    const subs = TestBed.inject(VideoSubscriptions);
    expect(subs.feeds()).toEqual([{ id, title: 'Good', enabled: true }]);
    expect(() => subs.add('bad&redirect=evil', 'Bad')).toThrow();
  });
});
