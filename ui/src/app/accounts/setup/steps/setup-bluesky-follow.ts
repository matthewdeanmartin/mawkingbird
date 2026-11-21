import { Component, inject, signal } from '@angular/core';
import { MbNotice } from '../../../design-system/notice/notice';
import { BlueskyStarterPacks } from '../../../connections/bluesky/bluesky-starter-packs';
import { BskyProfile } from '../../../connections/bluesky/bluesky-types';
import { BlueskyPeopleList } from '../../../discovery/bluesky-starter-packs/bluesky-people-list';
import { onSetupNext } from '../setup-state';

/** Enough follows for a Home feed that moves, as in the Mastodon run. */
const LIVELY_HOME = 20;

/**
 * Fill a new Bluesky account's Home feed from Bluesky's own suggestions, each
 * with a Follow button that acts at once (a follow is one record, cheap to
 * undo). Never required; starter packs wait in the app for whole topics.
 */
@Component({
  selector: 'app-setup-bluesky-follow',
  imports: [BlueskyPeopleList, MbNotice],
  template: `
    <p class="setup-lead-small">
      Follow a few people and your Home feed fills up. Bluesky suggests these to new accounts.
    </p>
    @if (failed()) {
      <mb-notice tone="error" announcement="alert">{{ failed() }}</mb-notice>
    }
    @if (people().length) {
      <app-bluesky-people-list
        [people]="people()"
        (followed)="followed.set(followed() + 1)"
        (failed)="failed.set($event)"
      />
    } @else if (loaded()) {
      <p class="setup-aside">Bluesky has no suggestions for this account yet.</p>
    }
    <p class="setup-aside" aria-live="polite">
      Followed {{ followed() }} here. About {{ lively }} makes a lively Home.
    </p>
  `,
  styleUrl: './setup-steps.css',
})
export class SetupBlueskyFollow {
  private readonly packs = inject(BlueskyStarterPacks);
  // Follows apply as they are clicked; Next has nothing left to do.
  protected readonly state = onSetupNext(() => undefined);

  protected readonly lively = LIVELY_HOME;
  protected readonly people = signal<BskyProfile[]>([]);
  protected readonly loaded = signal(false);
  protected readonly followed = signal(0);
  protected readonly failed = signal('');

  constructor() {
    this.packs
      .suggestions(30)
      .then((people) => this.people.set(people))
      .catch(() =>
        this.failed.set('Bluesky’s suggestions didn’t load. Skip this step, or try again later.'),
      )
      .finally(() => this.loaded.set(true));
  }
}
