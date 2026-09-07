/**
 * Fitting a phone photo into Bluesky's blob limit.
 *
 * Bluesky refuses an image blob over ~1MB. A photo straight off a phone camera
 * is routinely 3–5MB, so without this the attach feature would fail on exactly
 * the device it matters most on — the official client downscales for the same
 * reason.
 *
 * Deliberately re-encodes rather than refusing: the reader's call was "downscale
 * in the browser before upload". A refusal is honest but close to unusable on a
 * phone, where almost every photo would bounce.
 */

/**
 * Bluesky's documented blob ceiling is 1,000,000 bytes. Target a little under,
 * because the ceiling applies to what arrives and a near-miss costs a whole
 * round trip to discover.
 */
export const BSKY_BLOB_LIMIT = 1_000_000;
const TARGET_BYTES = 950_000;

/**
 * Longest edge to try first. 2048 is above what the Bluesky app displays at, so
 * nothing visible is lost on the common path, and it is small enough that most
 * photos come in under the limit on the first attempt.
 */
const MAX_EDGE = 2048;

/** Quality ladder for the JPEG re-encode, tried in order until one fits. */
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5];

/**
 * How far the longest edge shrinks per full ladder pass. After exhausting the
 * quality steps at one size, the image is halved and the ladder runs again.
 */
const EDGE_FALLOFF = 0.7;
const MIN_EDGE = 480;

export interface PreparedImage {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  /** True when the bytes were re-encoded rather than passed through untouched. */
  downscaled: boolean;
}

/**
 * A file small enough already is passed through untouched.
 *
 * Re-encoding a 200KB PNG into a JPEG would strip transparency and lose quality
 * for no gain, so the cheap path really is "do nothing" — and it is the common
 * one for screenshots and images that have been through a resizer already.
 */
function passthrough(file: File, width: number, height: number): PreparedImage {
  return { blob: file, mimeType: file.type, width, height, downscaled: false };
}

/**
 * Decode a file far enough to know its dimensions, without a DOM `<img>`.
 *
 * `createImageBitmap` is the one that works off the main thread and handles EXIF
 * orientation for us. It is present in every browser this app supports; the
 * caller treats a throw as "not an image we can prepare" and reports it rather
 * than silently dropping the attachment.
 */
async function decode(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const ratio = maxEdge / longest;
  // Never round to zero: a very wide, very short image still needs one pixel.
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** Re-encode `bitmap` at `size` and `quality`, as a JPEG. */
async function encode(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/**
 * Prepare `file` for `uploadBlob`: untouched when it already fits, otherwise
 * re-encoded down a quality-then-size ladder until it does.
 *
 * Returns null when the file cannot be decoded as an image, or when even the
 * smallest step will not fit — both are reported to the reader rather than
 * silently dropped, because an attachment that vanishes between picking it and
 * posting is the failure this whole feature exists to end.
 */
export async function prepareImageForBluesky(file: File): Promise<PreparedImage | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return null;
  }
  try {
    // Already small enough, and already a format Bluesky accepts.
    if (file.size <= TARGET_BYTES && /^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      return passthrough(file, bitmap.width, bitmap.height);
    }

    for (
      let maxEdge = MAX_EDGE;
      maxEdge >= MIN_EDGE;
      maxEdge = Math.round(maxEdge * EDGE_FALLOFF)
    ) {
      const size = scaledSize(bitmap.width, bitmap.height, maxEdge);
      for (const quality of QUALITY_STEPS) {
        const blob = await encode(bitmap, size, quality);
        if (!blob) {
          return null;
        }
        if (blob.size <= TARGET_BYTES) {
          return {
            blob,
            mimeType: 'image/jpeg',
            width: size.width,
            height: size.height,
            downscaled: true,
          };
        }
      }
    }
    return null;
  } finally {
    // Bitmaps hold decoded pixel data — several megabytes each. Attaching four
    // photos without releasing them is a real memory spike on a phone.
    bitmap.close();
  }
}
