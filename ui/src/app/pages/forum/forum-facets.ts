import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbRailCard } from '../../design-system/identity/rail-card';
import {
  FacetChoice,
  facetParams,
  FacetKind,
  FacetValue,
  hasFacets,
  NO_FACETS,
  toggleFacet,
} from '../../forum/discussion-facets';
import { ForumScan } from '../../forum/forum-scan';
import { ForumView } from '../../forum/forum-view';

// i18n forum.facets.rail: Discussion filters
// i18n forum.facets.tag: Hashtags
// i18n forum.facets.instance: Started on
// i18n forum.facets.lang: Language
// i18n forum.facets.none: Nothing to filter by yet.
// i18n forum.facets.clear: Clear filters
// i18n forum.facets.countOne: 1 discussion
// i18n forum.facets.countOther: {{count}} discussions
// i18n forum.facets.people: {{count}} people chosen
// i18n forum.facets.chosen: Chosen

interface FacetGroup {
  kind: Exclude<FacetKind, 'person'>;
  values: FacetValue[];
}

/**
 * Forum's left rail: hashtags, the root's server and language, counted over
 * the current tab (MIMB's facets, minus uncommon words; see spec/forum.md).
 *
 * Each value is a row linking to the list with that choice switched on or off,
 * in the same shape as the default rails' trends: data reads as a list, and
 * pill buttons are kept for actions. Choices are query parameters, so Back
 * undoes them and a view can be shared. Also shown in the list's Filters
 * disclosure when the rail is hidden.
 */
@Component({
  selector: 'app-forum-facets',
  imports: [RouterLink, TranslocoPipe, MbRailCard],
  template: `
    @for (group of groups(); track group.kind) {
      @if (group.values.length) {
        <section mbRailCard class="card">
          <h2 class="card-title">{{ 'forum.facets.' + group.kind | transloco }}</h2>
          @for (facet of group.values; track facet.value) {
            <a
              class="facet"
              routerLink="/forum"
              [queryParams]="params(group.kind, facet.value)"
              [class.chosen]="chosen(group.kind, facet.value)"
              [attr.aria-current]="chosen(group.kind, facet.value) ? 'true' : null"
            >
              <span class="facet-name">{{ label(group.kind, facet.value) }}</span>
              <span class="facet-count muted">
                <span class="sr-only">
                  {{
                    (facet.count === 1 ? 'forum.facets.countOne' : 'forum.facets.countOther')
                      | transloco: { count: facet.count }
                  }}
                </span>
                <span aria-hidden="true">{{ facet.count }}</span>
              </span>
            </a>
          }
        </section>
      }
    }
    @if (empty()) {
      <section mbRailCard class="card">
        <p class="card-note muted">{{ 'forum.facets.none' | transloco }}</p>
      </section>
    }
    @if (filtered()) {
      <section mbRailCard class="card">
        @if (view.choice().person.length) {
          <p class="card-note muted">
            {{ 'forum.facets.people' | transloco: { count: view.choice().person.length } }}
          </p>
        }
        <a class="facet clear" routerLink="/forum" [queryParams]="cleared()">
          {{ 'forum.facets.clear' | transloco }}
        </a>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .card {
      margin-bottom: 12px;
    }
    .facet {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      padding: 7px 14px;
      border-bottom: 1px solid var(--border);
      border-inline-start: 3px solid transparent;
      color: var(--text);
      text-decoration: none;
    }
    .facet:last-child {
      border-bottom: none;
    }
    .facet:hover {
      background: var(--hover);
      text-decoration: none;
    }
    .facet.chosen {
      border-inline-start-color: var(--accent);
      font-weight: 700;
    }
    .facet-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .facet-count {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .clear {
      color: var(--accent);
    }
    .card-note {
      margin: 0;
      padding: 10px 14px;
      font-size: 13px;
    }
  `,
})
export class ForumFacets {
  protected view = inject(ForumView);
  private scan = inject(ForumScan);
  private transloco = inject(TranslocoService);

  protected groups = computed<FacetGroup[]>(() => {
    const counts = this.view.counts();
    return [
      { kind: 'tag', values: counts.tag },
      { kind: 'instance', values: counts.instance },
      { kind: 'lang', values: counts.lang },
    ];
  });
  protected empty = computed(() => this.groups().every((group) => !group.values.length));
  protected filtered = computed(() => hasFacets(this.view.choice()));

  private languageNames = computed(() => {
    try {
      return new Intl.DisplayNames([this.transloco.getActiveLang()], { type: 'language' });
    } catch {
      return null;
    }
  });

  protected chosen(kind: FacetKind, value: string): boolean {
    return this.view.choice()[kind].includes(value);
  }

  protected label(kind: FacetKind, value: string): string {
    if (kind === 'tag') return `#${value}`;
    if (kind === 'lang') {
      try {
        return this.languageNames()?.of(value) ?? value;
      } catch {
        return value;
      }
    }
    return value;
  }

  /** The list with this value switched, keeping its tab and source. */
  protected params(kind: FacetKind, value: string) {
    return this.to(toggleFacet(this.view.choice(), kind, value));
  }

  protected cleared() {
    return this.to(NO_FACETS);
  }

  private to(choice: FacetChoice) {
    return { ...this.scan.listParams, ...facetParams(choice) };
  }
}
