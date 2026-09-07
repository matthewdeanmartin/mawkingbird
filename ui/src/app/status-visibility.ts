import { inject, Injectable } from '@angular/core';
import { LocalModeration } from './local-moderation';
import { MutedPosts } from './muted-posts';
import { FilterContext, FilterResult, Status } from './models';

/** Why a card renders as nothing — `null` means it renders normally. */
export type HiddenReason = 'muted-post' | 'suppressed-author' | 'filter-hide';

/**
 * The single source of truth for "would `<app-status-card>` render literally
 * nothing for this status?".
 *
 * A card self-suppresses for per-post mutes, locally blocked/muted authors, and
 * hide-action content filters. Most timelines can ignore that — an invisible
 * card just leaves no trace. Containers that wrap each card in chrome of their
 * own (Algo's "why you're seeing this" line, Home's bookmark-tail label) must
 * ask *before* rendering, or the chrome is left stranded with nothing under it.
 */
@Injectable({ providedIn: 'root' })
export class StatusVisibility {
  private mutedPosts = inject(MutedPosts);
  private localMod = inject(LocalModeration);

  /** Matched filters that apply in `context` — boost wrapper and target both. */
  activeFilters(status: Status, context: FilterContext): FilterResult[] {
    const results = status.reblog
      ? [...(status.filtered ?? []), ...(status.reblog.filtered ?? [])]
      : (status.filtered ?? []);
    return results.filter(
      (result) => Array.isArray(result?.filter?.context) && result.filter.context.includes(context),
    );
  }

  /** A hide-action filter matched: the post renders as nothing at all. */
  hiddenByFilter(status: Status, context: FilterContext): boolean {
    return this.activeFilters(status, context).some((r) => r.filter.filter_action === 'hide');
  }

  /** The viewer hid this specific post, or locally blocked/muted either author. */
  mutedLocally(status: Status): boolean {
    const shown = status.reblog ?? status;
    if ((this.mutedPosts.muted()[shown.id] ?? 0) > Date.now()) {
      return true;
    }
    // Re-read the moderation map so callers' computeds recompute when it
    // changes, then test both the post's author and (for a boost) the booster.
    this.localMod.entries();
    return this.localMod.isSuppressed(shown.account) || this.localMod.isSuppressed(status.account);
  }

  /**
   * Why the card would render nothing, or `null` when it renders. Reads the
   * same signals the card does, so callers' computeds stay reactive.
   */
  hiddenReason(status: Status, context: FilterContext = 'home'): HiddenReason | null {
    const shown = status.reblog ?? status;
    if ((this.mutedPosts.muted()[shown.id] ?? 0) > Date.now()) {
      return 'muted-post';
    }
    this.localMod.entries();
    if (this.localMod.isSuppressed(shown.account) || this.localMod.isSuppressed(status.account)) {
      return 'suppressed-author';
    }
    return this.hiddenByFilter(status, context) ? 'filter-hide' : null;
  }

  /** True when the card would render nothing at all. */
  rendersNothing(status: Status, context: FilterContext = 'home'): boolean {
    return this.hiddenReason(status, context) !== null;
  }
}
