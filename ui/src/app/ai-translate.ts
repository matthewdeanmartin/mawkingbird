import { inject, Injectable } from '@angular/core';
import { OpenRouterChat } from './providers/openrouter/openrouter-chat';
import { OpenRouterModelChoice } from './providers/openrouter/openrouter-model-choice';
import { PromptTemplateStore } from './providers/openrouter/prompt-templates';
import { ClientPrefs } from './client-prefs';

/**
 * Translate a post with the user's chosen model.
 *
 * The result is deliberately **not** a `Translation` (`models.ts`): that type carries
 * server-sanitized HTML which `status-card` pipes through `applyMinimalMarkdown` into
 * `[innerHTML]`. Model output has been sanitized by nobody. Giving it a distinct
 * shape means it cannot accidentally be handed to the HTML path — the type system
 * enforces what a comment would only ask for.
 */

export interface AiTranslation {
  /** Untrusted plain text. Render with `{{ }}`, never `[innerHTML]`. */
  text: string;
  /** Which model produced it, so the note under the post can say. */
  model: string;
  /** The language we asked for, as a display name. */
  target: string;
}

/** Language names for the codes the app already offers, plus the common rest. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
  sv: 'Swedish',
  uk: 'Ukrainian',
  eo: 'Esperanto',
};

/** A two-letter code as a language name, falling back to the code itself. */
export function languageName(code: string): string {
  const bare = code.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGE_NAMES[bare] ?? bare.toUpperCase();
}

/**
 * HTML in, readable text out.
 *
 * The post body arrives as the server's HTML. Sending tags to the model wastes
 * tokens and invites it to "translate" the markup, so they come off first — and
 * block boundaries become newlines rather than vanishing, or the last word of one
 * paragraph would fuse to the first of the next.
 */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

@Injectable({ providedIn: 'root' })
export class AiTranslate {
  private chat = inject(OpenRouterChat);
  private prompts = inject(PromptTemplateStore);
  private model = inject(OpenRouterModelChoice);
  private prefs = inject(ClientPrefs);

  /**
   * The language to translate into.
   *
   * The user's first known language when they have set any — that list is the app's
   * best statement of what they read — otherwise the browser locale. Never a
   * hardcoded `en`: an app that assumes English is the destination is the reason
   * this feature is worth having.
   */
  targetLanguage(): string {
    const known = this.prefs.knownLanguages();
    if (known.length) {
      return known[0];
    }
    const locale = typeof navigator === 'undefined' ? '' : navigator.language;
    return locale ? locale.split(/[-_]/)[0].toLowerCase() : 'en';
  }

  /** Translate a post body (server HTML) into the user's language. */
  async translateHtml(html: string): Promise<AiTranslation> {
    return this.translateText(htmlToPlainText(html));
  }

  /**
   * Translate plain text. `targetCode` overrides the reading default: the
   * post-reading path wants "into *my* language", but the composer wants "into
   * the language I am about to post in", which is usually not the same one.
   */
  async translateText(text: string, targetCode?: string): Promise<AiTranslation> {
    const source = text.trim();
    if (!source) {
      throw new Error('There is nothing to translate.');
    }
    const target = languageName(targetCode || this.targetLanguage());
    const translated = await this.chat.complete({
      prompt: this.prompts.render('translate', { text: source, target }),
      source,
    });
    return { text: translated, model: this.model.modelId(), target };
  }
}
