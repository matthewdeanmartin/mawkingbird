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

  /** True when some engine other than the server could be tried at all. */
  hasFallback(aiAvailable: boolean): boolean {
    return (
      (this.prefs.browserTranslator() && this.browser.supported()) ||
      this.connectors.myMemoryEnabled() ||
      this.connectors.apertiumEnabled() ||
      aiAvailable
    );
  }

  async translate(request: RouteRequest): Promise<RouteOutcome> {
    const status = request.status.reblog ?? request.status;
    const target = bareLanguage(request.target || this.ai.targetLanguage());
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
        return request.mode === 'manual'
          ? { kind: 'ask', candidates: decision.candidates, target }
          : { kind: 'failed', attempts: [], source: '', target };
      } else {
        source = decision.source;
        fromTag = decision.fromTag;
      }
    }
    if (source === target) return { kind: 'same', language: source };

    const text = plainText(status);
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
        this.usage.record('openrouter');
        try {
          const result = await this.ai.translateText(text, target);
          return { kind: 'text', text: result.text, engine, source, target };
        } catch {
          return 'failed';
        }
      }
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

/** The text an engine translates: content warning, then the body, as plain text. */
export function plainText(status: Status): string {
  const body = htmlToPlainText(status.content);
  return status.spoiler_text ? `${status.spoiler_text}\n\n${body}` : body;
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
  browser: 'This browser',
  mymemory: 'MyMemory',
  apertium: 'Apertium',
  openrouter: 'AI (OpenRouter)',
};
