import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Terminology } from '../../terminology';
import { AnnouncementStore } from '../../announcements/announcement-store';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { FeedCapability } from '../../feed-capability';
import { HouseAdStore } from '../../house-ad-store';
import { InstanceInfo } from '../../models';
import { SearchServer } from '../../search-server';
import { Server } from '../../server';
import { JustMyServer } from '../../just-my-server';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BlueskyTrends } from '../../providers/bluesky/bluesky-trends';
import { networkSources } from '../network-sources';
import { TranslocoPipe } from '@jsverse/transloco';

// i18n shell.rail.endorsement: endorsement
// i18n shell.rail.houseEndorsement: House endorsement
// i18n shell.rail.hideAd: Hide this until you reload
// i18n shell.rail.singleServerMode: Single Server Mode
// i18n shell.rail.justMyServer: Just My Server
// i18n shell.rail.justMyServerAria: Just My Server mode
// i18n shell.rail.homeOnly: Home shows only people you follow on {{server}}. Remote boosts stay out.
// i18n shell.rail.checkingFriends: Checking friends…
// i18n shell.rail.updateMyServer: Update My Server list
// i18n shell.rail.checkingGenerated: Checking for the generated list…
// i18n shell.rail.updateBeforeEnable: Update the list before turning this mode on.
// i18n shell.rail.updateResult: Added {{added}} · Removed {{removed}} · Already present {{alreadyPresent}} · Failed {{failed}}
// i18n shell.rail.entryway: entryway
// i18n shell.rail.selfHosted: self-hosted
// i18n shell.rail.yourBluesky: Your Bluesky
// i18n shell.rail.trendingBluesky: Trending on Bluesky
// i18n shell.rail.fediverse: Fediverse
// i18n shell.rail.news: News
// i18n shell.rail.trendingPosts: Trending posts
// i18n shell.rail.allFeeds: All feeds
// i18n shell.rail.keepNetworkRunning: Keep the network running
// i18n shell.rail.donateTo: 💙 Donate to {{server}}
// i18n shell.rail.yourSearchServer: Your search server
// i18n shell.rail.donateSearch: 🔍 Donate to {{server}}
// i18n shell.rail.donateMastodon: 🐘 Donate to Mastodon
// i18n shell.rail.activeThisMonth: {{count}} active this month
// i18n shell.rail.feedsPostingTitle: Feeds, profiles and posting: {{server}}
// i18n shell.rail.feedsPosting: Feeds & posting
// i18n shell.rail.searchRunsOn: Search runs on {{server}}
// i18n shell.rail.search: 🔍 Search
// i18n shell.rail.announcements: 📣 Announcements
// i18n shell.rail.new: new
// i18n shell.rail.allRead: all read
// i18n shell.rail.dismissAll: Dismiss all
// i18n shell.rail.copyShareTitle: Copy a link that opens this server anonymously
// i18n shell.rail.shareServer: Share this server
// i18n shell.rail.shareDescription: This link opens Mawkingbird anonymously on {{server}}. Copy it to share — it won't take you anywhere.
// i18n shell.rail.shareLinkAria: Shareable server link
// i18n shell.rail.copy: Copy
// i18n shell.rail.copied: Copied to clipboard.
// i18n shell.rail.copyFailed: Couldn't copy automatically — select the text above and copy it manually.
// i18n shell.rail.close: Close
// i18n shell.rail.updateTitle: Update My Server list?
// i18n shell.rail.user.one: user
// i18n shell.rail.user.other: users
// i18n shell.rail.updatePrompt: Add {{addCount}} {{addWord}} and remove {{removeCount}} {{removeWord}} so the list contains only friends on {{server}}?
// i18n shell.rail.alreadyPresent: {{count}} already present. The list is <strong>{{title}}</strong>.
// i18n shell.rail.cancel: Cancel
// i18n shell.rail.updating: Updating…
// i18n shell.rail.updateList: Update list

/**
 * Right sidebar: house ads (inventory lives in house-ads.ts — edit that file to
 * change them), then the Fediverse card — server-feed entry points (which now
 * route into the Lists tab, not /explore), ways to give back (your own server,
 * the Mastodon project), server info.
 * Trends moved to the left rail under "Who to follow".
 */
@Component({
  selector: 'app-right-rail',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './right-rail.html',
  styleUrl: './right-rail.css',
})
export class RightRail implements OnInit {
  private api = inject(Api);
  protected announcements = inject(AnnouncementStore);
  protected auth = inject(Auth);
  protected words = inject(Terminology).words;
  /** Template-facing: the rail hides trend rows this server doesn't serve. */
  protected feedCaps = inject(FeedCapability);
  private server = inject(Server);
  protected searchServer = inject(SearchServer);
  protected justMyServer = inject(JustMyServer);

  /**
   * Which networks this account can use. Every Mastodon widget below is gated on
   * `usableMastodon`, and — more importantly than the markup — so are the
   * requests: a rail that renders nothing but still calls `/api/v1/instance`
   * spends bandwidth on a network the user declined, which is the exact cost the
   * Sprint 4 opt-in reversal was about.
   */
  private sources = networkSources();
  protected usableMastodon = this.sources.usableMastodon;
  protected usableBluesky = this.sources.usableBluesky;

  protected bsky = inject(BlueskySession);
  protected bskyTrends = inject(BlueskyTrends);

  /**
   * The Bluesky service card's payload: handle plus the PDS the account lives on.
   *
   * The counterpart to the Mastodon server-info card, minus the donate block —
   * Bluesky has no per-instance donation model and no instance to fund, so that
   * block simply does not exist here rather than being translated into something
   * meaningless.
   *
   * No DID (user's call). It is the durable identity and it is public, so showing
   * it would leak nothing — but it is an opaque `did:plc:…` string that means
   * nothing to most people, and the rail is the scarcest space in the app.
   *
   * `pdsUrl` is resolved lazily (chat needs the real PDS and resolves it via
   * plc.directory), so this falls back to `service` until something has asked.
   * The entryway/self-hosted distinction is the one piece of real information
   * here for the kind of person who runs their own.
   */
  protected bskyService = computed(() => {
    const session = this.bsky.session();
    if (!session) {
      return null;
    }
    const host = (session.pdsUrl ?? session.service).replace(/^https?:\/\//, '').replace(/\/$/, '');
    return {
      handle: session.handle,
      host,
      entryway: host === 'bsky.social',
    };
  });

  /**
   * The ads, plus which of them are on and which the user has clicked. The rail
   * asks for a pair and renders it; rotation, the off switches and the click
   * tally all live in the store, which Settings → Ads drives from the other end.
   */
  protected houseAds = inject(HouseAdStore);

  /**
   * Anonymous visitors leaning on someone else's search server are consuming a
   * second instance's resources without an account there, so the rail asks them
   * to chip in to that server too. Logged-in users already see the donate block
   * for their own server; this is specifically the anonymous freeloading case.
   */
  protected showSearchServerDonate = computed(
    () => this.auth.isAnonymous && this.searchServer.active(),
  );

  protected instance = signal<InstanceInfo | null>(null);

  /**
   * The host of the user's home server, inferred from their account (the part
   * after "@" in acct, when present), falling back to the instance the client
   * is pointed at, then to the connected server's self-reported domain.
   */
  protected homeHost = computed<string | null>(() => {
    const acct = this.auth.account()?.acct ?? '';
    const at = acct.indexOf('@');
    if (at > 0) {
      return acct.slice(at + 1);
    }
    const base = this.server.baseUrl();
    if (base) {
      return base.replace(/^https?:\/\//, '');
    }
    return this.instance()?.domain ?? null;
  });

  /** The user's server's /about page, where Mastodon instances put donation info. */
  protected donateServerUrl = computed<string>(() => {
    const host = this.homeHost();
    return host ? `https://${host}/about` : '/about';
  });

  /** In-app route that opens Mawkingbird anonymously on this instance. */
  protected anonymousShareUrl = computed<string>(() => {
    const host = this.homeHost();
    return host ? `/anonymous?${encodeURIComponent(host)}` : '/anonymous';
  });

  /**
   * The *absolute* shareable link, for copying and handing to someone else. The
   * relative route above navigates the current tab (which is not what "Share"
   * should do); this resolves it against the current origin so it's a link that
   * works when pasted elsewhere.
   */
  protected anonymousShareAbsoluteUrl = computed<string>(() => {
    const path = this.anonymousShareUrl();
    const origin = typeof location !== 'undefined' ? location.origin : '';
    return origin ? `${origin}${path}` : path;
  });

  /** Whether the "copy this server's share link" dialog is open. */
  protected shareOpen = signal(false);
  /** Copy feedback: 'copied' after success, 'failed' if the clipboard was denied. */
  protected copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  openShare(): void {
    this.copyState.set('idle');
    this.shareOpen.set(true);
  }

  closeShare(): void {
    this.shareOpen.set(false);
  }

  async copyShareUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.anonymousShareAbsoluteUrl());
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }
  }

  constructor() {
    // Runs on init and again when the user switches accounts or instances, so
    // the server-info block and donate link don't go stale mid-session.
    effect(() => {
      this.auth.account();
      this.server.baseUrl();
      // No Mastodon source, no Mastodon request. Reading the signal inside the
      // effect keeps this live: opting the connector in from Settings fills the
      // card in without a reload.
      if (this.usableMastodon()) {
        this.fetchInstance();
      }
    });
  }

  ngOnInit(): void {
    // Every call below is a Mastodon call, and a Bluesky-primary account that
    // never opted in must make none of them — the widgets they feed are hidden
    // for that account anyway, so the requests would be pure waste against a
    // server the user has no relationship with.
    // Symmetrically: no Bluesky source, no Bluesky request. The trends endpoints
    // are anonymous, so this is a policy choice rather than a technical one —
    // a rail widget nobody will see should not cost a request.
    if (this.usableBluesky()) {
      this.bskyTrends.ensure();
    }
    if (!this.usableMastodon()) {
      return;
    }
    // Shared with the banner above the timeline: whichever loads first pays for
    // the request, and `load()` is idempotent so both asking costs one call.
    this.announcements.load();
    if (this.justMyServer.enabled()) {
      this.justMyServer.checkList();
    }
    // The rail is on nearly every page, so it is the natural place to warm the
    // per-host feed answers. Cached for a day, so this is one request a day per
    // endpoint, not one per navigation.
    void this.feedCaps.ensure('trending-links');
    void this.feedCaps.ensure('trending-statuses');
  }

  private fetchInstance(): void {
    this.api.instanceInfo().subscribe({
      next: (info) => this.instance.set(info),
      error: () => {
        // Sidebar widget: fail silently.
      },
    });
  }
}
