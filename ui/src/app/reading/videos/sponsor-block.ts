import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { PLATFORM_SPONSORBLOCK } from '../../platform/http/platform-http';
import { externalFetch } from '../../platform/http/external-fetch';

/**
 * The SponsorBlock categories Watch offers to skip. Mirrors Native's Rust
 * (`sponsorblock.rs`), which sends this same fixed list.
 */
export const SPONSOR_CATEGORIES = [
  'sponsor',
  'selfpromo',
  'interaction',
  'intro',
  'outro',
] as const;
export type SponsorCategory = (typeof SPONSOR_CATEGORIES)[number];

export interface SponsorSegment {
  start: number;
  end: number;
  category: SponsorCategory;
}

export interface SponsorSegments {
  segments: SponsorSegment[];
  /** SponsorBlock's idea of the video's length, for drawing the strip. */
  duration: number | null;
}

/** The first four hex digits of SHA-256(video ID): all SponsorBlock learns. */
export async function hashPrefix(videoId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoId));
  return [...new Uint8Array(digest)]
    .slice(0, 2)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** This video's skip segments in a hash-prefix answer, in order, merged where they overlap. */
export function segmentsFor(json: string, videoId: string): SponsorSegments {
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return { segments: [], duration: null };
  }
  const video = (Array.isArray(rows) ? rows : []).find(
    (row): row is { segments?: unknown[] } => (row as { videoID?: unknown })?.videoID === videoId,
  );
  let duration: number | null = null;
  const segments = (video?.segments ?? []).flatMap((raw): SponsorSegment[] => {
    const item = raw as {
      segment?: unknown;
      category?: unknown;
      actionType?: unknown;
      videoDuration?: unknown;
    };
    const [start, end] = Array.isArray(item.segment) ? item.segment : [];
    if (typeof item.videoDuration === 'number' && item.videoDuration > 0)
      duration = item.videoDuration;
    if (
      (item.actionType ?? 'skip') !== 'skip' ||
      !SPONSOR_CATEGORIES.includes(item.category as SponsorCategory) ||
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !(end > start) ||
      start < 0
    )
      return [];
    return [{ start, end, category: item.category as SponsorCategory }];
  });
  segments.sort((a, b) => a.start - b.start);
  return { segments, duration };
}

/** The segment `time` falls in, or null. Ends are exclusive, so skipping lands outside. */
export function segmentAt(
  segments: readonly SponsorSegment[],
  time: number,
): SponsorSegment | null {
  return segments.find((segment) => time >= segment.start && time < segment.end - 0.5) ?? null;
}

/**
 * SponsorBlock (sponsor.ajay.app): crowd-sourced time ranges in YouTube videos
 * marked as sponsor reads, intros and so on (spec/youtube-client.md, S4). Watch
 * draws them and offers Skip; nothing is ever skipped automatically, and
 * nothing is submitted. Behind the SponsorBlock connection setting.
 */
@Injectable({ providedIn: 'root' })
export class SponsorBlock {
  private readonly http = inject(HttpClient);
  private readonly flags = inject(FeatureFlags);
  private readonly native = inject(PLATFORM_SPONSORBLOCK);

  enabled(): boolean {
    return this.flags.enabled('connector-sponsorblock');
  }

  async segments(videoId: string): Promise<SponsorSegments> {
    if (!/^[\w-]{11}$/.test(videoId) || !this.enabled()) return { segments: [], duration: null };
    const prefix = await hashPrefix(videoId);
    try {
      const json = this.native
        ? await this.native(prefix)
        : await firstValueFrom(
            this.http
              .get(`https://sponsor.ajay.app/api/skipSegments/${prefix}`, {
                params: { categories: JSON.stringify(SPONSOR_CATEGORIES) },
                responseType: 'text',
                context: externalFetch(),
                withCredentials: false,
              })
              .pipe(timeout(10_000)),
          );
      return segmentsFor(json, videoId);
    } catch (error) {
      // No segments for any video with this prefix is SponsorBlock's 404.
      if (error instanceof HttpErrorResponse && error.status === 404)
        return { segments: [], duration: null };
      throw error;
    }
  }
}
