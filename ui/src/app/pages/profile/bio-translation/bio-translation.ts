import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AiAvailability } from '../../../ai-availability';
import { MbButton } from '../../../design-system/button/button';
import { Account, Status } from '../../../models';
import { OpenRouterSession } from '../../../providers/openrouter/openrouter-session';
import { languageDisplayName } from '../../../translation/language-codes';
import {
  CHAIN_ENGINE_NAMES,
  hasTranslatableText,
  TranslationRouter,
} from '../../../translation/translation-router';

// i18n pages.profile.bio.translate: Translate bio
// i18n pages.profile.bio.translating: Translating…
// i18n pages.profile.bio.hide: Hide translation
// i18n pages.profile.bio.translatedBy: Translated from {{from}} by {{engine}}
// i18n pages.profile.bio.same: This bio already looks like it's in your language.
// i18n pages.profile.bio.failed: Couldn't translate this bio with the translators you have turned on.
// i18n pages.profile.bio.pickSource: Which language is it in?
// i18n pages.profile.bio.translateFrom: Translate from {{language}}

/**
 * The bio and its profile fields as a post-shaped object, so the same
 * translation chain (browser → MyMemory → Apertium → AI) handles them. Each
 * field becomes its own "Label: value" line. Server translation is not used:
 * Mastodon only translates statuses.
 */
export function bioAsStatus(account: Account): Status {
  const fields = (account.fields ?? [])
    .filter((f) => f.name.trim() || f.value.trim())
    .map((f) => `<p>${f.name}: ${f.value}</p>`)
    .join('');
  return {
    id: `profile-bio:${account.id}`,
    uri: account.url ? `${account.url}#bio` : undefined,
    created_at: '',
    edited_at: null,
    content: `${account.note ?? ''}${fields}`,
    emojis: account.emojis,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    language: null,
  } as Status;
}

/** "Translate bio" under a profile: translates the bio and fields; the original stays. */
@Component({
  selector: 'app-bio-translation',
  imports: [MbButton, TranslocoPipe],
  template: `
    @if (translatable()) {
      <div class="bio-translation">
        @if (result(); as r) {
          <div class="translated" [attr.lang]="r.target">
            <p class="text">{{ r.text }}</p>
            <p class="credit muted small">
              {{ 'pages.profile.bio.translatedBy' | transloco: { from: r.from, engine: r.engine } }}
            </p>
          </div>
          <button mbButton type="button" variant="outline" size="small" (click)="hide()">
            {{ 'pages.profile.bio.hide' | transloco }}
          </button>
        } @else {
          @if (candidates(); as langs) {
            <p class="muted small">{{ 'pages.profile.bio.pickSource' | transloco }}</p>
            <div class="choices">
              @for (code of langs; track code) {
                <button
                  mbButton
                  type="button"
                  variant="outline"
                  size="small"
                  [disabled]="busy()"
                  (click)="run(code)"
                >
                  {{ 'pages.profile.bio.translateFrom' | transloco: { language: name(code) } }}
                </button>
              }
            </div>
          } @else {
            <button
              mbButton
              type="button"
              variant="outline"
              size="small"
              [disabled]="busy()"
              (click)="run()"
            >
              {{
                (busy() ? 'pages.profile.bio.translating' : 'pages.profile.bio.translate')
                  | transloco
              }}
            </button>
          }
          @if (message()) {
            <p class="muted small" role="status">{{ message() }}</p>
          }
        }
      </div>
    }
  `,
  styles: `
    .bio-translation {
      display: grid;
      gap: 6px;
      justify-items: start;
      margin-top: 8px;
    }
    .translated {
      border-inline-start: 3px solid var(--border);
      padding-inline-start: 10px;
    }
    .text {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .credit {
      margin: 4px 0 0;
      font-size: 12px;
    }
    .small {
      font-size: 13px;
      margin: 0;
    }
    .choices {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
  `,
})
export class BioTranslation {
  private readonly router = inject(TranslationRouter);
  private readonly transloco = inject(TranslocoService);
  private readonly ai = inject(AiAvailability);
  private readonly openrouter = inject(OpenRouterSession);

  readonly account = input.required<Account>();

  private readonly status = computed(() => bioAsStatus(this.account()));
  protected readonly translatable = computed(() => hasTranslatableText(this.status()));
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly candidates = signal<string[] | null>(null);
  protected readonly result = signal<{
    text: string;
    from: string;
    engine: string;
    target: string;
  } | null>(null);

  protected name(code: string): string {
    return languageDisplayName(code);
  }

  protected hide(): void {
    this.result.set(null);
  }

  protected async run(source?: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      const outcome = await this.router.translate({
        status: this.status(),
        mode: 'manual',
        source,
        force: !!source,
        serverCanTranslate: false,
        aiAvailable: this.ai.enabled() && this.openrouter.connected(),
      });
      switch (outcome.kind) {
        case 'text':
          this.candidates.set(null);
          this.result.set({
            text: outcome.text,
            from: languageDisplayName(outcome.source),
            engine: CHAIN_ENGINE_NAMES[outcome.engine],
            target: outcome.target,
          });
          break;
        case 'ask':
          this.candidates.set(outcome.candidates.slice(0, 4));
          break;
        case 'same':
          this.message.set(this.transloco.translate('pages.profile.bio.same'));
          break;
        default:
          this.message.set(this.transloco.translate('pages.profile.bio.failed'));
      }
    } catch {
      this.message.set(this.transloco.translate('pages.profile.bio.failed'));
    } finally {
      this.busy.set(false);
    }
  }
}
