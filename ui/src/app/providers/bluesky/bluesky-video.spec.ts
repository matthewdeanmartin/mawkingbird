import { HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { BlueskyPds } from './bluesky-pds';
import { BlueskySession } from './bluesky-session';
import {
  BlueskyVideo,
  BlueskyVideoError,
  BSKY_VIDEO_SERVICE,
  BskyVideoProgress,
  isBlueskyVideo,
} from './bluesky-video';

const UPLOAD = `${BSKY_VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo`;
const STATUS = `${BSKY_VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus`;
const LIMITS = `${BSKY_VIDEO_SERVICE}/xrpc/app.bsky.video.getUploadLimits`;
const BLOB = { $type: 'blob', ref: { $link: 'bafy-video' }, mimeType: 'video/mp4', size: 2048 };

/**
 * Video goes to Bluesky's video service, not `uploadBlob`: a service token
 * from the account's own PDS, the raw bytes, then polling until processing
 * hands back the blob a post can embed. All of it straight from the browser.
 */
describe('BlueskyVideo', () => {
  let http: HttpTestingController;
  let video: BlueskyVideo;
  let serviceAuth: ReturnType<typeof vi.fn>;
  const file = new File([new Uint8Array(2048)], 'holiday-at-home.mp4', { type: 'video/mp4' });

  beforeEach(() => {
    serviceAuth = vi.fn(() => of({ token: 'service-token' }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BlueskyApi, useValue: { get: serviceAuth } },
        { provide: BlueskyPds, useValue: { resolve: () => of('https://pds.example') } },
        { provide: BlueskySession, useValue: { session: () => ({ did: 'did:plc:me' }) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    video = TestBed.inject(BlueskyVideo);
    video.pollMs = 0;
  });

  function tokenRequest(call = 0): { nsid: string; params: HttpParams; pds: string } {
    const [nsid, params, , pds] = serviceAuth.mock.calls[call] as [
      string,
      HttpParams,
      unknown,
      string,
    ];
    return { nsid, params, pds };
  }

  it('recognises the video types Bluesky accepts', () => {
    for (const type of ['video/mp4', 'video/mpeg', 'video/webm', 'video/quicktime']) {
      expect(isBlueskyVideo(new File([], 'v', { type }))).toBe(true);
    }
    expect(isBlueskyVideo(new File([], 'v', { type: 'video/x-matroska' }))).toBe(false);
    expect(isBlueskyVideo(new File([], 'a', { type: 'audio/mpeg' }))).toBe(false);
  });

  it('uploads with a PDS-audience token, polls processing, and returns the blob', async () => {
    const progress: BskyVideoProgress[] = [];
    const result = video.upload(file, (p) => progress.push(p));

    const upload = await vi.waitFor(() => http.expectOne((r) => r.url === UPLOAD));
    const { nsid, params, pds } = tokenRequest();
    expect(nsid).toBe('com.atproto.server.getServiceAuth');
    expect(params.get('aud')).toBe('did:web:pds.example');
    expect(params.get('lxm')).toBe('com.atproto.repo.uploadBlob');
    expect(Number(params.get('exp'))).toBeGreaterThan(Date.now() / 1000);
    expect(pds).toBe('https://pds.example');

    expect(upload.request.body).toBe(file);
    expect(upload.request.headers.get('Authorization')).toBe('Bearer service-token');
    expect(upload.request.headers.get('Content-Type')).toBe('video/mp4');
    expect(upload.request.params.get('did')).toBe('did:plc:me');
    // The job name carries only the extension; the original file name stays private.
    expect(upload.request.params.get('name')).toMatch(/^[0-9a-f-]+\.mp4$/);
    upload.flush({ jobStatus: { jobId: 'job-1', did: 'did:plc:me', state: 'JOB_STATE_CREATED' } });

    const first = await vi.waitFor(() => http.expectOne((r) => r.url === STATUS));
    expect(first.request.params.get('jobId')).toBe('job-1');
    first.flush({
      jobStatus: { jobId: 'job-1', did: 'did:plc:me', state: 'JOB_STATE_ENCODING', progress: 40 },
    });
    const second = await vi.waitFor(() => http.expectOne((r) => r.url === STATUS));
    second.flush({
      jobStatus: { jobId: 'job-1', did: 'did:plc:me', state: 'JOB_STATE_COMPLETED', blob: BLOB },
    });

    await expect(result).resolves.toEqual(BLOB);
    expect(progress).toEqual([
      { phase: 'uploading' },
      { phase: 'processing', percent: undefined },
      { phase: 'processing', percent: 40 },
    ]);
    http.verify();
  });

  it('reuses the existing job when the same bytes were already uploaded', async () => {
    const result = video.upload(file);
    const upload = await vi.waitFor(() => http.expectOne((r) => r.url === UPLOAD));
    upload.flush(
      {
        error: 'already_exists',
        jobId: 'job-old',
        did: 'did:plc:me',
        state: 'JOB_STATE_COMPLETED',
        blob: BLOB,
      },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(result).resolves.toEqual(BLOB);
  });

  it("fails with Bluesky's own reason when processing fails", async () => {
    const result = video.upload(file);
    const upload = await vi.waitFor(() => http.expectOne((r) => r.url === UPLOAD));
    upload.flush({
      jobStatus: {
        jobId: 'job-2',
        did: 'did:plc:me',
        state: 'JOB_STATE_FAILED',
        message: 'Video is too long',
      },
    });

    await expect(result).rejects.toEqual(new BlueskyVideoError('Video is too long'));
  });

  it("names Bluesky's refusal when the upload itself is rejected", async () => {
    const result = video.upload(file);
    const upload = await vi.waitFor(() => http.expectOne((r) => r.url === UPLOAD));
    upload.flush(
      { error: 'unconfirmed_email', message: 'Please confirm your email address' },
      { status: 400, statusText: 'Bad Request' },
    );

    await expect(result).rejects.toThrow('Please confirm your email address');
  });

  it('refuses before uploading when the daily limit is spent', async () => {
    const check = video.checkLimits();
    const limits = await vi.waitFor(() => http.expectOne((r) => r.url === LIMITS));
    expect(tokenRequest().params.get('aud')).toBe('did:web:video.bsky.app');
    expect(tokenRequest().params.get('lxm')).toBe('app.bsky.video.getUploadLimits');
    expect(limits.request.headers.get('Authorization')).toBe('Bearer service-token');
    limits.flush({ canUpload: false, message: 'You have reached your daily video limit' });

    await expect(check).rejects.toThrow('You have reached your daily video limit');
  });

  it('lets the upload decide when the limits check itself cannot be reached', async () => {
    const check = video.checkLimits();
    const limits = await vi.waitFor(() => http.expectOne((r) => r.url === LIMITS));
    limits.error(new ProgressEvent('error'));

    await expect(check).resolves.toBeUndefined();
  });
});
