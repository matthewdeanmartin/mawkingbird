import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import PATHS from '../../public-pages/youtubers/youtuber-paths.generated.json';
import type { YoutuberPack, YoutuberPaths } from '../../public-pages/youtubers/youtuber-types';

export type {
  YoutuberMember,
  YoutuberPack,
  YoutuberVideo,
} from '../../public-pages/youtubers/youtuber-types';

/** What is bundled: kits per language and their public paths. A few hundred bytes. */
export const YOUTUBER_PATHS = PATHS as YoutuberPaths;

/** The reader's language if it has kits, else English, else the largest language. */
export function preferredKitLanguage(
  available: Record<string, number>,
  wanted: readonly string[],
): string | null {
  const langs = Object.keys(available);
  if (!langs.length) return null;
  for (const lang of wanted) {
    const exact = langs.find((l) => l.toLowerCase() === lang.toLowerCase());
    if (exact) return exact;
    const base = langs.find((l) => l.toLowerCase() === lang.split('-')[0].toLowerCase());
    if (base) return base;
  }
  if (available['en']) return 'en';
  return langs.sort((a, b) => available[b] - available[a] || a.localeCompare(b))[0];
}

/** A pack's title in the reader's language, falling back to English. */
export function packTitle(pack: Pick<YoutuberPack, 'title'>, lang: string): string {
  return pack.title[lang] ?? pack.title[lang.split('-')[0]] ?? pack.title['en'] ?? '';
}

/**
 * The in-app view of YouTubers on Mastodon (spec/youtube-client.md, S5–S6).
 * Kit data is the same per-language bundle the public pages prerender from,
 * imported lazily (`youtuber-data.generated.ts`): nothing loads until video
 * mode asks, and it works offline in Native.
 */
@Injectable({ providedIn: 'root' })
export class YoutuberKits {
  private readonly transloco = inject(TranslocoService);
  private readonly files = new Map<string, Promise<YoutuberPack[]>>();
  /** Whether any kits are bundled. */
  readonly available = signal(Object.keys(YOUTUBER_PATHS.languages).length > 0);

  /** Kits per language (no data loaded). */
  languages(): Record<string, number> {
    return YOUTUBER_PATHS.languages;
  }

  packs(lang: string): Promise<YoutuberPack[]> {
    if (!YOUTUBER_PATHS.languages[lang]) return Promise.resolve([]);
    let file = this.files.get(lang);
    if (!file) {
      file = import('../../public-pages/youtubers/youtuber-data.generated')
        .then(({ YOUTUBER_DATA }) => YOUTUBER_DATA[lang]?.())
        .then((data) => (data?.version === 1 ? data.packs : []))
        .catch(() => []);
      this.files.set(lang, file);
    }
    return file;
  }

  /** The reader's languages, most preferred first: the app's language, then the browser's. */
  wantedLanguages(): string[] {
    const browser = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [])];
    return [this.transloco.getActiveLang(), ...browser].filter(Boolean);
  }
}
