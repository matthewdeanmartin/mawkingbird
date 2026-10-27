import { computed, inject, Injectable, signal } from '@angular/core';
import { applyFacets, facetCounts, FacetChoice, NO_FACETS } from './discussion-facets';
import { filterSummaries, ForumFilter } from './discussion';
import { ForumScan } from './forum-scan';

/**
 * What Forum is showing, shared between the page in the centre and the rails
 * beside it. The rails live in the shell, outside the router outlet, so they
 * cannot read the page's query parameters; the pages publish them here.
 */
@Injectable({ providedIn: 'root' })
export class ForumView {
  private scan = inject(ForumScan);

  readonly filter = signal<ForumFilter>('talk');
  readonly choice = signal<FacetChoice>(NO_FACETS);
  /** The anchor id of the discussion open at `/forum/d/:id`; null on the list. */
  readonly focus = signal<string | null>(null);

  /** The tab's discussions before facets: the facet counts' denominator. */
  readonly tab = computed(() => filterSummaries(this.scan.summaries(), this.filter()));
  readonly counts = computed(() => facetCounts(this.tab()));
  /** What the list shows, unsorted. */
  readonly visible = computed(() => applyFacets(this.tab(), this.choice()));
}
