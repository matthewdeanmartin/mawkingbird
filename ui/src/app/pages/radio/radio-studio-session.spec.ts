import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { Status } from '../../models';
import { RadioStudioSession } from './radio-studio-session';

describe('RadioStudioSession', () => {
  const post = {
    id: '9',
    account: { id: 'me' },
    created_at: '2026-10-25',
    media_attachments: [{ type: 'audio', description: 'Track' }],
  } as Status;
  let api: {
    verifyCredentials: ReturnType<typeof vi.fn>;
    getAccountStatuses: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    uploadMedia: ReturnType<typeof vi.fn>;
    postStatus: ReturnType<typeof vi.fn>;
  };
  let http: { get: ReturnType<typeof vi.fn> };
  const token = signal('first');
  const limits = {
    configuration: {
      media_attachments: { supported_mime_types: ['audio/wav'], video_size_limit: 100_000_000 },
      statuses: { max_characters: 500 },
    },
  };
  let session: RadioStudioSession;
  beforeEach(async () => {
    localStorage.clear();
    token.set('first');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    api = {
      verifyCredentials: vi.fn(() => of({ id: 'me' })),
      getAccountStatuses: vi.fn(() => of([])),
      getStatus: vi.fn(() => of(post)),
      uploadMedia: vi.fn(() => of({ id: 'media', url: 'https://example.com/audio' })),
      postStatus: vi.fn(() => of(post)),
    };
    http = { get: vi.fn(() => of(limits)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: HttpClient, useValue: http },
        {
          provide: Auth,
          useValue: {
            kind: signal('mastodon'),
            token,
            isAnonymous: false,
            isBlueskyPrimary: false,
          },
        },
        { provide: Server, useValue: { baseUrl: signal('https://example.com') } },
      ],
    });
    session = TestBed.inject(RadioStudioSession);
    TestBed.tick();
    await Promise.resolve();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function stage(): File {
    const file = new File(['audio'], 'recording.wav', { type: 'audio/wav' });
    session.stage(file);
    return file;
  }

  it('restores only the verified account catalogue when switching accounts', async () => {
    session.catalogue().remember(post);
    const key = localStorage.key(0)!;
    api.verifyCredentials.mockReturnValueOnce(of({ id: 'other' }));
    token.set('other');
    TestBed.tick();
    await Promise.resolve();
    expect(session.catalogue().data().posts).toEqual([]);
    expect(localStorage.getItem(key)).toContain('Track');
    token.set('first');
    TestBed.tick();
    await Promise.resolve();
    expect(session.catalogue().data().posts[0].id).toBe('9');
    expect(api.getAccountStatuses).not.toHaveBeenCalled();
  });

  it('keeps catalogue results and reports when browser storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    session.catalogue().remember(post);
    expect(session.storageFailed()).toBe(true);
    expect(session.catalogue().data().posts[0].id).toBe('9');
  });

  it('stages locally, validates limits, uploads only when attached and releases the blob once posted', async () => {
    const file = stage();
    expect(api.uploadMedia).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    const media = await session.attach();
    expect(api.uploadMedia).toHaveBeenCalledWith(file);
    expect(media).toEqual({ id: 'media', url: 'https://example.com/audio' });
    expect(session.attached()).toEqual(media);
    expect(session.locked()).toBe(true);
    // The composer, not the session, creates the status.
    expect(api.postStatus).not.toHaveBeenCalled();
    expect(await session.attach()).toBe(media);
    expect(api.uploadMedia).toHaveBeenCalledTimes(1);
    session.posted(post);
    expect(session.file()).toBeNull();
    expect(session.attached()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(session.published()).toEqual(post);
    expect(session.catalogue().data().posts[0].id).toBe('9');
  });

  it('lets a detached recording be replaced and uploads the replacement afresh', async () => {
    stage();
    await session.attach();
    session.stage(new File(['other'], 'other.wav', { type: 'audio/wav' }));
    expect(session.file()?.name).toBe('recording.wav');
    session.detach();
    expect(session.locked()).toBe(false);
    session.stage(new File(['other'], 'other.wav', { type: 'audio/wav' }));
    expect(session.file()?.name).toBe('other.wav');
    await session.attach();
    expect(api.uploadMedia).toHaveBeenCalledTimes(2);
  });

  it('retains a failed attachment and retries processing without uploading again', async () => {
    stage();
    api.uploadMedia.mockReturnValueOnce(of({ id: 'media', url: null }));
    http.get.mockImplementation((url: string) =>
      url.endsWith('/instance') ? of(limits) : throwError(() => new Error('timeout')),
    );
    expect(await session.attach()).toBeNull();
    expect(session.file()).not.toBeNull();
    expect(session.locked()).toBe(true);
    expect(session.error()).toBe('radio.attachFailed');
    http.get.mockImplementation((url: string) =>
      of(url.endsWith('/instance') ? limits : { id: 'media', url: 'https://example.com/ready' }),
    );
    vi.useFakeTimers();
    const retry = session.attach();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await retry)?.url).toBe('https://example.com/ready');
    expect(api.uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('rejects unavailable limits and oversized files before uploading', async () => {
    stage();
    http.get.mockReturnValueOnce(of({}));
    await session.attach();
    expect(session.error()).toBe('radio.limitsUnavailable');
    http.get.mockReturnValueOnce(
      of({
        configuration: {
          media_attachments: { supported_mime_types: ['audio/wav'], video_size_limit: 1 },
        },
      }),
    );
    await session.attach();
    expect(session.error()).toBe('radio.unsupportedAudio');
    expect(session.locked()).toBe(false);
    expect(api.uploadMedia).not.toHaveBeenCalled();
  });

  it('waits for asynchronous audio processing before handing the attachment to the composer', async () => {
    vi.useFakeTimers();
    stage();
    api.uploadMedia.mockReturnValueOnce(of({ id: 'media', url: null }));
    http.get.mockImplementation((url: string) =>
      of(url.endsWith('/instance') ? limits : { id: 'media', url: 'https://example.com/ready' }),
    );
    const attaching = session.attach();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.attached()).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await attaching)?.url).toBe('https://example.com/ready');
    expect(session.attached()?.url).toBe('https://example.com/ready');
  });

  it('clears local drafts and cancels an attachment upload when the account changes', async () => {
    stage();
    const uploading = new Subject<unknown>();
    api.uploadMedia.mockReturnValueOnce(uploading);
    const attaching = session.attach();
    await Promise.resolve();
    token.set('second');
    TestBed.tick();
    expect(await attaching).toBeNull();
    expect(uploading.observed).toBe(false);
    expect(session.file()).toBeNull();
    expect(session.attached()).toBeNull();
    expect(session.catalogue().data().posts).toEqual([]);
  });

  it('records missing posts without treating transient errors as deletion', async () => {
    session.catalogue().remember(post);
    api.getStatus.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    await session.open('9');
    expect(session.catalogue().data().posts[0].unavailable).toBeUndefined();
    api.getStatus.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })));
    await session.open('9');
    expect(session.catalogue().data().posts[0].unavailable).toBe(true);
  });
});
