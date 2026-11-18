import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import {
  Availability,
  checkHandle,
} from '../accounts/mastodon-handle-generator/handle-availability';
import { UnbirdMatcher } from './unbird-matcher';

// i18n unbird.servers.title: Where your people landed
// i18n unbird.servers.lead: Mastodon is many servers that talk to each other. You can follow anyone from any of them, but joining where your friends are makes the local timeline feel like home.
// i18n unbird.servers.people.one: {{count}} of your people
// i18n unbird.servers.people.other: {{count}} of your people
// i18n unbird.servers.handleFree: @{{user}} looks free here
// i18n unbird.servers.handleTaken: @{{user}} is taken here
// i18n unbird.servers.join: Join {{server}}
// i18n unbird.servers.other: Pick another server
// i18n unbird.servers.haveAccount: I already have a Mastodon account
// i18n unbird.servers.after: After you sign up you come straight back here, with your people waiting.

/** Shown at most this many servers; the rest are a click on "Pick another server". */
const SHOWN = 3;

/**
 * Server matchmaking for someone who has no Mastodon account yet: the servers
 * where their people already are, whether their Twitter handle is free there,
 * and a sign-up that comes back to Unbird.
 */
@Component({
  selector: 'app-unbird-servers',
  imports: [MbButton, RouterLink, TranslocoPipe],
  templateUrl: './unbird-servers.html',
  styleUrl: './unbird-servers.css',
})
export class UnbirdServers {
  private readonly matcher = inject(UnbirdMatcher);
  protected readonly servers = computed(() => this.matcher.servers().slice(0, SHOWN));
  protected readonly user = computed(() => this.matcher.archive()?.owner.userName ?? null);
  protected readonly handles = signal<ReadonlyMap<string, Availability>>(new Map());
  protected readonly next = '/unbird/people';

  constructor() {
    // Check the reader's Twitter handle once per suggested server.
    effect(() => {
      const user = this.user();
      if (!user) return;
      for (const { server } of this.servers()) {
        if (untracked(() => this.handles().has(server))) continue;
        this.handles.update((handles) => new Map(handles).set(server, 'unknown'));
        void checkHandle(server, user).then((availability) =>
          this.handles.update((handles) => new Map(handles).set(server, availability)),
        );
      }
    });
  }
}
