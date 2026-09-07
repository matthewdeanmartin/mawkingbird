import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { forkJoin, Observable, of } from 'rxjs';
import { Api } from '../../../api';
import { ContentFilter, FilterAction, FilterContext, FilterKeyword } from '../../../models';

interface ContextOption {
  value: FilterContext;
  /** Translation key, resolved in the template — see scripts/extract-i18n.mjs. */
  key: string;
}

/** Draft keyword row: existing rows carry their server id, new rows id=null. */
interface KeywordRow {
  id: string | null;
  keyword: string;
  whole_word: boolean;
}

/**
 * Create/edit one v2 filter: title, contexts, expiry, warn/hide action, and its
 * keyword list. Keywords on an existing filter are added/removed immediately via
 * the keywords sub-API; on a new filter they're sent as `keywords_attributes`.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.filters.add: Add new filter
// i18n settings.filters.edit: Edit filter
// i18n settings.filters.edit.intro: Posts matching any keyword are hidden with a warning, or removed entirely.
// i18n settings.filters.titleLabel: Title
// i18n settings.filters.titlePlaceholder: e.g. Spoilers
// i18n settings.filters.contexts: Filter contexts
// i18n settings.filters.contexts.hint: Where the filter should apply.
// i18n settings.filters.context.home: Home and lists
// i18n settings.filters.context.notifications: Notifications
// i18n settings.filters.context.public: Public timelines
// i18n settings.filters.context.thread: Conversations
// i18n settings.filters.context.account: Profiles
// i18n settings.filters.action: Filter action
// i18n settings.filters.action.warn: Hide with a warning — the post is collapsed behind the filter's title
// i18n settings.filters.action.hide: Hide completely — the post disappears as if it didn't exist
// i18n settings.filters.expire: Expire after
// i18n settings.filters.keepExpiry: Keep current expiry ({{when}})
// i18n settings.filters.neverExpires: never expires
// i18n settings.filters.expiry.never: Never
// i18n settings.filters.expiry.min30: 30 minutes
// i18n settings.filters.expiry.hour1: 1 hour
// i18n settings.filters.expiry.hour6: 6 hours
// i18n settings.filters.expiry.hour12: 12 hours
// i18n settings.filters.expiry.day1: 1 day
// i18n settings.filters.expiry.week1: 1 week
// i18n settings.filters.keywords: Keywords or phrases
// i18n settings.filters.keywordPlaceholder: Keyword or phrase
// i18n settings.filters.wholeWord: Whole word
// i18n settings.filters.removeKeyword: Remove keyword
// i18n settings.filters.addKeyword: + Add keyword
// i18n settings.filters.wholeWord.hint: Whole word: "cat" matches only the word cat, not "category". Existing keywords can be removed and re-added to change them.
// i18n settings.filters.create: Create filter
// i18n common.cancel: Cancel
@Component({
  selector: 'app-settings-filter-edit',
  imports: [DatePipe, FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './settings-filter-edit.html',
  styleUrl: './settings-filter-edit.css',
})
export class SettingsFilterEdit implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly contextOptions: ContextOption[] = [
    { value: 'home', key: 'settings.filters.context.home' },
    { value: 'notifications', key: 'settings.filters.context.notifications' },
    { value: 'public', key: 'settings.filters.context.public' },
    { value: 'thread', key: 'settings.filters.context.thread' },
    { value: 'account', key: 'settings.filters.context.account' },
  ];

  /** Expiry choices, in seconds; null = never. */
  protected readonly expiryOptions: { value: number | null; key: string }[] = [
    { value: null, key: 'settings.filters.expiry.never' },
    { value: 1800, key: 'settings.filters.expiry.min30' },
    { value: 3600, key: 'settings.filters.expiry.hour1' },
    { value: 21600, key: 'settings.filters.expiry.hour6' },
    { value: 43200, key: 'settings.filters.expiry.hour12' },
    { value: 86400, key: 'settings.filters.expiry.day1' },
    { value: 604800, key: 'settings.filters.expiry.week1' },
  ];

  protected filterId = signal<string | null>(null);
  protected title = signal('');
  protected contexts = signal<FilterContext[]>(['home', 'notifications', 'public', 'thread']);
  protected action = signal<FilterAction>('warn');
  protected expiresIn = signal<number | null>(null);
  protected currentExpiry = signal<string | null>(null);
  protected keepExpiry = signal(true);
  protected keywords = signal<KeywordRow[]>([{ id: null, keyword: '', whole_word: true }]);
  /** Keywords removed from an existing filter; deleted server-side on save. */
  private removedKeywordIds: string[] = [];

  protected loading = signal(false);
  protected saving = signal(false);
  protected error = signal<string | null>(null);

  protected get isNew(): boolean {
    return this.filterId() === null;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      return;
    }
    this.filterId.set(id);
    this.loading.set(true);
    this.api.getFilter(id).subscribe({
      next: (filter) => {
        this.applyFilter(filter);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load this filter.');
      },
    });
  }

  private applyFilter(filter: ContentFilter): void {
    this.title.set(filter.title);
    this.contexts.set(filter.context);
    this.action.set(filter.filter_action);
    this.currentExpiry.set(filter.expires_at);
    const rows: KeywordRow[] = filter.keywords.map((k: FilterKeyword) => ({
      id: k.id,
      keyword: k.keyword,
      whole_word: k.whole_word,
    }));
    this.keywords.set(rows.length ? rows : [{ id: null, keyword: '', whole_word: true }]);
  }

  hasContext(value: FilterContext): boolean {
    return this.contexts().includes(value);
  }

  toggleContext(value: FilterContext, checked: boolean): void {
    this.contexts.update((list) =>
      checked ? [...new Set([...list, value])] : list.filter((c) => c !== value),
    );
  }

  setKeyword(index: number, key: 'keyword' | 'whole_word', value: string | boolean): void {
    this.keywords.update((list) =>
      list.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }

  addKeywordRow(): void {
    this.keywords.update((list) => [...list, { id: null, keyword: '', whole_word: true }]);
  }

  removeKeywordRow(index: number): void {
    const row = this.keywords()[index];
    if (row?.id) {
      this.removedKeywordIds.push(row.id);
    }
    this.keywords.update((list) => list.filter((_, i) => i !== index));
  }

  save(): void {
    if (this.saving()) {
      return;
    }
    const title = this.title().trim();
    if (!title) {
      this.error.set('A title is required.');
      return;
    }
    if (!this.contexts().length) {
      this.error.set('Pick at least one context.');
      return;
    }
    this.error.set(null);
    this.saving.set(true);

    if (this.isNew) {
      this.createNew(title);
    } else {
      this.updateExisting(title);
    }
  }

  private createNew(title: string): void {
    const keywords = this.keywords()
      .filter((row) => row.keyword.trim())
      .map((row) => ({ keyword: row.keyword.trim(), whole_word: row.whole_word }));
    this.api
      .createFilter({
        title,
        context: this.contexts(),
        filter_action: this.action(),
        expires_in: this.expiresIn(),
        keywords_attributes: keywords,
      })
      .subscribe({
        next: () => void this.router.navigate(['/settings/filters']),
        error: () => {
          this.saving.set(false);
          this.error.set('Saving failed.');
        },
      });
  }

  private updateExisting(title: string): void {
    const id = this.filterId()!;
    const changes: Parameters<Api['updateFilter']>[1] = {
      title,
      context: this.contexts(),
      filter_action: this.action(),
    };
    // Only send expiry when the user picked a new one; otherwise keep the current.
    if (!this.keepExpiry()) {
      changes.expires_in = this.expiresIn();
    }

    const keywordCalls: Observable<unknown>[] = [
      this.api.updateFilter(id, changes),
      ...this.removedKeywordIds.map((kid) => this.api.deleteFilterKeyword(kid)),
      ...this.keywords()
        .filter((row) => row.id === null && row.keyword.trim())
        .map((row) => this.api.addFilterKeyword(id, row.keyword.trim(), row.whole_word)),
    ];
    forkJoin(keywordCalls.length ? keywordCalls : [of(null)]).subscribe({
      next: () => void this.router.navigate(['/settings/filters']),
      error: () => {
        this.saving.set(false);
        this.error.set('Saving failed.');
      },
    });
  }
}
