import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  hashPrefix,
  segmentAt,
  segmentsFor,
  SPONSOR_CATEGORIES,
  SponsorBlock,
} from './sponsor-block';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { PLATFORM_SPONSORBLOCK } from '../../platform/http/platform-http';
import { EXTERNAL_FETCH } from '../../platform/http/external-fetch';

const answer = (videoID: string, segments: unknown[]) => JSON.stringify([{ videoID, segments }]);

describe('SponsorBlock parsing', () => {
  it('sends only the first four hex digits of the video ID’s SHA-256', async () => {
    expect(await hashPrefix('dQw4w9WgXcQ')).toBe('5f6b');
  });

  it('keeps this video’s skip segments in order, ignoring other videos and kinds', () => {
    const json = JSON.stringify([
      { videoID: 'other000000', segments: [{ segment: [1, 2], category: 'sponsor' }] },
      {
        videoID: 'dQw4w9WgXcQ',
        segments: [
          { segment: [90, 120], category: 'sponsor', actionType: 'skip', videoDuration: 212 },
          { segment: [0, 10], category: 'intro', actionType: 'skip' },
          { segment: [30, 40], category: 'music_offtopic', actionType: 'skip' },
          { segment: [50, 60], category: 'sponsor', actionType: 'mute' },
          { segment: [70, 65], category: 'sponsor' },
        ],
      },
    ]);
    expect(segmentsFor(json, 'dQw4w9WgXcQ')).toEqual({
      duration: 212,
      segments: [
        { start: 0, end: 10, category: 'intro' },
        { start: 90, end: 120, category: 'sponsor' },
      ],
    });
    expect(segmentsFor('not json', 'dQw4w9WgXcQ').segments).toEqual([]);
  });

  it('finds the segment playing now, but not in its last half second', () => {
    const segments = [{ start: 90, end: 120, category: 'sponsor' as const }];
    expect(segmentAt(segments, 95)?.start).toBe(90);
    expect(segmentAt(segments, 119.8)).toBeNull();
    expect(segmentAt(segments, 30)).toBeNull();
  });
});

describe('SponsorBlock', () => {
  function setUp(options: { native?: (prefix: string) => Promise<string>; on?: boolean }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: FeatureFlags, useValue: { enabled: () => options.on !== false } },
        { provide: PLATFORM_SPONSORBLOCK, useValue: options.native ?? null },
      ],
    });
    return { sb: TestBed.inject(SponsorBlock), http: TestBed.inject(HttpTestingController) };
  }

  it('asks SponsorBlock directly on the web, by hash prefix and fixed categories', async () => {
    const { sb, http } = setUp({});
    const found = sb.segments('dQw4w9WgXcQ');
    const request = await vi.waitFor(() =>
      http.expectOne((req) => req.url === 'https://sponsor.ajay.app/api/skipSegments/5f6b'),
    );
    expect(request.request.params.get('categories')).toBe(JSON.stringify(SPONSOR_CATEGORIES));
    expect(request.request.context.get(EXTERNAL_FETCH)).toBe(true);
    expect(request.request.urlWithParams).not.toContain('dQw4w9WgXcQ');
    request.flush(answer('dQw4w9WgXcQ', [{ segment: [5, 9], category: 'sponsor' }]));
    expect((await found).segments).toHaveLength(1);
  });

  it('treats SponsorBlock’s 404 as no segments', async () => {
    const { sb, http } = setUp({});
    const found = sb.segments('dQw4w9WgXcQ');
    (await vi.waitFor(() => http.expectOne(() => true))).flush('Not Found', {
      status: 404,
      statusText: 'Not Found',
    });
    expect(await found).toEqual({ segments: [], duration: null });
  });

  it('asks through Rust on Native', async () => {
    const native = vi.fn(async () =>
      answer('dQw4w9WgXcQ', [{ segment: [5, 9], category: 'outro' }]),
    );
    const { sb, http } = setUp({ native });
    expect((await sb.segments('dQw4w9WgXcQ')).segments[0].category).toBe('outro');
    expect(native).toHaveBeenCalledWith('5f6b');
    http.expectNone(() => true);
  });

  it('asks nothing when its connection is off or the ID is invalid', async () => {
    const native = vi.fn();
    const { sb } = setUp({ native, on: false });
    expect(await sb.segments('dQw4w9WgXcQ')).toEqual({ segments: [], duration: null });
    TestBed.resetTestingModule();
    const again = setUp({ native });
    expect((await again.sb.segments('bad')).segments).toEqual([]);
    expect(native).not.toHaveBeenCalled();
  });
});
