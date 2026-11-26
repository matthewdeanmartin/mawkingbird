import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../platform/session/auth';
import { DISCOVERY_WAYS, DiscoveryWay } from '../discovery-ways';
import { ServerSuggestions } from '../find-friends/server-suggestions';
import { Search } from '../search/search';

// i18n exploreMore.people.heading: More ways to find people

/** The Find Friends rows that are about finding particular people, in this order. */
const PEOPLE_WAYS = ['profile-directory', 'offsite-directories', 'contacts', 'import'] as const;

/**
 * Explore → People (spec/sprint/explore-2026-11.md, Sprint 4): account search,
 * held to people by this route's `peopleOnly` data, then the server's own
 * suggestions and the other ways to find someone, as one-line links.
 *
 * Search is the `/search` page itself, not a copy; Find Friends keeps its own
 * list of the same ways (owner, 2026-11-26: more ways in, none taken away).
 */
@Component({
  selector: 'app-explore-people',
  imports: [RouterLink, Search, ServerSuggestions, TranslocoPipe],
  template: `
    <app-search />
    <section class="ep-more">
      @if (offersSuggestions()) {
        <app-server-suggestions />
      }
      <h2 class="ep-heading">{{ 'exploreMore.people.heading' | transloco }}</h2>
      @for (way of ways; track way.id) {
        <a
          class="doc-row"
          [routerLink]="way.route"
          [queryParams]="way.query"
          [fragment]="way.fragment"
        >
          <span class="doc-title">{{ way.title | transloco }}</span>
          <span class="muted small">{{ way.description | transloco }}</span>
        </a>
      }
    </section>
  `,
  // Find Friends' row styles, reused so the two lists look alike.
  styleUrl: '../find-friends/find-friends.css',
  styles: `
    .ep-more {
      margin-top: 1.5rem;
    }
    .ep-heading {
      font-size: 0.95rem;
      margin: 1rem 0 0.25rem;
    }
  `,
})
export class ExplorePeople {
  private auth = inject(Auth);
  /** As on Find Friends: suggestions need a signed-in Mastodon account. */
  protected readonly offersSuggestions = computed(
    () => this.auth.kind() === 'mastodon' && !!this.auth.token(),
  );
  protected readonly ways: readonly DiscoveryWay[] = PEOPLE_WAYS.map((id) =>
    DISCOVERY_WAYS.find((way) => way.id === id)!,
  ).filter(Boolean);
}
