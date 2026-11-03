import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbSection } from '../../design-system/page-header/page-header';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import {
  BlueskyStarterPacks,
  StarterPackSummary,
  starterPackPath,
} from '../../providers/bluesky/bluesky-starter-packs';
import { BskyProfile } from '../../providers/bluesky/bluesky-types';
import { BlueskyPeopleList } from './bluesky-people-list';

// i18n bskyDiscovery.packs: Starter packs by {{name}}
// i18n bskyDiscovery.similar: Similar to {{name}}

/**
 * Bluesky discovery on a Bluesky profile: the starter packs this account
 * made, and, right after you follow it, accounts like it, as bsky.app offers.
 * Renders nothing when there is nothing to show.
 */
@Component({
  selector: 'app-bluesky-profile-discovery',
  imports: [RouterLink, TranslocoPipe, MbSection, MbContentLink, BlueskyPeopleList],
  template: `
    @if (packs().length) {
      <mb-section [title]="'bskyDiscovery.packs' | transloco: { name: name() }">
        <ul class="packs">
          @for (pack of packs(); track pack.uri) {
            <li>
              <a mbContentLink [routerLink]="packPath(pack.uri)">{{ pack.record.name }}</a>
            </li>
          }
        </ul>
      </mb-section>
    }
    @if (similar().length) {
      <mb-section [title]="'bskyDiscovery.similar' | transloco: { name: name() }">
        <app-bluesky-people-list [people]="similar()" />
      </mb-section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .packs {
      margin: 0;
      padding-inline-start: 1.2em;
    }
  `,
})
export class BlueskyProfileDiscovery {
  private packsService = inject(BlueskyStarterPacks);
  private session = inject(BlueskySession);

  readonly did = input.required<string>();
  readonly name = input('');
  /** Increments when the viewer follows this account here; shows similar accounts. */
  readonly followedTick = input(0);

  protected readonly packPath = starterPackPath;
  protected packs = signal<StarterPackSummary[]>([]);
  protected similar = signal<BskyProfile[]>([]);

  constructor() {
    effect(() => {
      const did = this.did();
      untracked(() => {
        this.similar.set([]);
        void this.packsService.byActor(did).then(
          (packs) => this.packs.set(packs),
          () => this.packs.set([]),
        );
      });
    });
    effect(() => {
      if (!this.followedTick() || !this.session.linked()) return;
      const did = this.did();
      untracked(() => {
        void this.packsService.similarTo(did).then(
          (people) => this.similar.set(people.slice(0, 5)),
          () => this.similar.set([]),
        );
      });
    });
  }
}
