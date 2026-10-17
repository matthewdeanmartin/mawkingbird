import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { ReadingZen } from '../../reading-zen';
import { ProfileSlideshow } from './profile-slideshow';

function post(id: string, day: number): Status {
  return {
    id,
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
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});
describe('ProfileSlideshow', () => {
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
});
