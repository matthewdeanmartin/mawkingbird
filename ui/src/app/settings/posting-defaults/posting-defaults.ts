import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Api } from '../../platform/api/api';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { MbButton } from '../../design-system/button/button';
import { MbSaveFeedback } from '../../design-system/save-feedback/save-feedback';
import { describeHttpError } from '../../platform/diagnostics/page-diagnostics';
import {
  PostPermissions,
  PostPermissionsValue,
} from '../../publishing/post-permissions/post-permissions';

// i18n settings.postingDefaults.summary: New posts: {{audience}}, {{discovery}}, {{quotes}}.
// i18n settings.postingDefaults.audience.public: everyone can read them
// i18n settings.postingDefaults.audience.private: only followers can read them
// i18n settings.postingDefaults.discovery.listed: shown in public timelines
// i18n settings.postingDefaults.discovery.unlisted: kept out of public timelines
// i18n settings.postingDefaults.discovery.followers: never public
// i18n settings.postingDefaults.quotes.public: anyone can quote them
// i18n settings.postingDefaults.quotes.followers: followers can quote them
// i18n settings.postingDefaults.quotes.nobody: nobody else can quote them
// i18n settings.postingDefaults.change: Change…
// i18n settings.postingDefaults.failed: Your defaults were not saved. {{detail}}

/** The account's defaults for new posts, as Mastodon stores them. */
export interface PostingDefaultsValue {
  /** public | unlisted | private */
  privacy: string;
  /** public | followers | nobody; absent on servers older than 4.5. */
  quotePolicy?: string;
}

/**
 * Default visibility and quote policy as one plain sentence and a "Change…"
 * button, opening the same questions the post permissions dialog asks.
 *
 * Replaces a single "public / unlisted / private" dropdown: three words that
 * meant nothing to people until they had posted the wrong way once.
 */
@Component({
  selector: 'app-posting-defaults',
  imports: [MbButton, MbSaveFeedback, PostPermissions, TranslocoPipe],
  template: `
    <p class="posting-defaults">
      <span>{{ summary() }}</span>
      <button mbButton variant="link" type="button" [disabled]="saving()" (click)="open.set(true)">
        {{ 'settings.postingDefaults.change' | transloco }}
      </button>
      <mb-save-feedback
        [state]="saving() ? 'saving' : justSaved() ? 'saved' : 'idle'"
        [message]="(saving() ? 'common.saving' : 'common.saved') | transloco"
      />
    </p>
    @if (open()) {
      <app-post-permissions
        [defaults]="true"
        [initial]="{
          visibility: value().privacy,
          quoteApprovalPolicy: value().quotePolicy,
        }"
        [busy]="saving()"
        [error]="error()"
        (saved)="save($event)"
        (closed)="open.set(false)"
      />
    }
  `,
  styles: `
    .posting-defaults {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 10px;
      margin: 0;
    }
  `,
})
export class PostingDefaults {
  private readonly api = inject(Api);
  private readonly prefs = inject(ClientPrefs);
  private readonly transloco = inject(TranslocoService);

  readonly value = input.required<PostingDefaultsValue>();
  /** The saved value, so the page showing it stays in step. */
  readonly changed = output<PostingDefaultsValue>();

  protected readonly open = signal(false);
  protected readonly saving = signal(false);
  protected readonly justSaved = signal(false);
  protected readonly error = signal('');

  protected readonly summary = computed(() => {
    const { privacy, quotePolicy } = this.value();
    const t = (key: string) => this.transloco.translate(`settings.postingDefaults.${key}`);
    const followersOnly = privacy === 'private';
    return this.transloco.translate('settings.postingDefaults.summary', {
      audience: t(followersOnly ? 'audience.private' : 'audience.public'),
      discovery: t(
        followersOnly
          ? 'discovery.followers'
          : privacy === 'unlisted'
            ? 'discovery.unlisted'
            : 'discovery.listed',
      ),
      quotes: t(`quotes.${followersOnly ? 'nobody' : (quotePolicy ?? 'public')}`),
    });
  });

  /** Only the fields this row owns: a credentials update writes what it names. */
  protected save(next: PostPermissionsValue): void {
    const value: PostingDefaultsValue = {
      privacy: next.visibility === 'direct' ? 'private' : next.visibility,
      quotePolicy: next.quoteApprovalPolicy ?? this.value().quotePolicy,
    };
    const form = new FormData();
    form.append('source[privacy]', value.privacy);
    if (value.quotePolicy) form.append('source[quote_policy]', value.quotePolicy);
    this.saving.set(true);
    this.error.set('');
    this.api.updateCredentials(form).subscribe({
      next: () => {
        this.saving.set(false);
        this.open.set(false);
        this.prefs.setDefaultVisibility(value.privacy);
        this.changed.emit(value);
        this.justSaved.set(true);
        setTimeout(() => this.justSaved.set(false), 2000);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(
          this.transloco.translate('settings.postingDefaults.failed', {
            detail: describeHttpError(error),
          }),
        );
      },
    });
  }
}
