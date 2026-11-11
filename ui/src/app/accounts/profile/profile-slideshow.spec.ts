import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { TrustedAccounts } from '../trusted-accounts';
import { FollowTrust } from '../follow-trust';
import { Status } from '../../platform/api/models';
import { ReadingZen } from '../../reading/reading-zen';
import { ProfileSlideshow, slideshowOptionsFrom, slideshowQuery } from './profile-slideshow';

function post(id: string, day: number): Status {
  return {
    id,
    account: { id: '42', acct: 'fish@example.social', url: 'https://example.social/@fish' },
    created_at: `2026-10-${day}T00:00:00Z`,
    content: '<p>🐟🟦<br>🟦🐠</p>',
    media_attachments: [],
  } as unknown as Status;
}
function setup() {
  const fixture = TestBed.createComponent(ProfileSlideshow);
  fixture.componentRef.setInput('statuses', [post('new', 17), post('old', 16)]);
  fixture.detectChanges();
  return fixture;
}
const following = signal(false);
beforeEach(() => {
  localStorage.clear();
  following.set(false);
  TestBed.configureTestingModule({
    providers: [
      { provide: FollowTrust, useValue: { revision: following, isFollowing: () => following() } },
    ],
  });
});
afterEach(() => {
  localStorage.clear();
  TestBed.resetTestingModule();
  vi.useRealTimers();
});
describe('slide show deep links', () => {
  const read = (query: string) => slideshowOptionsFrom(new URLSearchParams(query));
  it('reads post count and speed, and ignores links without the flag', () => {
    expect(read('slideshow=1&posts=10&speed=3')).toEqual({ posts: 10, seconds: 3 });
    expect(read('slideshow=1')).toEqual({ posts: null, seconds: null });
    expect(read('posts=10&speed=3')).toBeNull();
    expect(read('slideshow=0&posts=10')).toBeNull();
  });
  it('clamps out-of-range values and drops nonsense', () => {
    expect(read('slideshow=1&posts=5000&speed=0.1')).toEqual({ posts: 200, seconds: 0.5 });
    expect(read('slideshow=1&posts=-3&speed=99')).toEqual({ posts: null, seconds: 30 });
    expect(read('slideshow=1&posts=lots&speed=fast')).toEqual({ posts: null, seconds: null });
  });
  it('writes a query that reads back the same', () => {
    const query = slideshowQuery({ posts: 10, seconds: 1.5 });
    expect(query).toBe('slideshow=1&posts=10&speed=1.5');
    expect(read(query)).toEqual({ posts: 10, seconds: 1.5 });
  });
});
describe('ProfileSlideshow', () => {
  it('limits a deep link to the newest posts at its speed, paging back until it has them', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(ProfileSlideshow);
    const loadOlder = vi.fn();
    fixture.componentInstance.loadOlder.subscribe(loadOlder);
    fixture.componentRef.setInput('options', { posts: 2, seconds: 4 });
    fixture.componentRef.setInput('statuses', [post('only', 15)]);
    fixture.detectChanges();
    expect(loadOlder).toHaveBeenCalled();
    fixture.componentRef.setInput('statuses', [post('a', 15), post('b', 16), post('c', 17)]);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.slides().map((s) => s.id)).toEqual(['b', 'c']);
    expect(c.seconds()).toBe(4);
    expect(c.current()?.id).toBe('b');
    vi.advanceTimersByTime(4000);
    expect(c.current()?.id).toBe('c');
    vi.advanceTimersByTime(4000);
    expect(c.current()?.id).toBe('b');
    expect(new URL(c.deepLink()).search).toBe('?slideshow=1&posts=2&speed=4');
  });
  it('plays chronologically every 2.5 seconds, loops, and stops', () => {
    vi.useFakeTimers();
    const fixture = setup();
    const c = fixture.componentInstance;
    expect(c.current()?.id).toBe('old');
    vi.advanceTimersByTime(2500);
    expect(c.current()?.id).toBe('new');
    vi.advanceTimersByTime(2500);
    expect(c.current()?.id).toBe('old');
    c.playing.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(5000);
    expect(c.current()?.id).toBe('old');
  });
  it('pauses for stepping and last, restarts from the first, and clamps speed', () => {
    const c = setup().componentInstance;
    c.step(-1);
    expect(c.current()?.id).toBe('new');
    expect(c.playing()).toBe(false);
    c.start();
    expect(c.current()?.id).toBe('old');
    expect(c.playing()).toBe(true);
    c.last();
    expect(c.current()?.id).toBe('new');
    expect(c.playing()).toBe(false);
    c.speed(-100);
    expect(c.seconds()).toBe(0.5);
    c.speed(100);
    expect(c.seconds()).toBe(30);
  });
  it('keeps the selected post when older history arrives and excludes boosts', () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    c.last();
    c.older();
    fixture.componentRef.setInput('statuses', [
      post('older', 15),
      post('old', 16),
      post('new', 17),
      { ...post('boost', 18), reblog: post('source', 18) },
    ]);
    fixture.detectChanges();
    expect(c.current()?.id).toBe('new');
    expect(c.slides()).toHaveLength(3);
  });
  it('uses full Zen when fullscreen is unavailable and releases holds on teardown', async () => {
    const fixture = setup();
    const c = fixture.componentInstance;
    const zen = TestBed.inject(ReadingZen);
    await c.toggleFullscreen();
    expect(zen.chromeHidden()).toBe(true);
    await c.toggleFullscreen();
    expect(zen.chromeHidden()).toBe(false);
    fixture.destroy();
    expect(zen.active()).toBe(false);
  });
  it('does not reveal sensitive content automatically', () => {
    const fixture = setup();
    fixture.componentRef.setInput('statuses', [{ ...post('cw', 17), spoiler_text: 'Warning' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Warning');
    expect(fixture.nativeElement.querySelector('.post-text')).toBeNull();
    fixture.componentInstance.revealed.set('cw');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.post-text').textContent).toContain('🐟');
  });

  it.each([
    { spoiler_text: 'Warning', sensitive: false },
    { spoiler_text: '', sensitive: true },
    { spoiler_text: 'Warning', sensitive: true },
  ])('honors account trust and revocation for %j', (flags) => {
    const fixture = setup();
    const slide = {
      ...post('cw', 17),
      ...flags,
      media_attachments: [
        {
          id: 'image',
          type: 'image',
          url: 'https://example.social/fish.png',
          description: 'Fish tank',
        },
      ],
    };
    fixture.componentRef.setInput('statuses', [slide]);
    fixture.detectChanges();
    const trusted = TestBed.inject(TrustedAccounts);
    expect(fixture.nativeElement.querySelector('.post-text')).toBeNull();
    expect(fixture.nativeElement.querySelector('.slide img')).toBeNull();
    trusted.trust(slide.account);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.post-text')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.slide img')?.getAttribute('src')).toBe(
      'https://example.social/fish.png',
    );
    trusted.untrust(slide.account);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.post-text')).toBeNull();
    expect(fixture.nativeElement.querySelector('.slide img')).toBeNull();
  });

  it('keeps CW and sensitive preferences distinct and honors trust nobody', () => {
    const fixture = setup();
    const trusted = TestBed.inject(TrustedAccounts);
    const c = fixture.componentInstance;
    fixture.componentRef.setInput('statuses', [{ ...post('sensitive', 17), sensitive: true }]);
    trusted.setExpandAllCw(true);
    expect(c.contentHidden()).toBe(true);
    trusted.setShowAllSensitive(true);
    expect(c.contentHidden()).toBe(false);
    fixture.componentRef.setInput('statuses', [
      { ...post('cw', 17), spoiler_text: 'Warning', sensitive: true },
    ]);
    trusted.setExpandAllCw(false);
    expect(c.contentHidden()).toBe(true);
    trusted.setShowAllSensitive(false);
    trusted.setExpandAllCw(true);
    expect(c.contentHidden()).toBe(false);
    trusted.trust(post('cw', 17).account);
    trusted.setLevel('none');
    expect(c.contentHidden()).toBe(true);
  });

  it('reacts to follow-based trust and checks each slide author', () => {
    const fixture = setup();
    const trusted = TestBed.inject(TrustedAccounts);
    const slide = { ...post('cw', 17), spoiler_text: 'Warning' };
    fixture.componentRef.setInput('statuses', [slide]);
    trusted.setLevel('follows');
    expect(fixture.componentInstance.contentHidden()).toBe(true);
    following.set(true);
    expect(fixture.componentInstance.contentHidden()).toBe(false);
    following.set(false);
    expect(fixture.componentInstance.contentHidden()).toBe(true);
    trusted.trust(slide.account);
    fixture.componentRef.setInput('statuses', [
      {
        ...slide,
        account: {
          ...slide.account,
          id: '43',
          acct: 'other@example.social',
          url: 'https://example.social/@other',
        },
      },
    ]);
    expect(fixture.componentInstance.contentHidden()).toBe(true);
  });
});
