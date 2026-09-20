import { TagState } from './tag-state';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api';
import { Auth } from '../auth';
import { Tag } from '../models';
import { TagBundles } from '../lists/tag-bundles';
import { AnonymousTags } from '../providers/anonymous/anonymous-tags';

// i18n tagActions.failed: Couldn't update this tag. Please try again.
@Component({
  selector: 'app-tag-actions',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './tag-actions.html',
  styleUrl: './tag-actions.css',
})
export class TagActions {
  readonly name = input.required<string>();
  readonly info = input<Partial<Tag> | null>(null);
  readonly changed = output<Tag>();
  protected auth = inject(Auth);
  protected bundles = inject(TagBundles);
  private api = inject(Api);
  private anonymousTags = inject(AnonymousTags);
  private state = inject(TagState);
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
          : await firstValueFrom(this.api.getTag(name));
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
