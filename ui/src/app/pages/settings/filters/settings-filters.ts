import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api';
import { ContentFilter } from '../../../models';
import { TranslocoPipe } from '@jsverse/transloco';

/** Filters: list of the user's v2 filters (muted words/phrases live here). */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.filters.title: Filters
// i18n settings.filters.intro: Hide posts containing muted words or phrases, per context. Filters apply to all sessions.
// i18n settings.filters.addNew: + Add new filter
// i18n settings.filters.empty: You have no filters. Add one to hide posts containing certain words or phrases.
// i18n settings.filters.untitled: (untitled filter)
// i18n settings.filters.hideCompletely: Hide completely
// i18n settings.filters.hideWarning: Hide with a warning
// i18n settings.filters.noContexts: no contexts
// i18n common.edit: Edit
@Component({
  selector: 'app-settings-filters',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './settings-filters.html',
  styleUrl: './settings-filters.css',
})
export class SettingsFilters implements OnInit {
  private api = inject(Api);

  protected filters = signal<ContentFilter[]>([]);
  protected loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.filters().subscribe({
      next: (filters) => {
        this.filters.set(filters);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  remove(filter: ContentFilter): void {
    this.api.deleteFilter(filter.id).subscribe(() => {
      this.filters.update((list) => list.filter((f) => f.id !== filter.id));
    });
  }

  protected keywordSummary(filter: ContentFilter): string {
    const words = filter.keywords.map((k) => k.keyword);
    if (!words.length) {
      return 'No keywords';
    }
    return words.slice(0, 4).join(', ') + (words.length > 4 ? ` +${words.length - 4} more` : '');
  }

  protected expirySummary(filter: ContentFilter): string {
    if (!filter.expires_at) {
      return 'Never expires';
    }
    const when = new Date(filter.expires_at);
    return when.getTime() < Date.now() ? 'Expired' : `Expires ${when.toLocaleString()}`;
  }
}
