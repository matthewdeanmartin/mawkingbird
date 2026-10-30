import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { accountProfilePath } from '../../../account-route';
import { Auth } from '../../../auth';
import { MbButton } from '../../../design-system/button/button';
import { MbRadioGroup } from '../../../design-system/radio-group/radio-group';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { MastodonConnector } from '../../../providers/mastodon/mastodon-connector';
import { BridgeFinder, BridgeRow } from './bridge-finder';
import { BridgeNetwork } from './bridge-matching';

// i18n settings.importExport.bridge.all: all
// i18n settings.importExport.bridge.anon.a: Reading a server anonymously can show you public posts, but it cannot tell us who
// i18n settings.importExport.bridge.anon.b: follow — so both sides need real credentials.
// i18n settings.importExport.bridge.anon.you: you
// i18n settings.importExport.bridge.bluesky: Bluesky —
// i18n settings.importExport.bridge.blueskyToMastodon: Bluesky → Mastodon
// i18n settings.importExport.bridge.connectBluesky: connect Bluesky
// i18n settings.importExport.bridge.connected: connected
// i18n settings.importExport.bridge.directionLabel: Search direction
// i18n settings.importExport.bridge.followSelected: Follow selected ({{count}})
// i18n settings.importExport.bridge.intro: You keep two follow lists that were built at different times. This finds the overlap: who you already follow on one network, and can now follow on the other.
// i18n settings.importExport.bridge.mastodon: Mastodon —
// i18n settings.importExport.bridge.mastodonToBluesky: Mastodon → Bluesky
// i18n settings.importExport.bridge.needsBoth: This needs both accounts connected.
// i18n settings.importExport.bridge.noMatches: No matches yet. Nobody you follow named their other account in their bio.
// i18n settings.importExport.bridge.pendingNote: didn’t name their other account. Searching for them costs one request each, so it’s opt-in and capped.
// i18n settings.importExport.bridge.people: people
// i18n settings.importExport.bridge.readFollows: Read my follows (free)
// i18n settings.importExport.bridge.readingFollows: Reading your follows…
// i18n settings.importExport.bridge.search: Search
// i18n settings.importExport.bridge.searchUpTo: Search up to
// i18n settings.importExport.bridge.searchesUsed: searches used
// i18n settings.importExport.bridge.signInMastodon: sign in to a Mastodon account
// i18n settings.importExport.bridge.summary.one: Read <strong>{{follows}}</strong> follows over {{pages}} page and found <strong>{{found}}</strong> from bios alone — no searches spent.
// i18n settings.importExport.bridge.summary.other: Read <strong>{{follows}}</strong> follows over {{pages}} pages and found <strong>{{found}}</strong> from bios alone — no searches spent.
// i18n settings.importExport.bridge.title: Find the same people on your other network
// i18n settings.importExport.bridge.following: Following…

/**
 * The bridge finder's UI: who you follow on one network that you can now follow
 * on the other, matched from bios first and by opt-in, capped search after.
 *
 * Shared by Settings → Import/Export and the /bluesky-to-mastodon and
 * /mastodon-to-bluesky tool pages. The work and its results live in the
 * root-provided {@link BridgeFinder}, so they survive moving between the two.
 */
@Component({
  selector: 'app-bridge-friends-import',
  imports: [FormsModule, RouterLink, TranslocoPipe, MbButton, MbRadioGroup],
  templateUrl: './bridge-friends-import.html',
  styleUrls: ['./friend-finder.css', './bridge-friends-import.css'],
})
export class BridgeFriendsImport {
  protected readonly accountProfilePath = accountProfilePath;

  protected bridge = inject(BridgeFinder);
  private auth = inject(Auth);
  private bsky = inject(BlueskySession);
  private mastodonConnector = inject(MastodonConnector);

  /**
   * Pins the direction for a tool page whose URL names it (/bluesky-to-mastodon
   * reads Bluesky follows and searches Mastodon), and hides the switch.
   * Settings leaves it null and offers both directions.
   */
  readonly fixedSource = input<BridgeNetwork | null>(null);
  /**
   * Set when the host offers its own sign-in and connect controls (the tool
   * pages embed the connectors), so the gate's links to Settings are not shown.
   */
  readonly connectInline = input(false);

  protected bridgeBudget = signal(50);
  protected bridgeSelected = signal<ReadonlySet<string>>(new Set());
  protected bridgeFollowing = signal(false);

  /**
   * Whether the user has credentials on Mastodon.
   *
   * Two ways to have them, and both count: a Mastodon-primary account holds the
   * token as its identity, while a Bluesky-primary account holds it in the
   * connector. An `anonymous` connector is deliberately *not* enough — reading a
   * public server anonymously cannot tell us who *you* follow.
   */
  protected hasMastodon = computed(
    () => this.auth.kind() === 'mastodon' || this.mastodonConnector.signedIn(),
  );

  /** Whether a Bluesky account is linked, in either of its two roles. */
  protected hasBluesky = computed(() => this.bsky.linked());

  /**
   * Both sides are required, and the section is disabled rather than hidden when
   * one is missing — a greyed-out bridge finder is the best argument there is
   * for attaching the second account.
   */
  protected bridgeReady = computed(() => this.hasMastodon() && this.hasBluesky());

  protected bridgeSource = computed(() => this.bridge.direction().source);

  protected bridgeMatchedRows = computed(() =>
    this.bridge.rows().filter((row) => row.matches.length > 0),
  );

  protected bridgePendingCount = computed(
    () => this.bridge.rows().filter((row) => row.status === 'pending').length,
  );

  /** Matches that are selected, unfollowed, and therefore actionable. */
  protected bridgeFollowTargets = computed(() =>
    this.bridgeMatchedRows()
      .flatMap((row) => row.matches)
      .filter(
        (match) =>
          this.bridgeSelected().has(match.account.id) && !this.bridge.isFollowing(match.account),
      )
      .map((match) => match.account),
  );

  protected setBridgeDirection(source: BridgeNetwork): void {
    this.bridgeSelected.set(new Set());
    this.bridge.setDirection(
      source === 'mastodon'
        ? { source: 'mastodon', target: 'bluesky' }
        : { source: 'bluesky', target: 'mastodon' },
    );
  }

  protected async loadBridge(): Promise<void> {
    this.bridgeSelected.set(new Set());
    await this.bridge.load();
    // Exact matches are self-published, so they are pre-selected; inferred ones
    // are not, and weak ones especially must never be followed by default.
    this.bridgeSelected.set(
      new Set(
        this.bridge
          .rows()
          .flatMap((row) => row.matches)
          .filter((match) => match.confidence === 'exact')
          .map((match) => match.account.id),
      ),
    );
  }

  protected toggleBridgeMatch(id: string): void {
    this.bridgeSelected.update((selected) => {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected async followBridgeSelection(): Promise<void> {
    if (this.bridgeFollowing()) return;
    this.bridgeFollowing.set(true);
    try {
      await this.bridge.followAll(this.bridgeFollowTargets());
    } finally {
      this.bridgeFollowing.set(false);
    }
  }

  protected bridgeRowKey(row: BridgeRow): string {
    return row.person.id;
  }

  constructor() {
    effect(() => {
      const source = this.fixedSource();
      if (source && untracked(() => this.bridgeSource()) !== source) {
        untracked(() => this.setBridgeDirection(source));
      }
    });
  }
}
