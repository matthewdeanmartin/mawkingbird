import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../platform/api/api';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbNotice } from '../../design-system/notice/notice';
import { ContentFilter, FilterContext, FilterResult, Status } from '../../platform/api/models';
import { describeHttpError } from '../../platform/diagnostics/page-diagnostics';

// i18n filterPost.title: Filter this post
// i18n filterPost.intro: Add this post to one of your server filters. It is hidden or put behind a warning wherever that filter applies, on every app you use. Remove it later from the filter in Settings → Filters.
// i18n filterPost.loading: Loading your filters…
// i18n filterPost.choose: Filter
// i18n filterPost.newFilter: A new filter…
// i18n filterPost.newTitle: New filter's name
// i18n filterPost.newTitleDefault: Filtered posts
// i18n filterPost.newHint: Hides the post on Home, public timelines, threads and profiles.
// i18n filterPost.add: Filter post
// i18n filterPost.adding: Filtering…
// i18n filterPost.cancel: Cancel
// i18n filterPost.failed: The post was not filtered. {{detail}}

const NEW = '__new__';
/** Where a filter made from here applies: everywhere a post can appear but notifications. */
const NEW_CONTEXTS: FilterContext[] = ['home', 'public', 'thread', 'account'];

/**
 * Mastodon's "Filter this post": attach one specific status to a v2 filter,
 * new or existing. The card is told the result so the filter applies at once.
 */
@Component({
  selector: 'app-filter-post-dialog',
  imports: [FormsModule, TranslocoPipe, MbButton, MbControl, MbDialog, MbField, MbNotice],
  templateUrl: './filter-post-dialog.html',
})
export class FilterPostDialog implements OnInit {
  private readonly api = inject(Api);
  private readonly transloco = inject(TranslocoService);

  readonly status = input.required<Status>();
  /** The filter the post now belongs to, shaped like a server `filtered` entry. */
  readonly filtered = output<FilterResult>();
  readonly closed = output<void>();

  protected readonly newValue = NEW;
  protected readonly filters = signal<ContentFilter[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly choice = signal(NEW);
  protected readonly newTitle = signal('');
  protected readonly creating = computed(() => this.choice() === NEW);
  protected readonly canSave = computed(
    () => !this.loading() && !this.saving() && (!this.creating() || !!this.newTitle().trim()),
  );

  ngOnInit(): void {
    this.newTitle.set(this.transloco.translate('filterPost.newTitleDefault'));
    this.api.filters().subscribe({
      next: (filters) => {
        this.filters.set(filters);
        if (filters.length) this.choice.set(filters[0].id);
        this.loading.set(false);
      },
      // No list is no reason to stop: a new filter still works.
      error: () => this.loading.set(false),
    });
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const filter = this.creating()
        ? await firstValueFrom(
            this.api.createFilter({
              title: this.newTitle().trim(),
              context: NEW_CONTEXTS,
              filter_action: 'hide',
            }),
          )
        : this.filters().find((f) => f.id === this.choice())!;
      const statusId = this.status().id;
      await firstValueFrom(this.api.addFilterStatus(filter.id, statusId));
      this.filtered.emit({
        filter: {
          id: filter.id,
          title: filter.title,
          context: filter.context,
          expires_at: filter.expires_at,
          filter_action: filter.filter_action,
        },
        keyword_matches: null,
        status_matches: [statusId],
      });
    } catch (error: unknown) {
      this.error.set(
        this.transloco.translate('filterPost.failed', { detail: describeHttpError(error) }),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
