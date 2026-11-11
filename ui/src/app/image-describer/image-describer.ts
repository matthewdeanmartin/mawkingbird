import { computed, inject, Injectable } from '@angular/core';
import { AiAvailability } from '../ai-availability';
import { AiTranslate } from '../ai-translate';
import { OpenRouterChat } from '../providers/openrouter/openrouter-chat';
import { OpenRouterSession } from '../providers/openrouter/openrouter-session';

/** Longest side sent to the model. Plenty for a description, and far cheaper. */
const MAX_SIDE = 1024;

/**
 * AI alt text through the reader's own OpenRouter connection. Only offered
 * when AI features are on and OpenRouter is connected; every call is an
 * explicit button press, and the result is always shown for review first.
 */
@Injectable({ providedIn: 'root' })
export class ImageDescriber {
  private readonly ai = inject(AiAvailability);
  private readonly session = inject(OpenRouterSession);
  private readonly chat = inject(OpenRouterChat);
  private readonly translate = inject(AiTranslate);

  readonly available = computed(() => this.ai.enabled() && this.session.connected());

  /** Describe a local file (downscaled first) or a remote image URL. */
  async describe(image: Blob | string, language?: string | null): Promise<string> {
    const url = typeof image === 'string' ? image : await downscaledDataUrl(image);
    const text = await this.chat.describeImage(url, language || this.translate.targetLanguage());
    if (!text) throw new Error('The model returned no description. Try again.');
    return text;
  }
}

/** A JPEG data URL no bigger than {@link MAX_SIDE}; the original when it can't be decoded. */
export async function downscaledDataUrl(file: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the image.'));
      reader.readAsDataURL(file);
    });
  }
}
