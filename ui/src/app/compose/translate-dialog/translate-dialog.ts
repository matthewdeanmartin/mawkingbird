import { TranslocoPipe } from '@jsverse/transloco';
import { Component, computed, HostListener, inject, input, output, signal } from '@angular/core';
import { AiTranslate } from '../../ai-translate';
import { POSTING_LANGUAGE_OPTIONS } from '../../language-detect';
import { ClientPrefs } from '../../client-prefs';
import { PageDiagnostics } from '../../page-diagnostics';

/** What to do with the translation once it comes back. */
export type TranslateApply = 'replace' | 'append';

/** The finished translation, and how the composer should apply it. */
export interface TranslateResult {
  text: string;
  mode: TranslateApply;
  /** ISO code translated into, so the composer can set the post language too. */
  code: string;
}

/**
 * 🤖🌐 — translate what you are writing into another language.
 *
 * The reading-side translator answers "what does this say?"; this answers the
 * opposite question, "how do I say this to them?", which is why it takes an
 * explicit target instead of the user's own language.
 *
 * Nothing is applied until the user has read the result. A model that quietly
 * overwrote a half-written post would be unusable, so the translation lands in
 * an editable box first and the user chooses **Replace** or **Append** —
 * append being the bilingual-post case, where both versions ship together.
 */
// i18n compose.translateDialog.append: Append
// i18n compose.translateDialog.cancel: Cancel
// i18n compose.translateDialog.close: Close
// i18n compose.translateDialog.into: Translate into
// i18n compose.translateDialog.intro: Writes your post in another language. The result is editable — check it before you post, especially anything the model could take literally.
// i18n compose.translateDialog.replace: Replace
// i18n compose.translateDialog.retry: Try again
// i18n compose.translateDialog.title: 🤖🌐 Translate this post
// i18n compose.translateDialog.toButton: Translate to
// i18n compose.translateDialog.translatedBy: Translated by
// i18n compose.translateDialog.translatingInto: Translating into
// i18n compose.translateDialog.writeFirst: Write something first.

@Component({
  selector: 'app-translate-dialog',
  imports: [TranslocoPipe],
  templateUrl: './translate-dialog.html',
  styleUrl: './translate-dialog.css',
})
export class TranslateDialog {
  private translator = inject(AiTranslate);
  private prefs = inject(ClientPrefs);
  private diagnostics = inject(PageDiagnostics);

  /** The text currently in the composer. */
  readonly post = input.required<string>();

  readonly applied = output<TranslateResult>();
  readonly closed = output<void>();

  protected busy = signal(false);
  protected error = signal<string | null>(null);
  /** The translation, editable — model output is a draft, not a verdict. */
  protected draft = signal('');
  protected model = signal('');

  /**
   * Target languages, the user's own first.
   *
   * The full list is offered rather than only the languages they know: you
   * translate *out* of your languages into someone else's, so restricting this
   * to the known set would rule out the only case that matters. Known languages
   * still float to the top, because writing in a second language you speak is
   * the commonest use.
   */
  protected readonly options = computed(() => {
    const known = new Set(this.prefs.knownLanguages());
    const all = POSTING_LANGUAGE_OPTIONS;
    return [...all.filter((o) => known.has(o.code)), ...all.filter((o) => !known.has(o.code))];
  });

  protected target = signal(this.options()[0]?.code ?? 'en');

  protected targetName(): string {
    return this.options().find((o) => o.code === this.target())?.name ?? this.target();
  }

  async run(): Promise<void> {
    const source = this.post().trim();
    if (!source || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.draft.set('');
    try {
      const result = await this.translator.translateText(source, this.target());
      this.draft.set(result.text);
      this.model.set(result.model);
    } catch (error: unknown) {
      this.diagnostics.error('Translate', 'translate:error', error, {
        sourceLength: source.length,
        target: this.target(),
      });
      this.error.set(error instanceof Error ? error.message : "Couldn't reach the model.");
    } finally {
      this.busy.set(false);
    }
  }

  protected apply(mode: TranslateApply): void {
    const text = this.draft().trim();
    if (!text) {
      return;
    }
    this.applied.emit({ text, mode, code: this.target() });
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
