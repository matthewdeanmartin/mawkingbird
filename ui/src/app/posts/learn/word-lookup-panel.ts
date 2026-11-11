import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { Status } from '../../platform/api/models';
import { OpenRouterChat } from '../../connections/openrouter/openrouter-chat';
import { OpenRouterSession } from '../../connections/openrouter/openrouter-session';
import { plainText } from '../../translation/translation-router';
import { DictEntry, DictManifest, LanguageDictionary } from './dictionary/dictionary';
import { dictionaryFor } from './dictionary/dictionary-registry';
import {
  LookupHit,
  LookupMatch,
  lookupAt,
  segmentWords,
  TextToken,
} from './dictionary/word-lookup';

// i18n learn.lookup.hint: Tap a word to look it up.
// i18n learn.lookup.loading: Looking up…
// i18n learn.lookup.none: No dictionary entry for “{{word}}”.
// i18n learn.lookup.unavailable: The dictionary for this language is not available yet.
// i18n learn.lookup.inflected: {{surface}} is {{word}} ({{reasons}})
// i18n learn.lookup.more: More on {{site}}
// i18n learn.lookup.explain: Explain in this sentence
// i18n learn.lookup.explaining: Asking the model…
// i18n learn.lookup.explainFailed: Could not get an explanation. {{error}}
// i18n learn.lookup.explainNote: AI explanation (OpenRouter). Can be wrong.
// i18n learn.lookup.credit: Dictionary: {{name}}, {{publisher}}, {{licence}}
// i18n learn.lookup.words: Words in this post
// i18n learn.lookup.close: Close
// i18n learn.lookup.reason.polite: polite
// i18n learn.lookup.reason.politePast: polite past
// i18n learn.lookup.reason.politeNegative: polite negative
// i18n learn.lookup.reason.politePastNegative: polite past negative
// i18n learn.lookup.reason.politeVolitional: polite “let's”
// i18n learn.lookup.reason.want: want to
// i18n learn.lookup.reason.past: past
// i18n learn.lookup.reason.te: te-form
// i18n learn.lookup.reason.negative: negative
// i18n learn.lookup.reason.passiveOrPotential: passive or potential
// i18n learn.lookup.reason.potential: potential
// i18n learn.lookup.reason.passive: passive
// i18n learn.lookup.reason.causative: causative
// i18n learn.lookup.reason.volitional: “let's”
// i18n learn.lookup.reason.conditional: conditional
// i18n learn.lookup.reason.imperative: imperative
// i18n learn.lookup.reason.suruVerb: with する
// i18n learn.lookup.reason.adverb: adverb
// i18n learn.lookup.reason.noun: noun
// i18n learn.lookup.reason.seems: seems
// i18n learn.lookup.reason.too: too much
// i18n learn.lookup.reason.progressive: ongoing
// i18n learn.lookup.reason.completed: completed

/** Entries shown per lookup; the rest are a "More" away. */
const MAX_HITS = 3;
/** Senses shown per entry. */
const MAX_SENSES = 3;

const LANGUAGE_NAMES: Record<string, string> = {
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
};

/**
 * Tap a word (sprint L1): the post's text, split into words, each one a
 * button; a tap shows the longest dictionary word starting there, with its
 * reading, meanings and how it is inflected, and offers an AI explanation of
 * the word in this very sentence.
 *
 * Loaded only when a reader opens it (the status card defers it), and its
 * dictionary only when a word is first tapped. Shows the dictionary's credit
 * under every result, as the JMdict licence asks.
 */
@Component({
  selector: 'app-word-lookup-panel',
  imports: [MbButton, TranslocoPipe],
  // Taps inside the panel are not taps on the post (which would open it).
  host: { '(click)': '$event.stopPropagation()' },
  template: `
    <section class="word-lookup" [attr.aria-label]="'learn.lookup.words' | transloco">
      <p class="hint muted small">{{ 'learn.lookup.hint' | transloco }}</p>
      <p class="words" [lang]="language()">
        @for (token of tokens(); track token.index) {
          @if (token.word) {
            <button
              type="button"
              class="word"
              [class.selected]="isSelected(token)"
              (click)="tap(token)"
              [textContent]="token.text"
            ></button>
          } @else {
            <span [textContent]="token.text"></span>
          }
        }
      </p>

      <div class="result" aria-live="polite">
        @if (unavailable()) {
          <p class="muted small">{{ 'learn.lookup.unavailable' | transloco }}</p>
        } @else if (looking()) {
          <p class="muted small">{{ 'learn.lookup.loading' | transloco }}</p>
        } @else if (notFound(); as word) {
          <p class="muted small">{{ 'learn.lookup.none' | transloco: { word } }}</p>
        } @else if (match(); as found) {
          @for (hit of hits(); track $index) {
            <article class="entry" [lang]="language()">
              <h3 class="headword">
                <span class="form">{{ headword(hit.entry) }}</span>
                @if (reading(hit.entry); as kana) {
                  <span class="reading">{{ kana }}</span>
                }
              </h3>
              @if (hit.deinflection.reasons.length) {
                <p class="inflected muted small">
                  {{
                    'learn.lookup.inflected'
                      | transloco
                        : {
                            surface: found.surface,
                            word: hit.deinflection.word,
                            reasons: reasons(hit),
                          }
                  }}
                </p>
              }
              <ol class="senses">
                @for (sense of hit.entry.senses.slice(0, maxSenses); track $index) {
                  <li>
                    @if (sense.pos.length) {
                      <span class="pos muted small" [title]="describe(sense.pos)">{{
                        sense.pos.join(', ')
                      }}</span>
                    }
                    {{ sense.glosses.join('; ') }}
                  </li>
                }
              </ol>
            </article>
          }
          <div class="actions">
            @if (aiConnected()) {
              <button
                mbButton
                variant="outline"
                size="small"
                type="button"
                [disabled]="explaining()"
                (click)="explain(found)"
              >
                {{
                  (explaining() ? 'learn.lookup.explaining' : 'learn.lookup.explain') | transloco
                }}
              </button>
            }
            @if (moreUrl(found); as url) {
              <a class="small" [href]="url" target="_blank" rel="noopener noreferrer">{{
                'learn.lookup.more' | transloco: { site: moreSite(url) }
              }}</a>
            }
          </div>
          @if (explanation(); as text) {
            <div class="explanation">
              <p>{{ text }}</p>
              <p class="muted small">{{ 'learn.lookup.explainNote' | transloco }}</p>
            </div>
          }
          @if (explainError(); as error) {
            <p class="error small" role="alert">
              {{ 'learn.lookup.explainFailed' | transloco: { error } }}
            </p>
          }
          @if (dictionary(); as dict) {
            <p class="credit muted small">
              <a
                [href]="dict.source.attribution.projectUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{
                  'learn.lookup.credit'
                    | transloco
                      : {
                          name: dict.source.attribution.name,
                          publisher: dict.source.attribution.publisher,
                          licence: dict.source.attribution.licence,
                        }
                }}
              </a>
            </p>
          }
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .word-lookup {
      margin: 8px 0;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .hint {
      margin: 0 0 4px;
    }
    /* Words sit flush, as in the post: their text is bound, so no template
       whitespace can come between them. */
    .words {
      margin: 0 0 8px;
      line-height: 1.9;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .word {
      font: inherit;
      color: inherit;
      background: none;
      border: none;
      border-bottom: 1px dotted var(--muted);
      padding: 0;
      margin: 0;
      cursor: pointer;
    }
    .word:hover,
    .word:focus-visible,
    .word.selected {
      background: var(--accent-soft, rgba(127, 127, 255, 0.15));
      border-bottom-color: currentColor;
    }
    .entry {
      margin: 6px 0;
    }
    .headword {
      margin: 0;
      font-size: 18px;
      display: flex;
      gap: 8px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .reading {
      font-size: 14px;
      font-weight: normal;
    }
    .inflected {
      margin: 2px 0;
    }
    .senses {
      margin: 4px 0;
      padding-left: 20px;
    }
    .pos {
      margin-right: 4px;
    }
    .actions {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin: 6px 0;
    }
    .explanation p {
      margin: 4px 0;
      white-space: pre-line;
    }
    .credit {
      margin: 6px 0 0;
    }
  `,
})
export class WordLookupPanel implements OnInit {
  private chat = inject(OpenRouterChat);
  private openrouter = inject(OpenRouterSession);
  private transloco = inject(TranslocoService);

  readonly status = input.required<Status>();
  /** The post's language, one with a dictionary (see `dictionary-registry.ts`). */
  readonly language = input.required<string>();

  protected readonly maxSenses = MAX_SENSES;
  protected readonly text = computed(() => {
    const status = this.status();
    return plainText(status.reblog ?? status);
  });
  protected readonly tokens = computed(() => segmentWords(this.text(), this.language()));
  protected readonly dictionary = signal<LanguageDictionary | null>(null);
  private readonly manifest = signal<DictManifest | null>(null);
  protected readonly match = signal<LookupMatch | null>(null);
  protected readonly hits = computed(() => this.match()?.hits.slice(0, MAX_HITS) ?? []);
  protected readonly looking = signal(false);
  protected readonly notFound = signal<string | null>(null);
  protected readonly unavailable = signal(false);
  protected readonly explaining = signal(false);
  protected readonly explanation = signal<string | null>(null);
  protected readonly explainError = signal<string | null>(null);
  protected readonly aiConnected = this.openrouter.connected;
  private seq = 0;

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<LanguageDictionary | null> {
    const existing = this.dictionary();
    if (existing) return existing;
    const loading = dictionaryFor(this.language());
    if (!loading) {
      this.unavailable.set(true);
      return null;
    }
    try {
      const dictionary = await loading;
      this.manifest.set(await dictionary.source.manifest());
      this.dictionary.set(dictionary);
      this.unavailable.set(false);
      return dictionary;
    } catch {
      this.unavailable.set(true);
      return null;
    }
  }

  protected async tap(token: TextToken): Promise<void> {
    const seq = ++this.seq;
    this.looking.set(true);
    this.notFound.set(null);
    this.explanation.set(null);
    this.explainError.set(null);
    try {
      const dictionary = await this.load();
      if (!dictionary || seq !== this.seq) return;
      const found = await lookupAt(dictionary, this.text(), token.index);
      if (seq !== this.seq) return;
      this.match.set(found);
      if (!found) this.notFound.set(token.text);
    } catch {
      if (seq === this.seq) this.unavailable.set(true);
    } finally {
      if (seq === this.seq) this.looking.set(false);
    }
  }

  protected isSelected(token: TextToken): boolean {
    const found = this.match();
    if (!found) return false;
    return token.index >= found.index && token.index < found.index + found.surface.length;
  }

  /** Kana-usually words (`uk`) show their reading as the headword. */
  protected headword(entry: DictEntry): string {
    const usuallyKana =
      entry.senses.length > 0 && entry.senses.every((sense) => sense.misc.includes('uk'));
    return (usuallyKana ? entry.readings[0] : entry.forms[0]) ?? entry.readings[0] ?? '';
  }

  /** The reading, when the headword is not already it. */
  protected reading(entry: DictEntry): string | null {
    const shown = this.headword(entry);
    const reading = entry.readings.find((r) => r !== shown);
    return entry.forms.length ? (reading ?? null) : null;
  }

  protected reasons(hit: LookupHit): string {
    // Undone outermost-last, so the word reads base → inflections in reverse.
    return [...hit.deinflection.reasons]
      .reverse()
      .map((reason) => this.transloco.translate<string>(`learn.lookup.reason.${reason}`))
      .join(', ');
  }

  protected describe(tags: string[]): string {
    const known = this.manifest()?.tags ?? {};
    return tags.map((tag) => known[tag] ?? tag).join('; ');
  }

  protected moreUrl(found: LookupMatch): string | null {
    const word = found.hits[0]?.deinflection.word ?? found.surface;
    return this.dictionary()?.moreUrl(word) ?? null;
  }

  protected moreSite(url: string): string {
    try {
      return new URL(url).host.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /** "Explain in this sentence": the reader's own OpenRouter key, on request only. */
  protected async explain(found: LookupMatch): Promise<void> {
    if (this.explaining()) return;
    this.explaining.set(true);
    this.explainError.set(null);
    const base = found.hits[0]?.deinflection.word ?? found.surface;
    const learning = LANGUAGE_NAMES[this.language()] ?? this.language();
    const reply = this.transloco.getActiveLang();
    const prompt =
      `A reader is learning ${learning}. In the post below, explain the word ` +
      `"${found.surface}" (dictionary form: ${base}) as it is used here: what it means ` +
      `in this sentence, how it is read, and any grammar, nuance or slang worth knowing. ` +
      `Answer in the language with code "${reply}", in at most four short sentences of ` +
      `plain text.\n\nPost:\n${this.text()}`;
    try {
      const text = await this.chat.complete({ prompt, maxTokens: 400, raw: true });
      this.explanation.set(text.trim());
    } catch (err) {
      this.explainError.set(err instanceof Error ? err.message : '');
    } finally {
      this.explaining.set(false);
    }
  }
}
