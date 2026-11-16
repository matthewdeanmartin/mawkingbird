import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { MediaAttachment, Status } from '../../platform/api/models';
import { PLATFORM_MEDIA } from '../../platform/http/platform-http';

// i18n imageActions.copy: 📋 Copy image
// i18n imageActions.save: 💾 Save image
// i18n imageActions.copied: Image copied.
// i18n imageActions.saved: Saved {{name}}.
// i18n imageActions.copyFailed: Couldn’t copy this image.
// i18n imageActions.saveFailed: Couldn’t save this image.

/** The parts of the browser this needs, so specs can stand them in. */
export interface ClipboardHost {
  ClipboardItem?: typeof ClipboardItem;
  clipboard?: Pick<Clipboard, 'write'>;
  fetch: typeof fetch;
  /** PNG re-encoding for formats `ClipboardItem` refuses (most browsers take only PNG). */
  toPng(blob: Blob): Promise<Blob>;
}

async function canvasPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    // A cross-origin image taints the canvas and toBlob throws: the caller
    // reports "Couldn't copy this image".
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('tainted'))), 'image/png'),
  );
}

function browserHost(): ClipboardHost {
  return {
    ClipboardItem: typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem,
    clipboard: typeof navigator === 'undefined' ? undefined : navigator.clipboard,
    fetch: (...args) => fetch(...args),
    toPng: canvasPng,
  };
}

/**
 * `{account}_{post id}_{n}`: the default name for a saved image (parity item 6).
 * Anonymous reads carry a namespaced id; the server's own id is used instead.
 */
export function imageFileName(status: Status | null, index: number): string {
  if (!status) return `image_${index + 1}`;
  const shown = status.reblog ?? status;
  const ref = shown.providerRef as { statusId?: unknown } | undefined;
  const id = typeof ref?.statusId === 'string' ? ref.statusId : shown.id;
  return `${shown.account?.acct ?? 'unknown'}_${id}_${index + 1}`;
}

/**
 * Save or copy an image the app is showing (parity items 6 and 10).
 *
 * Native: both go through Rust, which re-fetches the image through its image
 * transport; the renderer never touches the network or a file path. Web: copy
 * uses `ClipboardItem` (hidden where the browser lacks it); saving keeps the
 * browser's own download behaviour, so it is native-only here.
 */
@Injectable({ providedIn: 'root' })
export class ImageActions {
  private readonly native = inject(PLATFORM_MEDIA);
  private readonly i18n = inject(TranslocoService);
  /** Overridable in specs. */
  host: ClipboardHost = browserHost();

  /** Saving through the OS save dialog exists only in the native build. */
  get canSave(): boolean {
    return !!this.native;
  }

  /** Copying the picture itself: native always, the web where `ClipboardItem` exists. */
  get canCopy(): boolean {
    return !!this.native || (!!this.host.ClipboardItem && !!this.host.clipboard?.write);
  }

  /** Videos, audio and animations are not copied or saved here. */
  isStill(media: Pick<MediaAttachment, 'type'>): boolean {
    return media.type === 'image';
  }

  /** Resolves to a short confirmation, or throws an Error whose message says what failed. */
  async copy(url: string): Promise<string> {
    if (this.native) {
      try {
        await this.native.copyImage(url);
      } catch {
        throw new Error(this.i18n.translate('imageActions.copyFailed'));
      }
      return this.i18n.translate('imageActions.copied');
    }
    const { ClipboardItem: Item, clipboard } = this.host;
    if (!Item || !clipboard?.write) throw new Error(this.i18n.translate('imageActions.copyFailed'));
    try {
      const response = await this.host.fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const png = blob.type === 'image/png' ? blob : await this.host.toPng(blob);
      await clipboard.write([new Item({ 'image/png': png })]);
    } catch {
      throw new Error(this.i18n.translate('imageActions.copyFailed'));
    }
    return this.i18n.translate('imageActions.copied');
  }

  /** Native only. Resolves to a confirmation, or null when the dialog was cancelled. */
  async save(url: string, fileName: string, alt: string | null): Promise<string | null> {
    if (!this.native) return null;
    let saved: string | null;
    try {
      saved = await this.native.saveImage(url, fileName, alt);
    } catch {
      throw new Error(this.i18n.translate('imageActions.saveFailed'));
    }
    return saved ? this.i18n.translate('imageActions.saved', { name: saved }) : null;
  }
}
