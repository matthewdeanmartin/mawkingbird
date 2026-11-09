import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AiTranslate, htmlToPlainText } from '../ai-translate';
import { Api } from '../api';
import { ClientPrefs } from '../client-prefs';
import { Status, Translation } from '../models';
import { FeedLanguageFilter } from '../trend-language-filter';
import { TRANSLATION_ENGINES, TranslationEngine, TranslationUsage } from '../translation-usage';
import { BrowserTranslator } from './browser-translator';
import { FreeTranslators, TranslatorRefusal } from './free-translators';
import { bareLanguage } from './language-codes';
import { TranslationPairCatalog } from './pair-catalog';
import { resolveSource } from './source-language';
import { TranslationConnectors } from './translation-connectors';
import { Auth } from '../auth';
import { MisskeyApi, MisskeyApiError } from '../providers/misskey/misskey-api';
import { TranslationCache, translationCacheKey } from './translation-cache';
import { AiBudget } from './ai-budget';
import { AiAvailability } from '../ai-availability';
import { OpenRouterSession } from '../providers/openrouter/openrouter-session';
import { AiBatchTranslator } from './ai-batch';

/** Why an engine was passed over. Shown to the reader when every engine fails. */
export type SkipReason =
  /** Switched off, or a connector that is not connected. */
  | 'off'
  /** The server cannot see this post, or there is no signed-in server. */
  | 'no-server'
  /** The post's tag is wrong, and the server can only translate from the tag. */
  | 'wrong-tag'
  /** The server has no translator configured at all. */
  | 'no-provider'
  /** This engine does not do this language pair. */
  | 'unsupported'
  /** The engine's model must be downloaded first, which needs a button press. */
  | 'needs-download'
  /** The daily budget for this engine is used up. */
  | 'budget'
  /** Not used by automatic translation. */
  | 'auto-excluded'
  /** It tried and failed. */
  | 'failed';

export interface Attempt {
  engine: TranslationEngine;
  reason: SkipReason;
}

export interface RouteRequest {
  status: Status;
  mode: 'manual' | 'auto';
  /** Target language (ISO 639-1); defaults to the reader's. */
  target?: string;
  /** A source the reader picked: overrides detection. */
  source?: string;
  /** Translate even when the post looks like it is already in the target language. */
  force?: boolean;
  /** Whether the home server can see this post (signed in, not a read-only provider). */
  serverCanTranslate: boolean;
  /** Whether AI translation is available (OpenRouter connected and AI switched on). */
  aiAvailable: boolean;
  /** Skip these engines (the reader's preference already tried them). */
  skip?: readonly TranslationEngine[];
  /** Model download progress for the browser translator, 0–1. */
  onProgress?: (loaded: number) => void;
}

export type RouteOutcome =
  | { kind: 'server'; translation: Translation; source: string; target: string }
  | { kind: 'text'; text: string; engine: TranslationEngine; source: string; target: string }
  /** Confidently already in the target language (and the reader skips those). */
  | { kind: 'same'; language: string }
  /** No trustworthy source language: ask the reader (automatic mode never does). */
  | { kind: 'ask'; candidates: string[]; target: string }
  | { kind: 'failed'; attempts: Attempt[]; source: string; target: string };

/**
 * The fallback chain: server → this browser → MyMemory → Apertium → AI.
 *
 * Each engine is asked a cheap question first (is it on, does it do this pair, is
 * there budget left) so a refusal costs nothing. Automatic translation never uses
 * AI unless the reader allowed it, and never downloads a browser language model.
 */
@Injectable({ providedIn: 'root' })
export class TranslationRouter {
  private api = inject(Api);
  private prefs = inject(ClientPrefs);
  private usage = inject(TranslationUsage);
  private pairs = inject(TranslationPairCatalog);
  private browser = inject(BrowserTranslator);
  private free = inject(FreeTranslators);
  private connectors = inject(TranslationConnectors);
  private ai = inject(AiTranslate);
  private languages = inject(FeedLanguageFilter);
  private auth = inject(Auth);
  private misskey = inject(MisskeyApi);
  private cache = inject(TranslationCache);
  private aiBudget = inject(AiBudget);
  private batch = inject(AiBatchTranslator);
  private aiAvailability = inject(AiAvailability);
  private openrouter = inject(OpenRouterSession);

  /** OpenRouter connected and AI features on: the reader can pay for AI translation. */
  aiConnected(): boolean {
    return this.aiAvailability.enabled() && this.openrouter.connected();
  }
  /** Misskey servers that said they cannot translate (no DeepL key, or role policy). */
  private readonly misskeyUnavailable = new Set<string>();
  /** Per server: does its `meta` say a translator is configured? Asked once. */
  private readonly misskeyTranslator = new Map<string, Promise<boolean>>();

  /**
   * Whether a Misskey server has a translator, from its public `meta`. Unknown
   * (meta failed) counts as yes: one real attempt then settles it.
   */
  misskeyServerTranslates(server: string): Promise<boolean> {
    let answer = this.misskeyTranslator.get(server);
    if (!answer) {
      answer = firstValueFrom(this.misskey.meta(server)).then(
        (meta) => meta.translatorAvailable !== false,
        () => true,
      );
      this.misskeyTranslator.set(server, answer);
    }
    return answer;
  }

  /**
   * Whether automatic translation has any engine it may use for `source` →
   * the reader's language, without a click: the Misskey server's translator,
   * MyMemory, Apertium, or a browser model that is already downloaded. False
   * means automatic mode will silently do nothing, which the reader should
   * be told rather than left to wonder.
   */
  async automaticEngineAvailable(source: string, misskeyServer: string | null): Promise<boolean> {
    // AI, when the reader allowed it for automatic mode and today's budget has room.
    if (this.aiConnected() && this.prefs.autoTranslateUsesAi() && this.aiBudget.canSpend()) {
      return true;
    }
    if (misskeyServer && !this.misskeyUnavailable.has(misskeyServer)) {
      if (await this.misskeyServerTranslates(misskeyServer)) return true;
    }
    if (this.connectors.myMemoryEnabled()) return true;
    const target = bareLanguage(this.ai.targetLanguage());
    if (this.connectors.apertiumEnabled() && (await this.pairs.apertiumPair(source, target))) {
      return true;
    }
    if (this.prefs.browserTranslator() && this.browser.supported()) {
      return (await this.browser.availability(source, target)) === 'available';
    }
    return false;
  }

  /**
   * Whether this post can go to the reader's Misskey server: a Misskey note,
   * read as the active Misskey identity, on a server not already known to
   * have no translator. Its DeepL detects the source itself.
   */
  misskeyCanTry(status: Status | null | undefined): boolean {
    const post = status?.reblog ?? status;
    if (post?.provider !== 'misskey' || !this.auth.activeMisskeyKey()) return false;
    const server = (post.providerRef as { server?: string } | undefined)?.server ?? '';
    return !this.misskeyUnavailable.has(server);
  }

  /** True when some engine other than the server could be tried at all. */
  hasFallback(aiAvailable: boolean, status?: Status | null): boolean {
    return (
      this.misskeyCanTry(status) ||
      (this.prefs.browserTranslator() && this.browser.supported()) ||
      this.connectors.myMemoryEnabled() ||
      this.connectors.apertiumEnabled() ||
      aiAvailable
    );
  }

  async translate(request: RouteRequest): Promise<RouteOutcome> {
    const status = request.status.reblog ?? request.status;
    const target = bareLanguage(request.target || this.ai.targetLanguage());
    // Nothing to translate (only emoji, links, mentions or tags): no engine is
    // asked, so no call is spent. The card hides its button for these too.
    if (!hasTranslatableText(status)) {
      return { kind: 'failed', attempts: [], source: '', target };
    }
    let source: string;
    let fromTag: boolean;
    const declared = bareLanguage(status.language);

    if (request.source) {
      source = bareLanguage(request.source);
      fromTag = source === declared;
    } else {
      const detected = this.languages.languageAssessment(status);
      const decision = resolveSource(status.language, detected, target);
      if (decision.kind === 'same') {
        const skipSame = this.prefs.skipSameLanguageTranslation() && !request.force;
        if (skipSame) return { kind: 'same', language: decision.language };
        if (declared && declared !== 'und' && declared !== target) {
          source = declared;
          fromTag = true;
        } else {
          return request.mode === 'manual'
            ? { kind: 'ask', candidates: [...detected.candidates], target }
            : { kind: 'failed', attempts: [], source: '', target };
        }
      } else if (decision.kind === 'ask') {
        // A Misskey note can still go to its server, whose DeepL detects the
        // language itself: the kanji-only (Japanese or Chinese?) case needs no
        // guess. Only if that fails does the reader get asked.
        if (this.misskeyCanTry(status) && !request.skip?.includes('misskey')) {
          const outcome = await this.misskeyOnly(request, status, target);
          if (outcome) return outcome;
        }
        // Still undecided on a Misskey note, with Japanese among the
        // candidates (usually a short kanji-only line): Misskey is
        // overwhelmingly Japanese, so translating from Japanese beats asking
        // the reader every time (owner report, 2026-11-10). "Change" under the
        // result still lets them pick.
        if (
          status.provider === 'misskey' &&
          decision.candidates.includes('ja') &&
          target !== 'ja'
        ) {
          source = 'ja';
          fromTag = false;
        } else {
          return request.mode === 'manual'
            ? { kind: 'ask', candidates: decision.candidates, target }
            : { kind: 'failed', attempts: [], source: '', target };
        }
      } else {
        source = decision.source;
        fromTag = decision.fromTag;
      }
    }
    if (source === target) return { kind: 'same', language: source };

    const text = plainText(status);
    // The cache answers ordinary requests only: a reader who picked a source or
    // skipped engines is asking for something different from what is stored.
    const cacheKey =
      !request.source && !request.skip?.length
        ? translationCacheKey(status.uri ?? status.url ?? status.id, text, target)
        : null;
    if (cacheKey) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return { kind: 'text', ...cached };
    }
    const attempts: Attempt[] = [];
    for (const engine of TRANSLATION_ENGINES) {
      if (request.skip?.includes(engine)) continue;
      const result = await this.tryEngine(engine, {
        request,
        status,
        text,
        source,
        target,
        fromTag,
      });
      if (typeof result === 'string') {
        attempts.push({ engine, reason: result });
        continue;
      }
      if (cacheKey && result.kind === 'text') {
        void this.cache.put(cacheKey, {
          text: result.text,
          engine: result.engine,
          source: result.source,
          target: result.target,
        });
      }
      return result;
    }
    return { kind: 'failed', attempts, source, target };
  }

  private async tryEngine(
    engine: TranslationEngine,
    job: {
      request: RouteRequest;
      status: Status;
      text: string;
      source: string;
      target: string;
      fromTag: boolean;
    },
  ): Promise<RouteOutcome | SkipReason> {
    const { request, status, text, source, target } = job;
    const auto = request.mode === 'auto';
    switch (engine) {
      case 'mastodon': {
        if (!request.serverCanTranslate) return 'no-server';
        if (!job.fromTag) return 'wrong-tag';
        const pair = await this.pairs.serverPair(source, target);
        if (pair.ok === false) return pair.reason;
        if (!this.usage.canSpend('mastodon')) return 'budget';
        this.usage.record('mastodon');
        try {
          const lang = pair.ok ? pair.lang : target;
          const translation = await firstValueFrom(this.api.translate(status.id, lang));
          return { kind: 'server', translation, source, target };
        } catch (error) {
          // 403: the pair (or the post) is not translatable here; don't ask again.
          if (error instanceof HttpErrorResponse && error.status === 403) {
            this.pairs.markRefused('mastodon', source, target);
            return 'unsupported';
          }
          if (error instanceof HttpErrorResponse && error.status === 404) return 'no-provider';
          return 'failed';
        }
      }
      case 'misskey':
        return this.tryMisskey(status, target);
      case 'browser': {
        if (!this.prefs.browserTranslator() || !this.browser.supported()) return 'off';
        const availability = await this.browser.availability(source, target);
        if (availability === 'unavailable') return 'unsupported';
        // Downloading a model needs a user gesture; nobody pressed anything in auto mode.
        if (availability !== 'available' && auto) return 'needs-download';
        try {
          const translated = await this.browser.translate(text, source, target, request.onProgress);
          this.usage.record('browser');
          return { kind: 'text', text: translated, engine, source, target };
        } catch (error) {
          return (error as Error)?.name === 'NotAllowedError' ? 'needs-download' : 'failed';
        }
      }
      case 'mymemory': {
        if (!this.connectors.myMemoryEnabled()) return 'off';
        if (this.pairs.isRefused('mymemory', source, target)) return 'unsupported';
        if (!this.usage.canSpend('mymemory', text.length)) return 'budget';
        this.usage.record('mymemory', text.length);
        try {
          const translated = await this.free.myMemory(
            text,
            source,
            target,
            this.connectors.myMemoryEmail(),
          );
          return { kind: 'text', text: translated, engine, source, target };
        } catch (error) {
          return this.refusal('mymemory', error, source, target);
        }
      }
      case 'apertium': {
        if (!this.connectors.apertiumEnabled()) return 'off';
        const pair = await this.pairs.apertiumPair(source, target);
        if (!pair) return 'unsupported';
        if (!this.usage.canSpend('apertium')) return 'budget';
        this.usage.record('apertium');
        try {
          const translated = await this.free.apertium(text, pair);
          return { kind: 'text', text: translated, engine, source, target };
        } catch (error) {
          return this.refusal('apertium', error, source, target);
        }
      }
      case 'openrouter': {
        if (!request.aiAvailable) return 'off';
        if (auto && !this.prefs.autoTranslateUsesAi()) return 'auto-excluded';
        if (!this.usage.canSpend('openrouter')) return 'budget';
        // The dollar cap (default $0.25 a day) is the real limit; reaching it
        // offers, once a day, to raise it rather than stopping silently.
        if (!this.aiBudget.canSpend()) {
          this.aiBudget.refused();
          return 'budget';
        }
        try {
          // Scrolling sends posts in batches (one call per screenful), which
          // count as one call each in the usage limits; a pressed button is
          // answered alone, since the reader is waiting.
          if (!auto) this.usage.record('openrouter');
          const result = auto
            ? await this.batch.translate(text, target)
            : await this.ai.translateTextWithCost(text, target);
          this.aiBudget.record(result.costUsd ?? null);
          return { kind: 'text', text: result.text, engine, source, target };
        } catch {
          return 'failed';
        }
      }
    }
  }

  /** The Misskey engine alone, for a note whose source language is unknown. */
  private async misskeyOnly(
    request: RouteRequest,
    status: Status,
    target: string,
  ): Promise<RouteOutcome | null> {
    const text = plainText(status);
    const cacheKey = translationCacheKey(status.uri ?? status.url ?? status.id, text, target);
    if (!request.source) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return { kind: 'text', ...cached };
    }
    const result = await this.tryMisskey(status, target);
    if (typeof result === 'string' || result.kind !== 'text') return null;
    void this.cache.put(cacheKey, {
      text: result.text,
      engine: result.engine,
      source: result.source,
      target: result.target,
    });
    return result;
  }

  private async tryMisskey(status: Status, target: string): Promise<RouteOutcome | SkipReason> {
    if (!this.misskeyCanTry(status)) return status.provider === 'misskey' ? 'off' : 'no-server';
    if (!this.usage.canSpend('misskey')) return 'budget';
    const ref = status.providerRef as { server: string; noteId: string };
    if (!(await this.misskeyServerTranslates(ref.server))) {
      this.misskeyUnavailable.add(ref.server);
      return 'no-provider';
    }
    this.usage.record('misskey');
    try {
      const result = await firstValueFrom(this.misskey.translate(ref.noteId, target));
      if (!result?.text) return 'failed';
      return {
        kind: 'text',
        // The server joined CW and body with a rule; show them as two paragraphs.
        text: result.text.replace(/\n-{3,}\n/, '\n\n'),
        engine: 'misskey',
        source: bareLanguage(result.sourceLang) || 'und',
        target,
      };
    } catch (error) {
      if (error instanceof MisskeyApiError && error.code === 'UNAVAILABLE') {
        this.misskeyUnavailable.add(ref.server);
        return 'no-provider';
      }
      return 'failed';
    }
  }

  private refusal(
    engine: TranslationEngine,
    error: unknown,
    source: string,
    target: string,
  ): SkipReason {
    if (error instanceof TranslatorRefusal) {
      if (error.reason === 'unsupported') {
        this.pairs.markRefused(engine, source, target);
        return 'unsupported';
      }
      if (error.reason === 'quota') {
        // The service's own count is the truth: stop asking it until tomorrow.
        this.usage.record(engine, this.usage.remainingToday(engine));
        return 'budget';
      }
    }
    return 'failed';
  }
}

/** The text an engine translates: content warning, body, image descriptions and poll choices. */
export function plainText(status: Status): string {
  const body = htmlToPlainText(status.content);
  const main = status.spoiler_text ? `${status.spoiler_text}\n\n${body}` : body;
  // Mastodon's own translator returns translated alt text and poll options;
  // the other engines only see this string, so those parts ride along as
  // marked lines (🖼 an image description, ☐ a poll choice). The marks are
  // symbols, so no engine tries to translate them.
  const extras = [
    ...(status.media_attachments ?? [])
      .map((media) => media.description?.trim())
      .filter((alt): alt is string => !!alt)
      .map((alt) => `🖼 ${alt}`),
    ...(status.poll?.options ?? []).map((option) => `☐ ${option.title}`),
  ];
  return extras.length ? `${main}\n\n${extras.join('\n')}` : main;
}

/** A translation shown as plain text, from any engine but the server. */
export interface ChainTranslation {
  /** Untrusted text from a third party, a model or the browser. Render with `{{ }}`. */
  text: string;
  engine: TranslationEngine;
  source: string;
  target: string;
}

/** Short engine names for the line under a translation and the failure message. */
export const CHAIN_ENGINE_NAMES: Record<TranslationEngine, string> = {
  mastodon: 'Your server',
  misskey: 'Your Misskey server',
  browser: 'This browser',
  mymemory: 'MyMemory',
  apertium: 'Apertium',
  openrouter: 'AI (OpenRouter)',
};

/**
 * Whether a post has words worth translating.
 *
 * Misskey notes are often only emoji, custom emoji (`:blobcat:`), a link or a
 * mention. Sending those to a translator spends a call (or money) to get the
 * same thing back. Counts letters left after removing URLs, mentions,
 * hashtags and custom-emoji shortcodes; one letter is enough, since a single
 * kanji (草, "lol") is a word.
 */
export function hasTranslatableText(status: Status): boolean {
  const text = plainText(status)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(^|\s)@[\w.-]+(@[\w.-]+)?/g, ' ')
    .replace(/(^|\s)#[^\s#]+/gu, ' ')
    .replace(/:[a-z0-9_+-]+:/gi, ' ');
  return /\p{L}/u.test(text);
}
