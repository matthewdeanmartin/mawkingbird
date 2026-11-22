import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateRecovery } from '../../platform/build/update-recovery';
import { VideoPlayerHost } from './video-player-host';

describe('VideoPlayerHost', () => {
  afterEach(() => vi.restoreAllMocks());

  function create(error: Error) {
    vi.spyOn(
      VideoPlayerHost.prototype as unknown as { importPlayer(): Promise<unknown> },
      'importPlayer',
    ).mockRejectedValue(error);
    const fixture = TestBed.createComponent(VideoPlayerHost);
    fixture.componentRef.setInput('source', { kind: 'native', key: 'k', url: 'https://x/v.mp4' });
    fixture.detectChanges();
    return fixture;
  }

  it('hands a missing player chunk (a deploy happened) to the update recovery', async () => {
    const recover = vi.spyOn(TestBed.inject(UpdateRecovery), 'recover').mockReturnValue(true);
    const fixture = create(
      new TypeError('Failed to fetch dynamically imported module: /chunk-OLD.js'),
    );
    await vi.waitFor(() => expect(recover).toHaveBeenCalled());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('still says the video failed when it was something else', async () => {
    vi.spyOn(TestBed.inject(UpdateRecovery), 'recover').mockReturnValue(false);
    const fixture = create(new Error('boom'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't play this video",
      );
    });
  });
});
