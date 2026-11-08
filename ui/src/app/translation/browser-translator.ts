import { Injectable } from '@angular/core';

/**
 * The browser's built-in, on-device translator (Chrome 138+ desktop, the
 * `Translator` global). No lib typings exist yet, so this is the minimal shape we use.
 */
export type TranslatorAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface DownloadMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

interface BrowserTranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?(): void;
}

interface TranslatorGlobal {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<TranslatorAvailability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: DownloadMonitor) => void;
  }): Promise<BrowserTranslatorInstance>;
}

function translatorGlobal(): TranslatorGlobal | null {
  const scope = globalThis as unknown as { Translator?: TranslatorGlobal };
  return scope.Translator ?? null;
}

/** Wraps the global so the rest of the app (and its tests) never touch it directly. */
@Injectable({ providedIn: 'root' })
export class BrowserTranslator {
  private instances = new Map<string, Promise<BrowserTranslatorInstance>>();

  /** True when this browser has a built-in translator at all. */
  supported(): boolean {
    return translatorGlobal() !== null;
  }

  async availability(source: string, target: string): Promise<TranslatorAvailability> {
    const api = translatorGlobal();
    if (!api) return 'unavailable';
    try {
      return await api.availability({ sourceLanguage: source, targetLanguage: target });
    } catch {
      return 'unavailable';
    }
  }

  /**
   * Translate plain text, paragraph by paragraph so line breaks survive.
   *
   * When the language model still has to be downloaded, `create()` needs a user
   * gesture: callers must reach this from the click itself (no awaited request in
   * between that could expire the activation) — see TranslationRouter, which only
   * offers a not-yet-downloaded pair to a manual press.
   */
  async translate(
    text: string,
    source: string,
    target: string,
    onProgress?: (loaded: number) => void,
  ): Promise<string> {
    const api = translatorGlobal();
    if (!api) throw new Error('This browser has no built-in translator.');
    const key = `${source}|${target}`;
    let instance = this.instances.get(key);
    if (!instance) {
      instance = api.create({
        sourceLanguage: source,
        targetLanguage: target,
        monitor: (monitor) =>
          monitor.addEventListener('downloadprogress', (event) => onProgress?.(event.loaded)),
      });
      this.instances.set(key, instance);
      // A failed create must not poison the pair for the rest of the session.
      instance.catch(() => this.instances.delete(key));
    }
    const translator = await instance;
    const paragraphs = text.split(/\n{2,}/);
    const out: string[] = [];
    for (const paragraph of paragraphs) {
      out.push(paragraph.trim() ? await translator.translate(paragraph) : paragraph);
    }
    return out.join('\n\n');
  }
}
