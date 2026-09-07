import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MockApi } from '../../../mock-api';
import { PostDeletionSettings } from '../../../models';
import { TranslocoPipe } from '@jsverse/transloco';

/** Automatic post deletion policy (mock-only settings section). */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.deletion.title: Automatic post deletion
// i18n settings.deletion.intro: Automatically delete your posts once they reach a specified age, with exceptions.
// i18n settings.deletion.section: Deletion
// i18n settings.deletion.enabled: Automatically delete old posts
// i18n settings.deletion.age: Age threshold (days)
// i18n settings.deletion.age.hint: Posts older than this many days become eligible for deletion.
// i18n settings.deletion.exceptions: Exceptions
// i18n settings.deletion.keepPinned: Keep pinned posts
// i18n settings.deletion.keepFavourited: Keep posts you favourited
// i18n settings.deletion.keepMedia: Keep posts with media
// i18n settings.deletion.keepPolls: Keep posts with polls
// i18n settings.deletion.minFavourites: Keep posts with at least this many favourites
// i18n settings.deletion.minReblogs: Keep posts with at least this many boosts
// i18n settings.deletion.noThreshold: 0 = no threshold.
@Component({
  selector: 'app-settings-deletion',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './settings-deletion.html',
})
export class SettingsDeletion implements OnInit {
  private api = inject(MockApi);

  protected enabled = signal(false);
  protected minAgeDays = signal(30);
  protected keepPinned = signal(true);
  protected keepFavourited = signal(false);
  protected keepMedia = signal(false);
  protected keepPolls = signal(false);
  protected minFavourites = signal(0);
  protected minReblogs = signal(0);
  protected saving = signal(false);
  protected saved = signal(false);

  ngOnInit(): void {
    this.api.mockSettings().subscribe((settings) => {
      const d = settings.post_deletion;
      this.enabled.set(d.enabled);
      this.minAgeDays.set(d.min_age_days);
      this.keepPinned.set(d.keep_pinned);
      this.keepFavourited.set(d.keep_favourited);
      this.keepMedia.set(d.keep_media);
      this.keepPolls.set(d.keep_polls);
      this.minFavourites.set(d.min_favourites);
      this.minReblogs.set(d.min_reblogs);
    });
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saved.set(false);

    const postDeletion: PostDeletionSettings = {
      enabled: this.enabled(),
      min_age_days: Number(this.minAgeDays()),
      keep_pinned: this.keepPinned(),
      keep_favourited: this.keepFavourited(),
      keep_media: this.keepMedia(),
      keep_polls: this.keepPolls(),
      min_favourites: Number(this.minFavourites()),
      min_reblogs: Number(this.minReblogs()),
    };

    this.api.updateMockSettings({ post_deletion: postDeletion }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
      },
      error: () => this.saving.set(false),
    });
  }
}
