import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { Api, CollectionSettings } from '../api';
import { MbButton } from '../design-system/button/button';
import { MbCheckbox } from '../design-system/checkbox/checkbox';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbControl, MbField } from '../design-system/field/field';
import { MbNotice } from '../design-system/notice/notice';
import { LANG_NAMES, LangCode } from '../language-detect';
import { Collection } from '../models';
import { describeHttpError } from '../page-diagnostics';
import { KnownLanguages } from '../trend-language-filter';

// i18n collectionSettings.editTitle: Edit collection
// i18n collectionSettings.createTitle: New collection
// i18n collectionSettings.name: Name
// i18n collectionSettings.description: Description (optional)
// i18n collectionSettings.language: Language
// i18n collectionSettings.languageHint: The language of the name and description.
// i18n collectionSettings.languageUnset: Not specified
// i18n collectionSettings.sensitive: Mark as sensitive
// i18n collectionSettings.sensitiveHint: Its name and description are hidden behind a warning until someone chooses to see them.
// i18n collectionSettings.discoverable: Show in search and discovery
// i18n collectionSettings.discoverableHint: Lets people who don't follow you find this collection.
// i18n collectionSettings.cancel: Cancel
// i18n collectionSettings.save: Save
// i18n collectionSettings.create: Create
// i18n collectionSettings.saving: Saving…
// i18n collectionSettings.nameRequired: A collection needs a name.
// i18n collectionSettings.error: Could not save this collection. {{detail}}

/** Mastodon's limits on collection names and descriptions. */
const NAME_MAX = 40;
const DESCRIPTION_MAX = 100;

/**
 * Create a Mastodon collection (4.6+) or edit an existing one: name,
 * description, language, sensitivity and discoverability.
 */
@Component({
  selector: 'app-collection-settings-dialog',
  imports: [
    MbDialog,
    MbField,
    MbControl,
    MbCheckbox,
    MbButton,
    MbNotice,
    FormsModule,
    TranslocoPipe,
  ],
  templateUrl: './collection-settings-dialog.html',
  styles: `
    mb-checkbox {
      display: block;
      margin-top: 12px;
    }
  `,
})
export class CollectionSettingsDialog implements OnInit {
  private readonly api = inject(Api);
  private readonly transloco = inject(TranslocoService);
  private readonly knownLanguages = inject(KnownLanguages);

  /** The collection to edit; null creates a new one. */
  readonly collection = input<Collection | null>(null);
  /** Name to start a new collection with. */
  readonly initialName = input('');
  readonly closed = output<void>();
  readonly saved = output<Collection>();

  protected readonly nameMax = NAME_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly language = signal('');
  protected readonly sensitive = signal(false);
  protected readonly discoverable = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly creating = computed(() => !this.collection());
  protected readonly canSave = computed(() => !this.saving() && !!this.name().trim());
  /** Languages the reader knows, plus whatever the collection already uses. */
  protected readonly languageOptions = computed(() =>
    [...new Set([...this.knownLanguages.codes(), this.language()].filter(Boolean))]
      .map((code) => ({ code, name: LANG_NAMES[code as LangCode] ?? code.toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  ngOnInit(): void {
    const c = this.collection();
    this.name.set(c?.name ?? this.initialName());
    this.description.set(c?.description ?? '');
    this.language.set(c?.language ?? '');
    this.sensitive.set(c?.sensitive ?? false);
    this.discoverable.set(c?.discoverable ?? false);
  }

  save(): void {
    if (this.saving()) return;
    const name = this.name().trim();
    if (!name) {
      this.error.set(this.transloco.translate('collectionSettings.nameRequired'));
      return;
    }
    const settings: CollectionSettings = {
      name,
      description: this.description().trim(),
      sensitive: this.sensitive(),
      discoverable: this.discoverable(),
      ...(this.language() ? { language: this.language() } : {}),
    };
    const existing = this.collection();
    const call: Observable<{ collection: Collection }> = existing
      ? this.api.updateCollection(existing.id, settings)
      : this.api.createCollection(name, settings.description, settings);
    this.saving.set(true);
    this.error.set('');
    call.subscribe({
      next: (wrapped) => {
        this.saving.set(false);
        // Mock servers may answer with no payload; fall back to what was sent.
        this.saved.emit(
          wrapped?.collection ?? ({ ...(existing ?? {}), ...settings } as Collection),
        );
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(
          this.transloco.translate('collectionSettings.error', {
            detail: describeHttpError(error),
          }),
        );
      },
    });
  }
}
