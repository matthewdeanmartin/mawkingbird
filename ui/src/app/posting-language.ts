import { computed, inject, Injectable } from '@angular/core';
import { Auth } from './auth';
import { ClientPrefs } from './client-prefs';
import { UiLocale } from './i18n/locale';

@Injectable({ providedIn: 'root' })
export class PostingLanguage {
  private readonly auth = inject(Auth);
  private readonly prefs = inject(ClientPrefs);
  private readonly locale = inject(UiLocale);
  readonly default = computed(
    () =>
      this.prefs.postingLanguage() ||
      this.auth.account()?.source?.language ||
      (this.prefs.knownLanguages().length === 1
        ? this.prefs.knownLanguages()[0]
        : this.locale.active()),
  );
  readonly needsPrompt = computed(
    () =>
      !this.auth.account()?.source?.language &&
      !this.prefs.postingLanguage() &&
      !this.prefs.postingLanguageAsked(),
  );
  choose(code: string): void {
    this.prefs.setPostingLanguage(code);
  }
  dismiss(): void {
    this.prefs.postingLanguageAsked.set(true);
  }
}
