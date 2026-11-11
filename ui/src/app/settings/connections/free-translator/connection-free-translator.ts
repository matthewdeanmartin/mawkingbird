import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../../design-system/button/button';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbContentLink } from '../../../design-system/metadata/metadata';
import { MbNotice } from '../../../design-system/notice/notice';
import { MbPageHeader } from '../../../design-system/page-header/page-header';
import { FreeTranslators } from '../../../translation/free-translators';
import { TranslationConnectors } from '../../../translation/translation-connectors';
import { TranslationUsage } from '../../../translation/translation-usage';

/** Which free translation service this page sets up (from the route's `data`). */
export type FreeTranslatorId = 'mymemory' | 'apertium';

// i18n settings.connections.freeTranslator.mymemory.title: 🌍 MyMemory translation
// i18n settings.connections.freeTranslator.mymemory.intro: A free translation service from Translated. When your server can't translate a post, and this browser has no translator for the language, Mawkingbird can ask MyMemory instead.
// i18n settings.connections.freeTranslator.mymemory.privacy: The text of each post you translate is sent to MyMemory (api.mymemory.translated.net), straight from this browser. Nothing else is sent.
// i18n settings.connections.freeTranslator.mymemory.quota: Free for 5,000 characters a day. Add an email and MyMemory allows 50,000.
// i18n settings.connections.freeTranslator.apertium.title: 🔤 Apertium translation
// i18n settings.connections.freeTranslator.apertium.intro: An open-source translator run by the Apertium project, strongest for closely related and minority languages (Spanish, Catalan, Galician, Occitan, Basque and more). It is used when the engines before it can't translate a post.
// i18n settings.connections.freeTranslator.apertium.privacy: The text of each post you translate is sent to apertium.org, straight from this browser. Nothing else is sent.
// i18n settings.connections.freeTranslator.apertium.quota: Free, with no published limit. Mawkingbird stops at 500 translations a day to be a good guest; change it in Settings → Internationalization.
// i18n settings.connections.freeTranslator.apertium.pairs: Language pairs Apertium supports
// i18n settings.connections.freeTranslator.enable: Use it when other translators can't
// i18n settings.connections.freeTranslator.enableHint: Off until you turn it on. Your server and this browser's own translator are always tried first.
// i18n settings.connections.freeTranslator.email: Email for the 50,000-character tier (optional)
// i18n settings.connections.freeTranslator.emailHint: Sent to MyMemory with each request, as they ask. Never filled in from your account.
// i18n settings.connections.freeTranslator.saveEmail: Save email
// i18n settings.connections.freeTranslator.emailSaved: Saved.
// i18n settings.connections.freeTranslator.usage: Used today: {{today}} of {{limit}}
// i18n settings.connections.freeTranslator.test: Test it
// i18n settings.connections.freeTranslator.testing: Testing…
// i18n settings.connections.freeTranslator.testOk: It works: “{{input}}” → “{{output}}”
// i18n settings.connections.freeTranslator.testFailed: The test failed: {{message}}

const COPY: Record<
  FreeTranslatorId,
  { title: string; intro: string; privacy: string; quota: string }
> = {
  mymemory: {
    title: 'settings.connections.freeTranslator.mymemory.title',
    intro: 'settings.connections.freeTranslator.mymemory.intro',
    privacy: 'settings.connections.freeTranslator.mymemory.privacy',
    quota: 'settings.connections.freeTranslator.mymemory.quota',
  },
  apertium: {
    title: 'settings.connections.freeTranslator.apertium.title',
    intro: 'settings.connections.freeTranslator.apertium.intro',
    privacy: 'settings.connections.freeTranslator.apertium.privacy',
    quota: 'settings.connections.freeTranslator.apertium.quota',
  },
};

const TESTS: Record<FreeTranslatorId, { input: string; source: string; target: string }> = {
  mymemory: { input: 'Hallo Welt', source: 'de', target: 'en' },
  apertium: { input: 'Hola mundo', source: 'spa', target: 'eng' },
};

/**
 * Settings → Connections → MyMemory / Apertium. Both are opt-in: each sends the
 * text of a post to a third party, so neither runs until switched on here.
 */
@Component({
  selector: 'app-connection-free-translator',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbCheckbox,
    MbControl,
    MbField,
    MbContentLink,
    MbNotice,
    MbPageHeader,
  ],
  templateUrl: './connection-free-translator.html',
  styleUrls: ['../connection-page.css', './connection-free-translator.css'],
})
export class ConnectionFreeTranslator {
  protected readonly which: FreeTranslatorId =
    inject(ActivatedRoute).snapshot.data['translator'] === 'apertium' ? 'apertium' : 'mymemory';
  protected connectors = inject(TranslationConnectors);
  protected usage = inject(TranslationUsage);
  private free = inject(FreeTranslators);
  private transloco = inject(TranslocoService);

  /** Literal keys, so the i18n checker can see every one of them in use. */
  protected readonly copy = COPY[this.which];
  protected enabled = computed(() =>
    this.which === 'mymemory'
      ? this.connectors.myMemoryEnabled()
      : this.connectors.apertiumEnabled(),
  );
  protected email = signal(this.connectors.myMemoryEmail());
  protected emailNotice = signal<string | null>(null);
  protected emailError = signal<string | null>(null);
  protected testing = signal(false);
  protected testResult = signal<{ ok: boolean; text: string } | null>(null);

  protected setEnabled(on: boolean): void {
    if (this.which === 'mymemory') this.connectors.setMyMemoryEnabled(on);
    else this.connectors.setApertiumEnabled(on);
  }

  protected saveEmail(): void {
    this.emailNotice.set(null);
    this.emailError.set(null);
    try {
      this.connectors.setMyMemoryEmail(this.email());
      this.emailNotice.set(
        this.transloco.translate('settings.connections.freeTranslator.emailSaved'),
      );
    } catch (error) {
      this.emailError.set((error as Error).message);
    }
  }

  protected async test(): Promise<void> {
    const sample = TESTS[this.which];
    this.testing.set(true);
    this.testResult.set(null);
    try {
      const output =
        this.which === 'mymemory'
          ? await this.free.myMemory(
              sample.input,
              sample.source,
              sample.target,
              this.connectors.myMemoryEmail(),
            )
          : await this.free.apertium(sample.input, `${sample.source}|${sample.target}`);
      this.testResult.set({
        ok: true,
        text: this.transloco.translate('settings.connections.freeTranslator.testOk', {
          input: sample.input,
          output,
        }),
      });
    } catch (error) {
      this.testResult.set({
        ok: false,
        text: this.transloco.translate('settings.connections.freeTranslator.testFailed', {
          message: (error as Error)?.message || String(error),
        }),
      });
    } finally {
      this.testing.set(false);
    }
  }
}
