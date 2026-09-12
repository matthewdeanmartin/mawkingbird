import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Api } from './api';
import { accountScopeSuffix } from './account-scope';
import { cleanPhoto, PrivateMedia } from './private-media';
import { Pseudonymity } from './pseudonymity';
import { BlueskyApi } from './providers/bluesky/bluesky-api';
import { prepareImageForBluesky } from './providers/bluesky/bluesky-image';
import { seedBskySession } from './testing/seed-storage';

function photo(
  type = 'image/jpeg',
  bytes = [255, 216, 255, 225, 0, 8, 69, 120, 105, 102, 0, 0],
): File {
  const data = new Uint8Array(bytes);
  const file = new File([data], 'Alice-GPS.jpg', { type, lastModified: 123 });
  // jsdom's File is missing arrayBuffer on some supported Node versions.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => data.buffer });
  return file;
}

describe('PA photo cleaning', () => {
  const close = vi.fn();
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 20, close }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
      callback(new Blob(['encoded pixels'], { type })),
    );
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    close.mockClear();
  });

  it('re-encodes oriented pixels and replaces the source filename and timestamp', async () => {
    const original = photo();
    const result = await cleanPhoto(original);
    expect(createImageBitmap).toHaveBeenCalledWith(original, { imageOrientation: 'from-image' });
    expect(result).not.toBe(original);
    expect(result.name).toBe('photo.jpg');
    expect(result.lastModified).toBe(0);
    expect(result.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not re-encode already cleaned Bluesky bytes and grow them past the upload limit', async () => {
    TestBed.inject(Pseudonymity).setEnabled(true);
    let encodes = 0;
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback, type) => {
      callback(new Blob([new Uint8Array(++encodes === 1 ? 1_100_000 : 600_000)], { type }));
    });
    const prepared = await prepareImageForBluesky(photo(), true);
    expect(prepared?.downscaled).toBe(true);
    expect(prepared?.blob.size).toBe(600_000);
    expect(await firstValueFrom(TestBed.inject(PrivateMedia).prepare(prepared!.blob))).toBe(
      prepared!.blob,
    );
    expect(encodes).toBe(2);
  });

  it('blocks unsupported, corrupt and animated inputs before decoding', async () => {
    for (const original of [
      photo('image/gif'),
      photo('video/mp4'),
      photo('image/png'),
      photo('image/jpeg', [1, 2, 3]),
      photo('image/png', [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0]),
    ])
      await expect(cleanPhoto(original)).rejects.toThrow();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('cleans a still PNG without converting transparency to JPEG', async () => {
    const result = await cleanPhoto(
      photo('image/png', [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]),
    );
    expect(result.type).toBe('image/png');
    expect(result.name).toBe('photo.png');
  });

  it('releases decoded pixels and fails closed if the encoder fails', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null));
    await expect(cleanPhoto(photo())).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects encoder fallback and oversized decoded images', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) =>
      callback(new Blob(['pixels'], { type: 'image/png' })),
    );
    await expect(cleanPhoto(photo())).rejects.toThrow();
    vi.mocked(createImageBitmap).mockResolvedValue({
      width: 10000,
      height: 10000,
      close,
    } as unknown as ImageBitmap);
    await expect(cleanPhoto(photo())).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('leaves ordinary uploads unchanged and lets PA users opt out per account', async () => {
    const media = TestBed.inject(PrivateMedia);
    const original = photo('video/mp4');
    expect(await firstValueFrom(media.prepare(original))).toBe(original);
    const pa = TestBed.inject(Pseudonymity);
    pa.setEnabled(true);
    pa.setCleanMedia(false);
    expect(await firstValueFrom(media.prepare(original))).toBe(original);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('never sends an original Mastodon attachment when cleaning fails', async () => {
    TestBed.inject(Pseudonymity).setEnabled(true);
    await expect(
      firstValueFrom(TestBed.inject(Api).uploadMedia(photo('video/mp4'))),
    ).rejects.toThrow('Nothing was uploaded');
    http.expectNone('/api/v2/media');
  });

  it('sends only the cleaned Mastodon file, preserving alt text', async () => {
    TestBed.inject(Pseudonymity).setEnabled(true);
    const result = firstValueFrom(TestBed.inject(Api).uploadMedia(photo(), ' A pineapple '));
    // Wait for decoding and canvas serialization before inspecting the request.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne('/api/v2/media');
    const form = request.request.body as FormData;
    expect((form.get('file') as File).name).toBe('photo.jpg');
    expect(form.get('description')).toBe('A pineapple');
    request.flush({ id: 'clean' });
    await result;
  });

  it('blocks a cleaned result after an account switch before any upload', async () => {
    TestBed.inject(Pseudonymity).setEnabled(true);
    const promise = firstValueFrom(TestBed.inject(Api).uploadMedia(photo()));
    localStorage.setItem('mastodon_mock_token', 'bob');
    await expect(promise).rejects.toThrow('Nothing was uploaded');
    http.expectNone('/api/v2/media');
  });

  it('protects the shared Bluesky blob endpoint as well as Mastodon', async () => {
    seedBskySession(
      {
        service: 'https://bsky.social',
        handle: 'me.bsky.social',
        did: 'did:plc:me',
        accessJwt: 'access',
        refreshJwt: 'refresh',
      },
      accountScopeSuffix(),
    );
    TestBed.inject(Pseudonymity).setEnabled(true);
    await expect(
      firstValueFrom(TestBed.inject(BlueskyApi).uploadBlob(photo('image/gif'), 'image/gif')),
    ).rejects.toThrow('Nothing was uploaded');
    http.expectNone((request) => request.method === 'POST');
  });
});
