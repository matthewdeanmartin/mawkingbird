/**
 * Fitting a phone photo into Bluesky's ~1MB blob ceiling.
 *
 * jsdom has no canvas and no real image decoder, so `createImageBitmap`,
 * `HTMLCanvasElement.toBlob` and `URL` are stubbed. That is enough to test what
 * actually has the bugs — the ladder's decisions about *when* to re-encode, how
 * far to step down, and when to give up — while the pixel work itself is the
 * browser's.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BSKY_BLOB_LIMIT, prepareImageForBluesky } from './bluesky-image';

/** A File of a stated size, without allocating that many bytes. */
function fakeFile(size: number, type = 'image/jpeg'): File {
  const file = new File(['x'], 'photo.jpg', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** Encoded sizes, keyed by "how many times has toBlob been called". */
let encodedSizes: number[];
let encodeCalls: { width: number; height: number; quality: number }[];

beforeEach(() => {
  encodedSizes = [];
  encodeCalls = [];

  vi.stubGlobal('createImageBitmap', () =>
    Promise.resolve({ width: 4032, height: 3024, close: vi.fn() }),
  );

  // jsdom's canvas has no 2d context at all, so the whole element is faked.
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') {
      return Object.create(HTMLElement.prototype);
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (b: Blob | null) => void, _type: string, quality: number) => {
        encodeCalls.push({ width: canvas.width, height: canvas.height, quality });
        const size = encodedSizes.shift() ?? 10_000;
        const blob = new Blob(['x'], { type: 'image/jpeg' });
        Object.defineProperty(blob, 'size', { value: size });
        cb(blob);
      },
    };
    return canvas as unknown as HTMLElement;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('prepareImageForBluesky', () => {
  it('passes a small image through untouched', async () => {
    // Re-encoding a 200KB PNG would strip transparency and lose quality for no
    // gain, so the cheap path really is "do nothing".
    const file = fakeFile(200_000, 'image/png');

    const prepared = await prepareImageForBluesky(file);

    expect(prepared?.downscaled).toBe(false);
    expect(prepared?.blob).toBe(file);
    expect(prepared?.mimeType).toBe('image/png');
    expect(encodeCalls).toHaveLength(0);
  });

  it('re-encodes a phone photo that is over the limit', async () => {
    // The case the feature exists for: 4MB off a camera, which Bluesky refuses.
    encodedSizes = [800_000];

    const prepared = await prepareImageForBluesky(fakeFile(4_000_000));

    expect(prepared?.downscaled).toBe(true);
    expect(prepared?.blob.size).toBeLessThanOrEqual(BSKY_BLOB_LIMIT);
    expect(prepared?.mimeType).toBe('image/jpeg');
  });

  it('scales the longest edge down, keeping the aspect ratio', async () => {
    encodedSizes = [800_000];

    const prepared = await prepareImageForBluesky(fakeFile(4_000_000));

    // 4032x3024 is 4:3; at a 2048 longest edge that is 2048x1536.
    expect(prepared?.width).toBe(2048);
    expect(prepared?.height).toBe(1536);
    expect(encodeCalls[0]).toMatchObject({ width: 2048, height: 1536 });
  });

  it('drops quality before it drops resolution', async () => {
    // Losing pixels is more visible than losing JPEG quality, so the ladder
    // exhausts quality at one size before shrinking.
    encodedSizes = [2_000_000, 1_500_000, 900_000];

    await prepareImageForBluesky(fakeFile(6_000_000));

    expect(encodeCalls.slice(0, 3).map((c) => c.width)).toEqual([2048, 2048, 2048]);
    expect(encodeCalls[0].quality).toBeGreaterThan(encodeCalls[1].quality);
    expect(encodeCalls[1].quality).toBeGreaterThan(encodeCalls[2].quality);
  });

  it('shrinks the image once the quality ladder is exhausted', async () => {
    // Five quality steps at 2048 all too big, then a smaller size.
    encodedSizes = [9e6, 9e6, 9e6, 9e6, 9e6, 500_000];

    const prepared = await prepareImageForBluesky(fakeFile(9_000_000));

    expect(prepared?.downscaled).toBe(true);
    expect(encodeCalls[5].width).toBeLessThan(2048);
  });

  it('gives up rather than uploading something too big', async () => {
    // Returning null lets the caller report it. Uploading anyway would fail at
    // the API with a worse message, after the reader had written the post.
    encodedSizes = Array.from({ length: 60 }, () => 9_000_000);

    expect(await prepareImageForBluesky(fakeFile(50_000_000))).toBeNull();
  });

  it('returns null for a file that is not a decodable image', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('not an image')));

    expect(await prepareImageForBluesky(fakeFile(1000, 'application/pdf'))).toBeNull();
  });

  it('re-encodes an oversized image even when its type is already accepted', async () => {
    // A 5MB PNG is a format Bluesky takes, at a size it does not.
    encodedSizes = [700_000];

    const prepared = await prepareImageForBluesky(fakeFile(5_000_000, 'image/png'));

    expect(prepared?.downscaled).toBe(true);
    expect(prepared?.mimeType).toBe('image/jpeg');
  });

  it('releases the decoded bitmap', async () => {
    // Decoded pixel data is several megabytes; four photos without this is a
    // real spike on a phone.
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 4032, height: 3024, close }));
    encodedSizes = [800_000];

    await prepareImageForBluesky(fakeFile(4_000_000));

    expect(close).toHaveBeenCalledOnce();
  });
});
