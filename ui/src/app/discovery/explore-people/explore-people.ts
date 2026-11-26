import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbTab, MbTabs } from '../../design-system/tabs/tabs';
import { Auth } from '../../platform/session/auth';
import { DISCOVERY_WAYS, DiscoveryWay } from '../discovery-ways';
import { Directory } from '../directory/directory';
import { ServerSuggestions } from '../find-friends/server-suggestions';
import { Search } from '../search/search';

// i18n exploreMore.people.tabs: Ways to find people
// i18n exploreMore.people.search: Search
// i18n exploreMore.people.suggested: Suggested
// i18n exploreMore.people.directory: Directory
// i18n exploreMore.people.more: More

export type PeopleTab = 'search' | 'suggested' | 'directory' | 'more';

/** The Find Friends rows the More tab lists, in this order. */
const MORE_WAYS = ['offsite-directories', 'contacts', 'import'] as const;

/**
 * The tab last open, kept for the session so Back from a profile returns to it.
 * Not in the URL: Search and Directory each own the query string.
 */
let lastTab: PeopleTab = 'search';

/** For tests. */
export function resetPeopleTab(): void {
  lastTab = 'search';
}

/**
 * Explore → People (spec/sprint/explore-2026-11.md): Search | Suggested |
 * Directory | More, as tabs rather than one long page (owner, 2026-11-26).
 *
 * Search is `/search` itself, held to people by this route's `peopleOnly` data;
 * Directory is `/directory` itself. Only the open tab is rendered, so a tab costs
 * its requests only when it is opened. Find Friends keeps its own list of these
 * ways (more ways in, none taken away).
 */
@Component({
  selector: 'app-explore-people',
  imports: [Directory, MbTab, MbTabs, RouterLink, Search, ServerSuggestions, TranslocoPipe],
  template: `
    <mb-tabs
      [label]="'exploreMore.people.tabs' | transloco"
      [selected]="tab()"
      (selectedChange)="select($event)"
    >
      <ng-template mbTab value="search" [label]="'exploreMore.people.search' | transloco">
        @if (tab() === 'search') {
          <app-search />
        }
      </ng-template>
      @if (offersSuggestions()) {
        <ng-template mbTab value="suggested" [label]="'exploreMore.people.suggested' | transloco">
          @if (tab() === 'suggested') {
            <app-server-suggestions />
          }
        </ng-template>
      }
      <ng-template mbTab value="directory" [label]="'exploreMore.people.directory' | transloco">
        @if (tab() === 'directory') {
          <app-directory />
        }
      </ng-template>
      <ng-template mbTab value="more" [label]="'exploreMore.people.more' | transloco">
        @if (tab() === 'more') {
          <section class="ep-more">
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
        }
      </ng-template>
    </mb-tabs>
  `,
  // Find Friends' row styles, reused so the two lists look alike.
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../find-friends/find-friends.css',
})
export class ExplorePeople {
  private auth = inject(Auth);
  /** As on Find Friends: suggestions need a signed-in Mastodon account. */
  protected readonly offersSuggestions = computed(
    () => this.auth.kind() === 'mastodon' && !!this.auth.token(),
  );
  private readonly chosen = signal<PeopleTab>(lastTab);
  /** Suggested falls back to Search where it is not offered. */
  protected readonly tab = computed<PeopleTab>(() =>
    this.chosen() === 'suggested' && !this.offersSuggestions() ? 'search' : this.chosen(),
  );
  protected readonly ways: readonly DiscoveryWay[] = MORE_WAYS.map((id) =>
    DISCOVERY_WAYS.find((way) => way.id === id)!,
  ).filter(Boolean);

  protected select(value: string): void {
    lastTab = value as PeopleTab;
    this.chosen.set(lastTab);
  }
}
