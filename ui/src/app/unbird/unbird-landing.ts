import { Component, computed, inject, input, OnInit } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDisclosure } from '../design-system/disclosure/disclosure';
import { UnbirdDrop } from './unbird-drop';
import { UnbirdMore } from './unbird-more';
import { UnbirdMatcher } from './unbird-matcher';
import { UnbirdPeople } from './unbird-people';
import { UnbirdServers } from './unbird-servers';

// i18n unbird.landing.classic: Classic importer (more options, search one by one)

/**
 * The Twitter-to-Mastodon flow on one screen: drop the archive, see who is
 * already on Mastodon, then (without an account) the servers where those
 * people landed.
 *
 * It is what `/twitter-to-mastodon/` shows first. The classic importer is
 * projected into a closed disclosure below it, unchanged, so nothing that page
 * did before is gone.
 *
 * A saved archive is restored on arrival, and the first pass of searches
 * starts by itself after a new archive is read: the payoff should not wait
 * for another click.
 */
@Component({
  selector: 'app-unbird-landing',
  imports: [MbDisclosure, TranslocoPipe, UnbirdDrop, UnbirdMore, UnbirdPeople, UnbirdServers],
  template: `
    <app-unbird-drop (loaded)="started()" />
    @if (matcher.archive()) {
      <app-unbird-people [via]="via()" />
      @if (via() === 'public') {
        <app-unbird-servers />
      }
      <app-unbird-more exclude="people" />
    }
    @if (classic()) {
      <mb-disclosure class="classic" [label]="'unbird.landing.classic' | transloco">
        <ng-content />
      </mb-disclosure>
    }
  `,
  styles: `
    :host {
      display: block;
      margin: 8px 0 28px;
    }
    .classic {
      display: block;
      margin-top: 20px;
    }
  `,
})
export class UnbirdLanding implements OnInit {
  protected readonly matcher = inject(UnbirdMatcher);

  /** Signed in with Mastodon: search the reader's own server and offer Follow. */
  readonly signedIn = input(false);
  /** Show the projected classic importer under a disclosure. */
  readonly classic = input(true);

  protected readonly via = computed(() => (this.signedIn() ? 'account' : 'public'));

  ngOnInit(): void {
    // A search left unfinished on an earlier visit carries on where it stopped.
    void this.matcher.restore().then((archive) => {
      if (archive && this.matcher.searched() > 0 && this.matcher.remaining() > 0) {
        void this.matcher.search(this.via());
      }
    });
  }

  protected started(): void {
    void this.matcher.search(this.via());
  }
}
