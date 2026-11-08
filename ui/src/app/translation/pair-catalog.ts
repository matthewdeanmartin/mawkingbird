import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api';
import { externalFetch } from '../providers/external-fetch';
import { Server } from '../server';
import { bareLanguage, toIso6393 } from './language-codes';

export const PAIR_CACHE_KEY = 'mockingbird_translation_pairs_cache';
const SERVER_TTL_MS = 24 * 60 * 60 * 1000;
const APERTIUM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const APERTIUM_API = 'https://apertium.org/apy';

interface Cached<T> {
  at: number;
  value: T;
}

interface PairCache {
  /** Per server origin; `null` value = the server answered but has no list (404). */
  servers?: Record<string, Cached<Record<string, string[]> | null>>;
  /** `"spa|eng"` strings. */
  apertium?: Cached<string[]>;
}

/** What the server says about a pair before we spend a request on it. */
export type ServerPairAnswer =
  /** Listed: send this as `lang` (may be a regional variant such as `en-GB`). */
  | { ok: true; lang: string }
  /** Not listed, or no translator configured at all. */
  | { ok: false; reason: 'no-provider' | 'unsupported' }
  /** No list (old server, network error): one attempt is allowed. */
  | { ok: null };

function readCache(): PairCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(PAIR_CACHE_KEY) ?? '{}') as PairCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: PairCache): void {
  try {
    localStorage.setItem(PAIR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* A cache that cannot be written is refetched next time. */
  }
}

/** Find `target` in a server's list: exact first, then any regional variant. */
export function matchServerTarget(
  list: Record<string, string[]>,
  source: string,
  target: string,
): ServerPairAnswer {
  if (!Object.keys(list).length) return { ok: false, reason: 'no-provider' };
  const src = bareLanguage(source);
  const targets = list[source] ?? list[src] ?? [];
  const want = bareLanguage(target);
  const exact = targets.find((t) => t.toLowerCase() === target.toLowerCase());
  if (exact) return { ok: true, lang: exact };
  const base = targets.find((t) => t.toLowerCase() === want);
  if (base) return { ok: true, lang: base };
  const regional = targets.find((t) => bareLanguage(t) === want);
  return regional ? { ok: true, lang: regional } : { ok: false, reason: 'unsupported' };
}

/**
 * Which language pairs each engine can do, known before asking it to translate.
 *
 * Mastodon publishes `/api/v1/instance/translation_languages`; without it, every
 * unsupported pair cost a request that came back 403. Apertium publishes
 * `/listPairs`. Both are cached (server 24 h, Apertium 7 days), and a refusal
 * seen during the session overrides a list that claimed the pair was fine.
 */
@Injectable({ providedIn: 'root' })
export class TranslationPairCatalog {
  private api = inject(Api);
  private http = inject(HttpClient);
  private server = inject(Server);
  private refused = new Set<string>();
  private loading = new Map<string, Promise<unknown>>();
  /** Servers that gave no list this session: not asked again until reload. */
  private unlisted = new Set<string>();

  /** Remember a refusal ("403 for this pair") for the rest of the session. */
  markRefused(engine: string, source: string, target: string): void {
    this.refused.add(`${engine}|${bareLanguage(source)}|${bareLanguage(target)}`);
  }

  isRefused(engine: string, source: string, target: string): boolean {
    return this.refused.has(`${engine}|${bareLanguage(source)}|${bareLanguage(target)}`);
  }

  async serverPair(source: string, target: string): Promise<ServerPairAnswer> {
    if (this.isRefused('mastodon', source, target)) return { ok: false, reason: 'unsupported' };
    const list = await this.serverList();
    return list ? matchServerTarget(list, source, target) : { ok: null };
  }

  /** How many source languages the home server translates (0 = none); null when it does not say. */
  async serverLanguageCount(): Promise<number | null> {
    const list = await this.serverList();
    return list ? Object.keys(list).length : null;
  }

  private async serverList(): Promise<Record<string, string[]> | null> {
    const origin = this.server.baseUrl() || 'this-server';
    const cached = readCache().servers?.[origin];
    if (cached && Date.now() - cached.at < SERVER_TTL_MS) return cached.value;
    if (this.unlisted.has(origin)) return null;
    return this.once(`server|${origin}`, async () => {
      let value: Record<string, string[]> | null;
      try {
        value = await firstValueFrom(this.api.translationLanguages());
        if (!value || typeof value !== 'object' || Array.isArray(value)) value = null;
      } catch {
        // Old server or network failure: no answer is not "no translator". Not
        // stored, so a server that comes back is believed after a reload.
        this.unlisted.add(origin);
        return null;
      }
      const cache = readCache();
      writeCache({ ...cache, servers: { ...cache.servers, [origin]: { at: Date.now(), value } } });
      return value;
    });
  }

  async apertiumPair(source: string, target: string): Promise<string | null> {
    const src = toIso6393(source);
    const tgt = toIso6393(target);
    if (!src || !tgt || this.isRefused('apertium', source, target)) return null;
    const pairs = await this.apertiumPairs();
    const pair = `${src}|${tgt}`;
    // An unreachable list allows the attempt; the translate call answers for itself.
    return pairs === null || pairs.includes(pair) ? pair : null;
  }

  private async apertiumPairs(): Promise<string[] | null> {
    const cached = readCache().apertium;
    if (cached && Date.now() - cached.at < APERTIUM_TTL_MS) return cached.value;
    return this.once('apertium', async () => {
      try {
        const reply = await firstValueFrom(
          this.http.get<{ responseData?: { sourceLanguage: string; targetLanguage: string }[] }>(
            `${APERTIUM_API}/listPairs`,
            { context: externalFetch() },
          ),
        );
        const value = (reply.responseData ?? []).map(
          (p) => `${p.sourceLanguage}|${p.targetLanguage}`,
        );
        writeCache({ ...readCache(), apertium: { at: Date.now(), value } });
        return value;
      } catch {
        return null;
      }
    });
  }

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    const running = this.loading.get(key) as Promise<T> | undefined;
    if (running) return running;
    const promise = load().finally(() => this.loading.delete(key));
    this.loading.set(key, promise);
    return promise;
  }
}
