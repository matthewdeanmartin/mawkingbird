import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { externalFetch } from '../../platform/http/external-fetch';
import { BlueskyApi } from './bluesky-api';
import { BlueskyPds } from './bluesky-pds';
import { BlueskySession } from './bluesky-session';
import { BskyBlobRef } from './bluesky-types';

/** Bluesky's video service: uploads, transcoding, and the per-account daily limits. */
export const BSKY_VIDEO_SERVICE = 'https://video.bsky.app';
export const BSKY_VIDEO_SERVICE_DID = 'did:web:video.bsky.app';

/** Limits bsky.app itself enforces before uploading (social-app `constants.ts`, 2026-11). */
export const BSKY_VIDEO_MAX_BYTES = 300 * 1000 * 1000;
export const BSKY_VIDEO_MAX_SECONDS = 10 * 60;
export const BSKY_VIDEO_TYPES: readonly string[] = [
  'video/mp4',
  'video/mpeg',
  'video/webm',
  'video/quicktime',
];

/** Long enough for a slow upload of a large file, short enough to limit a leaked token. */
const SERVICE_TOKEN_SECONDS = 30 * 60;

export function isBlueskyVideo(file: File): boolean {
  return BSKY_VIDEO_TYPES.includes(file.type);
}

/** `app.bsky.video.defs#jobStatus`. Any state other than these two is still in progress. */
export interface BskyVideoJob {
  jobId: string;
  did: string;
  state: 'JOB_STATE_COMPLETED' | 'JOB_STATE_FAILED' | string;
  progress?: number;
  blob?: BskyBlobRef;
  error?: string;
  message?: string;
}

export interface BskyVideoMetadata {
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
}

export type BskyVideoProgress =
  | { phase: 'uploading' }
  /** `percent` is Bluesky's own processing estimate, when it reports one. */
  | { phase: 'processing'; percent?: number };

/** A refusal or failure worth showing as-is: Bluesky's own wording where it gave one. */
export class BlueskyVideoError extends Error {}

interface UploadLimits {
  canUpload: boolean;
  remainingDailyVideos?: number;
  remainingDailyBytes?: number;
  message?: string;
  error?: string;
}

/**
 * Posts a video to Bluesky.
 *
 * Video does not go through `uploadBlob` like images. The bytes go to Bluesky's
 * video service, which transcodes them, scans them, and then writes the blob
 * into the account's own repo. That last step is why the service token names
 * the account's **PDS** as its audience with `uploadBlob` as its method: the
 * video service presents it to the PDS on the account's behalf.
 *
 * The service allows browser CORS, so the bytes go straight from this browser
 * to Bluesky. They never touch a Mawkingbird or CORS proxy.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyVideo {
  private http = inject(HttpClient);
  private api = inject(BlueskyApi);
  private pds = inject(BlueskyPds);
  private session = inject(BlueskySession);

  /** How often to ask whether processing finished. Specs shorten it. */
  pollMs = 1500;
  /** Give up on processing after this many polls (~10 minutes at the default). */
  maxPolls = 400;

  /**
   * Refuse before uploading when Bluesky would refuse after it.
   *
   * Bluesky-hosted accounts need a verified email and have a daily quota. A
   * refusal throws with Bluesky's message; a failed check does not, because
   * the upload itself reports the same refusal and an unreachable limits
   * endpoint should not block a post that would have gone through.
   */
  async checkLimits(): Promise<void> {
    let limits: UploadLimits;
    try {
      const pds = await firstValueFrom(this.pds.resolve());
      const token = await this.serviceToken(
        BSKY_VIDEO_SERVICE_DID,
        'app.bsky.video.getUploadLimits',
        pds,
      );
      limits = await firstValueFrom(
        this.http.get<UploadLimits>(`${BSKY_VIDEO_SERVICE}/xrpc/app.bsky.video.getUploadLimits`, {
          headers: { Authorization: `Bearer ${token}` },
          context: externalFetch(),
        }),
      );
    } catch {
      return;
    }
    if (!limits.canUpload) {
      throw new BlueskyVideoError(
        limits.message ||
          limits.error ||
          'Bluesky is not accepting video uploads from this account right now. Bluesky asks for a verified email address and limits videos per day.',
      );
    }
  }

  /** Upload, wait for processing, and return the blob a post embed references. */
  async upload(
    file: File,
    onProgress?: (progress: BskyVideoProgress) => void,
  ): Promise<BskyBlobRef> {
    const did = this.session.session()?.did;
    if (!did) {
      throw new BlueskyVideoError('No Bluesky account is linked.');
    }
    const pds = await firstValueFrom(this.pds.resolve());
    const token = await this.serviceToken(
      `did:web:${new URL(pds).hostname}`,
      'com.atproto.repo.uploadBlob',
      pds,
    );
    onProgress?.({ phase: 'uploading' });
    const job = await this.send(file, did, token);
    return this.waitForBlob(job, onProgress);
  }

  /** Width, height and duration from the file itself, or null when the browser cannot tell. */
  metadata(file: File, timeoutMs = 10_000): Promise<BskyVideoMetadata | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      const done = (result: BskyVideoMetadata | null) => {
        clearTimeout(timer);
        video.removeAttribute('src');
        URL.revokeObjectURL(url);
        resolve(result);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () =>
        done(
          video.videoWidth && video.videoHeight
            ? { width: video.videoWidth, height: video.videoHeight, duration: video.duration }
            : null,
        );
      video.onerror = () => done(null);
      video.src = url;
    });
  }

  private async serviceToken(aud: string, lxm: string, pds: string): Promise<string> {
    const params = new HttpParams()
      .set('aud', aud)
      .set('lxm', lxm)
      .set('exp', String(Math.floor(Date.now() / 1000) + SERVICE_TOKEN_SECONDS));
    const { token } = await firstValueFrom(
      this.api.get<{ token: string }>(
        'com.atproto.server.getServiceAuth',
        params,
        {},
        pds || undefined,
      ),
    );
    return token;
  }

  private async send(file: File, did: string, token: string): Promise<BskyVideoJob> {
    const params = new HttpParams().set('did', did).set('name', uploadName(file));
    try {
      const response = await firstValueFrom(
        this.http.post<{ jobStatus?: BskyVideoJob } & Partial<BskyVideoJob>>(
          `${BSKY_VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo`,
          file,
          {
            params,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type },
            context: externalFetch(),
          },
        ),
      );
      return response.jobStatus ?? (response as BskyVideoJob);
    } catch (error: unknown) {
      // The same bytes uploaded before: Bluesky answers 409 with the existing job.
      const body = error instanceof HttpErrorResponse ? error.error : null;
      if (body && typeof body === 'object' && (body as { jobId?: string }).jobId) {
        return body as BskyVideoJob;
      }
      throw new BlueskyVideoError(describe(error, "Couldn't upload the video to Bluesky."));
    }
  }

  private async waitForBlob(
    first: BskyVideoJob,
    onProgress?: (progress: BskyVideoProgress) => void,
  ): Promise<BskyBlobRef> {
    let job = first;
    for (let poll = 0; ; poll++) {
      if (job.state === 'JOB_STATE_COMPLETED' && job.blob) return job.blob;
      if (job.state === 'JOB_STATE_FAILED') {
        throw new BlueskyVideoError(
          job.message || job.error || 'Bluesky could not process the video.',
        );
      }
      if (poll >= this.maxPolls) {
        throw new BlueskyVideoError('Bluesky is taking too long to process the video.');
      }
      onProgress?.({ phase: 'processing', percent: job.progress });
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      try {
        const response = await firstValueFrom(
          this.http.get<{ jobStatus: BskyVideoJob }>(
            `${BSKY_VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus`,
            { params: new HttpParams().set('jobId', job.jobId), context: externalFetch() },
          ),
        );
        job = response.jobStatus;
      } catch (error: unknown) {
        throw new BlueskyVideoError(
          describe(error, 'Lost track of the video while Bluesky processed it.'),
        );
      }
    }
  }
}

/** A file name for the job. Bluesky only uses it for the extension; the original name stays private. */
function uploadName(file: File): string {
  const extension =
    { 'video/mp4': 'mp4', 'video/mpeg': 'mpeg', 'video/webm': 'webm', 'video/quicktime': 'mov' }[
      file.type
    ] ?? 'mp4';
  return `${crypto.randomUUID()}.${extension}`;
}

function describe(error: unknown, fallback: string): string {
  const body = error instanceof HttpErrorResponse ? error.error : null;
  const message =
    body && typeof body === 'object'
      ? ((body as { message?: string }).message ?? (body as { error?: string }).error)
      : undefined;
  return message ? `${fallback} Bluesky said: ${message}` : fallback;
}
