import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbRailCard } from '../../design-system/identity/rail-card';
import {
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
// i18n forum.facets.toggle: {{value}}, {{count}} discussions
// i18n forum.facets.people: {{count}} people chosen

interface FacetGroup {
  kind: Exclude<FacetKind, 'person'>;
  values: FacetValue[];
}

/**
 * Forum's left rail: hashtags, the root's server and language, counted over
 * the current tab (MIMB's facets, minus uncommon words; see spec/forum.md).
 * Choices are query parameters, so Back undoes them and a view can be shared.
 * Also shown in the list's Filters popover when the rail is hidden.
 */
@Component({
  selector: 'app-forum-facets',
  imports: [TranslocoPipe, MbButton, MbRailCard],
  template: `
    <section mbRailCard class="facets">
      @for (group of groups(); track group.kind) {
        @if (group.values.length) {
          <h2 class="card-title">{{ 'forum.facets.' + group.kind | transloco }}</h2>
          <div class="chips">
            @for (facet of group.values; track facet.value) {
              <button
                mbButton
                type="button"
                size="small"
                [variant]="chosen(group.kind, facet.value) ? 'solid' : 'outline'"
                [attr.aria-pressed]="chosen(group.kind, facet.value)"
                [attr.aria-label]="
                  'forum.facets.toggle'
                    | transloco: { value: label(group.kind, facet.value), count: facet.count }
                "
                (click)="toggle(group.kind, facet.value)"
              >
                {{ label(group.kind, facet.value) }} <span class="count">{{ facet.count }}</span>
              </button>
            }
          </div>
        }
      }
      @if (empty()) {
        <p class="muted small">{{ 'forum.facets.none' | transloco }}</p>
      }
      @if (view.choice().person.length) {
        <p class="muted small">
          {{ 'forum.facets.people' | transloco: { count: view.choice().person.length } }}
        </p>
      }
      @if (filtered()) {
        <button mbButton type="button" size="small" variant="outline" (click)="clear()">
          {{ 'forum.facets.clear' | transloco }}
        </button>
      }
    </section>
  `,
  styles: `
    .facets {
      display: grid;
      gap: 0.5rem;
    }
    h2 {
      margin: 0.25rem 0 0;
      font-size: 0.95rem;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .count {
      opacity: 0.7;
      font-variant-numeric: tabular-nums;
    }
    p {
      margin: 0;
    }
  `,
})
export class ForumFacets {
  protected view = inject(ForumView);
  private scan = inject(ForumScan);
  private router = inject(Router);
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

  protected toggle(kind: FacetKind, value: string): void {
    this.go(toggleFacet(this.view.choice(), kind, value));
  }

  protected clear(): void {
    this.go(NO_FACETS);
  }

  /** To the list, with its tab and source kept: a choice made beside a discussion lands there too. */
  private go(choice: typeof NO_FACETS): void {
    void this.router.navigate(['/forum'], {
      queryParams: { ...this.scan.listParams, ...facetParams(choice) },
    });
  }
}
