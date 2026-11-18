import { Component, computed, inject, input, OnInit } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { UnbirdDrop } from './unbird-drop';
import { FIRST_PASS, UnbirdMatcher } from './unbird-matcher';
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
  imports: [TranslocoPipe, UnbirdDrop, UnbirdPeople, UnbirdServers],
  template: `
    <app-unbird-drop (loaded)="started()" />
    @if (matcher.archive()) {
      <app-unbird-people [via]="via()" />
      @if (via() === 'public') {
        <app-unbird-servers />
      }
    }
    @if (classic()) {
      <details class="classic">
        <summary>{{ 'unbird.landing.classic' | transloco }}</summary>
        <ng-content />
      </details>
    }
  `,
  styles: `
    :host {
      display: block;
      margin: 8px 0 28px;
    }
    .classic {
      margin-top: 20px;
    }
    .classic > summary {
      cursor: pointer;
      color: var(--muted);
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
    void this.matcher.restore();
  }

  protected started(): void {
    void this.matcher.search(this.via(), FIRST_PASS);
  }
}
