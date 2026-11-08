import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClientPrefs } from '../../../client-prefs';
import { MbButton } from '../../../design-system/button/button';
import { MbContentState } from '../../../design-system/content-state/content-state';
import { MbToolbar, MbToolbarButton } from '../../../design-system/toolbar/toolbar';
import { HumanTimePipe } from '../../../human-time.pipe';
import { Status } from '../../../models';
import {
  HistoryEntry,
  historyMatches,
  POST_HISTORY_LIMIT,
  POST_HISTORY_PAGE,
  PostHistory,
} from '../../../post-history';
import { StatusCard } from '../../../status-card/status-card';

// i18n pages.bookmarks.history.intro: The last {{limit}} posts you scrolled past, newest first. Kept only in this browser, for this account.
// i18n pages.bookmarks.history.filterLabel: Find a post you saw
// i18n pages.bookmarks.history.placeholder: Words or author
// i18n pages.bookmarks.history.count: {{shown}} of {{total}} remembered posts
// i18n pages.bookmarks.history.actions: History actions
// i18n pages.bookmarks.history.clear: Clear history
// i18n pages.bookmarks.history.confirmClear: Really clear all {{count}}?
// i18n pages.bookmarks.history.cancel: Cancel
// i18n pages.bookmarks.history.off: History is off, so nothing new is being remembered.
// i18n pages.bookmarks.history.turnOn: Turn it on in Privacy settings
// i18n pages.bookmarks.history.empty: Nothing yet. Posts appear here as they scroll past in any feed.
// i18n pages.bookmarks.history.noMatch: No remembered post matches that.
// i18n pages.bookmarks.history.noAccount: Sign in or use Anonymous to keep a history.
// i18n pages.bookmarks.history.loading: Loading…
// i18n pages.bookmarks.history.loadMore: Load {{count}} more
// i18n pages.bookmarks.history.seen: Seen {{time}}
// i18n pages.bookmarks.history.unavailable: Could not load this post. It may have been deleted, or its server is unreachable.
// i18n pages.bookmarks.history.open: Open original
// i18n pages.bookmarks.history.forget: Forget

/**
 * History: posts scrolled past, searchable by remembered text, rendered as full
 * cards {@link POST_HISTORY_PAGE} at a time. Cards here never record into
 * history themselves — reading the list must not reorder it.
 */
@Component({
  selector: 'app-history-panel',
  imports: [
    StatusCard,
    TranslocoPipe,
    RouterLink,
    MbButton,
    MbContentState,
    MbToolbar,
    MbToolbarButton,
    HumanTimePipe,
  ],
  templateUrl: './history-panel.html',
  styleUrl: './history-panel.css',
})
export class HistoryPanel {
  private history = inject(PostHistory);
  protected prefs = inject(ClientPrefs);
  protected readonly store = this.history.current();
  protected readonly limit = POST_HISTORY_LIMIT;

  protected query = signal('');
  protected shownCount = signal(POST_HISTORY_PAGE);
  protected confirming = signal(false);
  protected loading = signal(false);
  /** Fetched cards by entry key; a key mapped to null could not be fetched. */
  protected cards = signal(new Map<string, Status | null>());
  private pending = new Set<string>();

  protected all = computed(() => this.store?.entries() ?? []);
  protected matching = computed(() => {
    const q = this.query();
    return this.all().filter((entry) => historyMatches(entry, q));
  });
  protected visible = computed(() => this.matching().slice(0, this.shownCount()));
  protected remaining = computed(() =>
    Math.min(POST_HISTORY_PAGE, this.matching().length - this.visible().length),
  );

  constructor() {
    effect(() => {
      const wanted = this.visible();
      untracked(() => void this.load(wanted));
    });
  }

  private async load(entries: HistoryEntry[]): Promise<void> {
    const cards = this.cards();
    // In-flight keys count as asked: refiltering mid-fetch must not ask again.
    const missing = entries.filter(
      (entry) => !cards.has(entry.key) && !this.pending.has(entry.key),
    );
    if (!missing.length) return;
    for (const entry of missing) this.pending.add(entry.key);
    this.loading.set(true);
    try {
      const found = await this.history.fetch(missing);
      this.cards.update((current) => {
        const next = new Map(current);
        for (const entry of missing) next.set(entry.key, found.get(entry.key) ?? null);
        return next;
      });
    } finally {
      for (const entry of missing) this.pending.delete(entry.key);
      this.loading.set(this.pending.size > 0);
    }
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.shownCount.set(POST_HISTORY_PAGE);
  }

  protected more(): void {
    this.shownCount.update((n) => n + POST_HISTORY_PAGE);
  }

  protected seenIso(entry: HistoryEntry): string {
    return new Date(entry.seen).toISOString();
  }

  protected forget(entry: HistoryEntry): void {
    this.store?.remove(entry.key);
  }

  protected clear(): void {
    this.store?.clear();
    this.cards.set(new Map());
    this.confirming.set(false);
    this.shownCount.set(POST_HISTORY_PAGE);
  }
}
