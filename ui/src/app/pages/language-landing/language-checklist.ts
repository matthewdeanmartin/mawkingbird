import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api';
import { ClientPrefs } from '../../client-prefs';
import { SupportedLocale, UiLocale } from '../../i18n/locale';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbNotice } from '../../design-system/notice/notice';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { LanguageLandingCopy, LanguageSetting } from './language-landing.copy';
import { AppOnlyLinkRel } from '../../public-page-urls';

/**
 * The signed-in half of a language landing page: the reader's language
 * settings as one checklist, applied together.
 *
 * Nothing changes on arrival; every write waits for Apply. The settings are
 * the ones Settings → Internationalization edits, through the same services,
 * so the two pages never disagree. Only the posting language leaves the
 * browser: it is the Mastodon account's own default.
 */
@Component({
  selector: 'app-language-checklist',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbCheckbox, MbNotice, FocusedNextSteps],
  template: `
    <section class="panel" aria-labelledby="checklist-title">
      <h2 id="checklist-title">{{ copy().checklist.title }}</h2>
      <p class="muted">{{ copy().checklist.intro }}</p>
      @for (item of copy().checklist.items; track item.setting) {
        <mb-checkbox
          [label]="item.label"
          [hint]="hint(item.setting, item.hint)"
          [checked]="ticked().has(item.setting)"
          [disabled]="phase() !== 'choose'"
          (checkedChange)="tick(item.setting, $event)"
        />
      }
      @if (phase() === 'choose') {
        <div class="actions">
          <button mbButton type="button" (click)="apply()">{{ copy().checklist.apply }}</button>
        </div>
      } @else if (phase() === 'applying') {
        <p class="muted" role="status">{{ copy().checklist.applying }}</p>
      }
    </section>

    @if (phase() === 'done') {
      <section class="panel" aria-labelledby="done-title">
        <h2 id="done-title">{{ copy().checklist.doneTitle }}</h2>
        @if (failed()) {
          <mb-notice tone="error" announcement="alert">{{ copy().checklist.failed }}</mb-notice>
        }
        @if (applied().length) {
          <ul class="applied">
            @for (label of applied(); track label) {
              <li>{{ label }}</li>
            }
          </ul>
        } @else {
          <p class="muted">{{ copy().checklist.doneNothing }}</p>
        }
        <div class="actions">
          <a mbButton routerLink="/home">{{ copy().checklist.home }}</a>
          <a mbButton variant="outline" routerLink="/bundled-starter-kits">{{
            copy().checklist.starterPacks
          }}</a>
          <a mbButton variant="outline" routerLink="/settings/i18n">{{
            copy().checklist.settingsLink
          }}</a>
        </div>
      </section>
      <app-focused-next-steps [inviteLink]="'/' + copy().path + '/invite'" />
    }
  `,
  styleUrl: '../focused-apps/focused-page.css',
  styles: `
    mb-checkbox {
      display: block;
      margin-block: 10px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    .applied {
      padding-left: 20px;
      line-height: 1.6;
    }
    mb-notice {
      display: block;
      margin-bottom: 12px;
    }
  `,
})
export class LanguageChecklist implements OnInit {
  readonly copy = input.required<LanguageLandingCopy>();

  private api = inject(Api);
  private prefs = inject(ClientPrefs);
  private locale = inject(UiLocale);

  protected phase = signal<'choose' | 'applying' | 'done'>('choose');
  protected failed = signal(false);
  protected applied = signal<string[]>([]);
  /** The account's posting language on its server, once read; '' when unset. */
  private serverPosting = signal<string | null>(null);
  private choices = signal<ReadonlySet<LanguageSetting> | null>(null);

  protected ticked = computed<ReadonlySet<LanguageSetting>>(
    () =>
      this.choices() ??
      new Set(
        this.copy()
          .checklist.items.filter((item) => item.checked)
          .map((item) => item.setting),
      ),
  );

  ngOnInit(): void {
    this.api.verifyCredentials().subscribe({
      next: (account) =>
        this.serverPosting.set(account.source?.language?.toLowerCase().split(/[-_]/)[0] ?? ''),
      error: () => this.serverPosting.set(null),
    });
  }

  /** The item's hint, plus where it is stored and, for the server, what it is now. */
  protected hint(setting: LanguageSetting, hint: string): string {
    const where = this.copy().checklist.where;
    if (setting !== 'posting') return `${hint} (${where.browser})`;
    const now = this.serverPosting();
    const change =
      now === null ? '' : ` ${now || '—'} → ${this.copy().content ?? this.copy().target}`;
    return `${hint} (${where.server}${change})`;
  }

  protected tick(setting: LanguageSetting, on: boolean): void {
    const next = new Set(this.ticked());
    if (on) next.add(setting);
    else next.delete(setting);
    this.choices.set(next);
  }

  async apply(): Promise<void> {
    if (this.phase() !== 'choose') return;
    this.phase.set('applying');
    const copy = this.copy();
    const ticked = this.ticked();
    const done: string[] = [];
    for (const item of copy.checklist.items) {
      if (!ticked.has(item.setting)) continue;
      if (await this.write(item.setting, copy)) done.push(item.label);
      else this.failed.set(true);
    }
    this.applied.set(done);
    this.phase.set('done');
  }

  /** Apply one setting; false when it could not be saved. */
  private async write(setting: LanguageSetting, copy: LanguageLandingCopy): Promise<boolean> {
    switch (setting) {
      case 'interface':
        this.locale.choose(copy.target as SupportedLocale);
        return true;
      case 'known':
        this.prefs.addKnownLanguage(copy.content ?? copy.target);
        return true;
      case 'alsoEnglish':
        this.prefs.addKnownLanguage('en');
        return true;
      case 'hideForeign':
        this.prefs.setHideForeignLangPosts(true);
        return true;
      case 'trends':
        this.prefs.setExcludeUnknownLangTrends(true);
        return true;
      case 'learning': {
        const code = copy.learning;
        if (!code) return false;
        this.prefs.addLearningLanguage(code);
        this.prefs.setAppendTranslation(code, true);
        return true;
      }
      case 'posting': {
        const form = new FormData();
        const code = copy.content ?? copy.target;
        form.append('source[language]', code);
        try {
          await firstValueFrom(this.api.updateCredentials(form));
          this.prefs.setPostingLanguage(code);
          this.prefs.addKnownLanguage(code);
          this.serverPosting.set(code);
          return true;
        } catch {
          return false;
        }
      }
    }
  }
}
