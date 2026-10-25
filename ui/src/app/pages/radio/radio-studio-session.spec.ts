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
    session.text.set('My recording');
    session.description.set('Transcript');
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

  it('stages locally, validates limits, publishes explicitly and releases the blob', async () => {
    const file = stage();
    expect(api.uploadMedia).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    await session.publish();
    expect(api.uploadMedia).toHaveBeenCalledWith(file, 'Transcript');
    expect(api.postStatus).toHaveBeenCalledWith(
      'My recording',
      { mediaIds: ['media'], spoilerText: '', sensitive: false, visibility: 'private' },
      expect.any(String),
    );
    expect(session.file()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(session.published()).toEqual(post);
    expect(session.catalogue().data().posts[0].id).toBe('9');
    expect(localStorage.getItem(localStorage.key(0)!)).not.toContain('Transcript');
  });

  it('retains failed drafts and retries the same publication without uploading again', async () => {
    stage();
    api.postStatus.mockReturnValueOnce(throwError(() => new Error('timeout')));
    await session.publish();
    const key = api.postStatus.mock.calls[0][2];
    expect(session.file()).not.toBeNull();
    expect(session.locked()).toBe(true);
    expect(session.error()).toBe('radio.publishFailed');
    await session.publish();
    expect(api.uploadMedia).toHaveBeenCalledTimes(1);
    expect(api.postStatus.mock.calls[1][2]).toBe(key);
  });

  it('rejects unavailable limits and oversized files before uploading', async () => {
    stage();
    http.get.mockReturnValueOnce(of({}));
    await session.publish();
    expect(session.error()).toBe('radio.limitsUnavailable');
    http.get.mockReturnValueOnce(
      of({
        configuration: {
          media_attachments: { supported_mime_types: ['audio/wav'], video_size_limit: 1 },
        },
      }),
    );
    await session.publish();
    expect(session.error()).toBe('radio.unsupportedAudio');
    expect(session.locked()).toBe(false);
    expect(api.uploadMedia).not.toHaveBeenCalled();
  });

  it('waits for asynchronous audio processing before creating the post', async () => {
    vi.useFakeTimers();
    stage();
    api.uploadMedia.mockReturnValueOnce(of({ id: 'media', url: null }));
    http.get.mockImplementation((url: string) =>
      of(url.endsWith('/instance') ? limits : { id: 'media', url: 'https://example.com/ready' }),
    );
    const publishing = session.publish();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.postStatus).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await publishing;
    expect(api.postStatus).toHaveBeenCalledTimes(1);
  });

  it('clears local drafts and cancels publication when the account changes', async () => {
    stage();
    const uploading = new Subject<unknown>();
    api.uploadMedia.mockReturnValueOnce(uploading);
    const publishing = session.publish();
    await Promise.resolve();
    token.set('second');
    TestBed.tick();
    await publishing;
    expect(uploading.observed).toBe(false);
    expect(session.file()).toBeNull();
    expect(session.catalogue().data().posts).toEqual([]);
    expect(api.postStatus).not.toHaveBeenCalled();
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
