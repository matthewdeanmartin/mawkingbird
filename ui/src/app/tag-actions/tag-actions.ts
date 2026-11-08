import { TagState } from './tag-state';
import { Component, computed, effect, inject, input, output, signal, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, firstValueFrom, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../api';
import { Auth } from '../auth';
import { Tag } from '../models';
import { TagBundles } from '../lists/tag-bundles';
import { AnonymousTags } from '../providers/anonymous/anonymous-tags';
import { Server } from '../server';
import type { TagFilterDialog } from '../tag-filter-dialog/tag-filter-dialog';

// i18n tagActions.failed: Couldn't update this tag. Please try again.
// i18n tagActions.similar: Similar
// i18n tagActions.similarTitle: Hashtags that often appear with #{{tag}}
// i18n tagActions.add: + Add
// i18n tagActions.addTitle: Add #{{tag}} to the hashtags compared
// i18n tagActions.mute: Mute
// i18n tagActions.muteTitle: Hide posts tagged #{{tag}} with a filter on your Mastodon account
@Component({
  selector: 'app-tag-actions',
  imports: [FormsModule, NgComponentOutlet, TranslocoPipe],
  templateUrl: './tag-actions.html',
  styleUrl: './tag-actions.css',
})
export class TagActions {
  readonly name = input.required<string>();
  readonly info = input<Partial<Tag> | null>(null);
  readonly changed = output<Tag>();
  /** Offer "Similar": hashtags that turn up alongside this one. Off unless asked for. */
  readonly offerSimilar = input(false);
  readonly similar = output<string>();
  /** Offer "+ Add": add this hashtag to a similar-hashtags comparison. */
  readonly offerAdd = input(false);
  readonly add = output<string>();
  /**
   * Offer "Mute": a server-side keyword filter on the signed-in Mastodon
   * account. Never offered to Anonymous or Bluesky: browser-local mutes are
   * Anonymous's alone, and Anonymous has no tag filter.
   */
  readonly offerMute = input(false);
  protected auth = inject(Auth);
  protected bundles = inject(TagBundles);
  private api = inject(Api);
  private anonymousTags = inject(AnonymousTags);
  private state = inject(TagState);
  private server = inject(Server);
  protected canMute = computed(
    () => this.offerMute() && this.auth.kind() === 'mastodon' && !!this.auth.token(),
  );
  protected muting = signal<string[] | null>(null);
  protected muteDialog = signal<Type<TagFilterDialog> | null>(null);
  protected muteFailed = signal(false);
  protected finishMute = () => this.muting.set(null);

  constructor() {
    // A dialog opened for one account must not save onto the next.
    let identity: string | undefined;
    effect(() => {
      const next = `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
      if (identity !== undefined && identity !== next) this.muting.set(null);
      identity = next;
    });
  }

  protected openMute(): void {
    this.muteFailed.set(false);
    this.muting.set([this.name()]);
    void import('../tag-filter-dialog/tag-filter-dialog')
      .then((module) => this.muteDialog.set(module.TagFilterDialog))
      .catch(() => this.muteFailed.set(true));
  }
  protected current = computed(() => {
    const name = this.name().toLowerCase();
    const info = this.info();
    return this.state.get(name) ?? (info?.name?.toLowerCase() === name ? info : null);
  });
  protected following = computed(() =>
    this.auth.isAnonymous ? this.anonymousTags.has(this.name()) : !!this.current()?.following,
  );
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected picker = signal(false);
  protected title = signal('');
  protected memberships = computed(() => this.bundles.bundlesWith(this.name()).length);

  protected create(): void {
    if (!this.title().trim()) return;
    this.bundles.create(this.title().trim(), [this.name()]);
    this.title.set('');
  }

  protected async toggle(kind: 'follow' | 'feature'): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    if (this.auth.isAnonymous && kind === 'follow') {
      if (this.following()) this.anonymousTags.unfollow(this.name());
      else {
        const result = this.anonymousTags.follow(this.name());
        if (!result.ok) this.error.set(result.error);
      }
      return;
    }
    this.busy.set(true);
    const name = this.name();
    const token = this.auth.token();
    try {
      // Search results may omit relationship fields. Resolve only on intent,
      // rather than fetching once per result merely to render the list.
      const known = this.current();
      const desired = kind === 'follow' ? !this.following() : !known?.featuring;
      const info =
        known && (kind === 'follow' ? known.following : known.featuring) !== undefined
          ? known
          : await firstValueFrom(
              this.api
                .getTag(name)
                .pipe(
                  catchError((error: unknown) =>
                    kind === 'follow' && error instanceof HttpErrorResponse && error.status === 404
                      ? of({ name, following: false, featuring: false })
                      : throwError(() => error),
                  ),
                ),
            );
      if (token !== this.auth.token() || name !== this.name()) return;
      if ((kind === 'follow' ? info.following : info.featuring) === desired) {
        this.state.remember(info as Tag);
        this.changed.emit(info as Tag);
        return;
      }
      const request =
        kind === 'follow'
          ? desired
            ? this.api.followTag(name)
            : this.api.unfollowTag(name)
          : desired
            ? this.api.featureTag(name)
            : this.api.unfeatureTag(name);
      const updated = await firstValueFrom(request);
      if (this.name() === name && token === this.auth.token()) {
        this.changed.emit(updated);
      }
    } catch {
      this.error.set('tagActions.failed');
    } finally {
      this.busy.set(false);
    }
  }
}
