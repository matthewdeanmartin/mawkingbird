import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { defer, Observable, of } from 'rxjs';
import { accountScopeSuffix } from './account-scope';
import { Pseudonymity } from './pseudonymity';

const encodedPhotos = new WeakSet<Blob>();

/** Only call with fresh canvas output; never with bytes copied from an input file. */
export function photoFromEncodedPixels(blob: Blob): File {
  const file = new File([blob], blob.type === 'image/jpeg' ? 'photo.jpg' : 'photo.png', {
    type: blob.type,
    lastModified: 0,
  });
  encodedPhotos.add(file);
  return file;
}

// i18n pseudonymity.mediaFailed: Photo metadata could not be removed. Nothing was uploaded. Use a still JPEG or PNG under 20 MB and 40 megapixels, or change photo cleaning in Pseudonymity settings.
// i18n pseudonymity.postingHint: Pseudonymity is on. Known tracking parameters are removed when link cleaning is enabled. Photo cleaning supports new still JPEG and PNG uploads only; reattach older attachments after enabling it. Check the image, post text and alt text for personal information. Your server may still identify the client application.

/** Validate PNG chunks before decoding so an animation is never silently flattened. */
function stillPng(bytes: Uint8Array): boolean {
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((byte, i) => bytes[i] !== byte)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    const end = offset + size + 12;
    if (end > bytes.length) return false;
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === 'acTL') return false;
    if (type === 'IEND') return size === 0 && end === bytes.length;
    offset = end;
  }
  return false;
}

/** Decode pixels and encode a fresh file: source EXIF, text and filename are not copied. */
export async function cleanPhoto(blob: Blob): Promise<File> {
  // A previously cleaned/downsized immutable File can safely cross both upload
  // boundaries without another lossy encode or growing past Bluesky's limit.
  if (blob instanceof File && encodedPhotos.has(blob)) return blob;
  if (!['image/jpeg', 'image/png'].includes(blob.type) || blob.size > 20_000_000)
    throw new Error('Unsupported image');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (
    blob.type === 'image/png'
      ? !stillPng(bytes)
      : bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255
  )
    throw new Error('Invalid or animated image');
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('Image too large');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, blob.type, 0.95),
    );
    if (!encoded || encoded.type !== blob.type || !encoded.size) throw new Error('Encoding failed');
    return photoFromEncodedPixels(encoded);
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}

@Injectable({ providedIn: 'root' })
export class PrivateMedia {
  private pseudonymity = inject(Pseudonymity);
  private transloco = inject(TranslocoService);

  prepare(blob: Blob): Observable<Blob> {
    if (!this.pseudonymity.cleanMedia()) return of(blob);
    const scope = accountScopeSuffix();
    return defer(async () => {
      try {
        const cleaned = await cleanPhoto(blob);
        if (accountScopeSuffix() !== scope) throw new Error('Account changed');
        return cleaned;
      } catch {
        throw new Error(this.transloco.translate('pseudonymity.mediaFailed'));
      }
    });
  }
}
