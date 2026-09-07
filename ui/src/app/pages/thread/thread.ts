import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Terminology } from '../../terminology';
import { ClientPrefs } from '../../client-prefs';
import { Account, Status } from '../../models';
import { Compose } from '../../compose/compose';
import { StatusCard } from '../../status-card/status-card';
import { HumanTimePipe } from '../../human-time.pipe';
import { readerChain } from '../read/reader-document';
import { ThreadLoader } from '../read/thread-loader';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BskyReply } from '../../providers/bluesky/bluesky-reply';
import { StatusActions } from '../../providers/status-actions';
import { capabilitiesFor } from '../../providers/provider';
import { RssProvider } from '../../providers/rss/rss-provider';
import { TwitterApi } from '../../providers/twitter/twitter-api';
import { TwitterFeed } from '../../providers/twitter/twitter-feed';
import { nitterHost, toNitterUrl } from '../../providers/twitter/nitter';
import { Subscription } from 'rxjs';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { AnonymousBookmarks } from '../../providers/anonymous/anonymous-bookmarks';
import { ElizaService } from '../../eliza/eliza.service';
import { LocalPostStore } from '../../eliza/local-post-store';
import { LocalCompose } from '../../eliza/local-compose';
import { ReaderToolbar } from '../../reader-toolbar/reader-toolbar';
import { isElizaId } from '../../eliza/eliza-identity';

import { PageDiagnostics } from '../../page-diagnostics';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

// i18n pages.thread.loading: Loading…
// i18n pages.thread.reply.placeholder: Post your reply
// i18n pages.thread.reader.withCount: Thread reader ({{count}} {{posts}})
// i18n pages.thread.reader.reader: Thread reader
// i18n reader.open.thread: Thread reader
// i18n reader.open.longText: Long text reader
// i18n pages.thread.reader.conversation: Conversation
// i18n pages.thread.reader.comments: Comments
// i18n pages.thread.rss.return: ← Return to RSS reader
// i18n pages.thread.chat.continueTitle: Continue this conversation in chat
// i18n pages.thread.chat.open: Open in chat
// i18n pages.thread.chat.unavailableTitle: Chat is only available for a two-person thread (you and one other)
// i18n pages.thread.anonymous.contextUnavailable: This server did not make the surrounding conversation available anonymously. The post is still readable below.
// i18n pages.thread.anonymous.openOriginal: Open the original
// i18n pages.thread.twitter.repliesOnly: Replies only — Mawkingbird cannot post to Twitter.
// i18n pages.thread.twitter.readConversation: Read the full conversation on {{host}}
// i18n pages.thread.error.openOriginal: Open the original post
// i18n pages.thread.error.home: Go to your home feed
// i18n pages.thread.error.notFound: Status not found.
// i18n pages.thread.error.postNotOnServer: This post isn’t on the server you’re browsing. Post links only work on the server that hosts them.
// i18n pages.thread.error.loadPost: Could not load this post.
// i18n pages.thread.twitter.loadPost: Could not load this post.
// i18n pages.thread.twitter.loadReplies: Could not load replies.
@Component({
  selector: 'app-thread',
  imports: [
    StatusCard,
    Compose,
    BskyReply,
    HumanTimePipe,
    RouterLink,
    LocalCompose,
    ReaderToolbar,
    TranslocoPipe,
  ],
  templateUrl: './thread.html',
  styleUrl: './thread.css',
  providers: [ThreadLoader],
})
export class Thread implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  private bsky = inject(BlueskyApi);
  private bskySession = inject(BlueskySession);
  private rss = inject(RssProvider);
  private twitterApi = inject(TwitterApi);
  private twitterFeed = inject(TwitterFeed);
  private anonymousPublic = inject(AnonymousPublicApi);
  private anonymousBookmarks = inject(AnonymousBookmarks);
  private eliza = inject(ElizaService);
  private localPosts = inject(LocalPostStore);
  private actions = inject(StatusActions);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private log = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);
  private loadSub = new Subscription();

  protected readonly prefs = inject(ClientPrefs);
  protected words = inject(Terminology).words;

  /**
   * Resolving the id into a post and its conversation.
   *
   * Eight different things can hide behind a route id — a Mastodon status, a
   * Bluesky post, an RSS item, a tweet, a local practice post, a message
   * serialized into the URL, an anonymous public status — and each loads, pays
   * and fails differently. That branching used to live here, which was fine
   * while this page was the only thing that could open a status. The reader
   * page opens the same ids, so it moved to `pages/read/thread-loader.ts` and
   * both pages resolve through one copy of it.
   *
   * The signals below are aliases onto the loader's, not a second copy: the
   * template and this component's own logic keep reading `status()`,
   * `descendants()` and the rest exactly as before.
   */
  protected readonly loader = inject(ThreadLoader);

  protected status = this.loader.status;
  protected ancestors = this.loader.ancestors;
  protected descendants = this.loader.descendants;
  protected loading = this.loader.loading;
  protected loadError = this.loader.loadError;
  protected isAnonymousPublic = this.loader.isAnonymousPublic;
  protected isMessageStatus = this.loader.isMessageStatus;
  protected publicContextUnavailable = this.loader.publicContextUnavailable;
  protected publicOriginalUrl = this.loader.publicOriginalUrl;
  protected isRss = this.loader.isRss;
  protected rssFeedUrl = this.loader.rssFeedUrl;
  protected isTwitter = this.loader.isTwitter;
  protected twitterError = this.loader.twitterError;
  protected rssHasCommentFeed = this.loader.rssHasCommentFeed;
  protected rssCommentsUnavailable = this.loader.rssCommentsUnavailable;

  /**
   * The conversation on Nitter, when this is a Twitter thread.
   *
   * Ancestors are deliberately not fetched (one request per level, unknown
   * depth), so this is how a reader reaches the rest of the conversation — and
   * it is free, because it leaves the app.
   */
  /** The mirror's host, so the link names where it actually goes. */
  protected nitterLabel = nitterHost();

  protected nitterThreadUrl = computed(() => {
    const status = this.status();
    return this.isTwitter() && status ? toNitterUrl(status.url) : null;
  });

  /** The whole thread in display order. */
  private thread = this.loader.thread;

  /** The author chain reader mode renders (root post + same-author self-replies). */
  protected chain = computed<Status[]>(() => readerChain(this.thread(), this.currentId()));

  // ---- Article expansion -------------------------------------------------
  //
  // Moved out. Fetching and rendering a linked article is the reader's job, and
  // it lives in `pages/read/article-expansion.ts` where the RSS pane and the
  // reader page share one copy of it. This page links to the reader; it no
  // longer contains one. See sprint/kindle-1-page-and-shell.md.

  /**
   * Whether the focused post can be written to at all.
   *
   * Derived from {@link capabilitiesFor} rather than from a list of provider
   * flags. Reader mode previously chose its action row with
   * `isRss() || isAnonymousPublic()`, which is a denylist — so tweets, added
   * long afterwards, fell into the writable branch and offered Reply, Boost and
   * Favourite buttons for actions that cannot exist, plus a composer that would
   * have POSTed a `twitter:` id to the Mastodon API. Asking the capability
   * table means the next read-only provider is handled before it is written.
   */
  protected readOnlyPost = computed(() => {
    const post = this.status();
    if (!post) {
      return false;
    }
    if (this.isMessageStatus()) {
      return true;
    }
    const caps = capabilitiesFor(post.provider, this.canActOn(post.provider));
    return !caps.reply && !caps.favourite && !caps.reblog;
  });

  /**
   * Whether this session holds credentials for the network a post came from.
   *
   * Not one flag but a pairing, because "am I signed in?" stopped being a single
   * question once Bluesky could be the identity. A Bluesky-primary account can
   * act on a `bluesky` post and not on a `mastodon` one; a Mastodon account is
   * the mirror image; Anonymous can act on neither. Asking `!isAnonymous` gave a
   * Bluesky-primary reader Reply and Favourite buttons on Mastodon posts, wired
   * to an API it has no token for.
   */
  private canActOn(provider: Status['provider']): boolean {
    if (this.auth.isAnonymous) {
      return false;
    }
    if (this.auth.isBlueskyPrimary) {
      return provider === 'bluesky';
    }
    // Mastodon-primary: Bluesky posts are writable when the connector is linked,
    // which is what the capability table already assumes for a linked provider.
    return true;
  }

  /** Everything in the thread that is not part of the author chain: the comments. */
  protected comments = computed<Status[]>(() => {
    const chainIds = new Set(this.chain().map((s) => s.id));
    return this.thread().filter((s) => !chainIds.has(s.id));
  });

  /**
   * The single other participant when this thread is a 1:1 conversation —
   * exactly the current user and one other person across every post in the
   * thread. Null for a solo thread, or the moment a third voice appears.
   *
   * The chat tab has no multi-person UI yet, and we don't want to make it easy
   * to stumble into a 20-way "chat" that reads badly — so "open in chat" is only
   * offered (and enabled) when it maps cleanly onto a two-person DM. Bluesky/RSS/
   * anonymous threads don't participate: those don't have a Mastodon DM to open.
   */
  protected chatPartner = computed(() => {
    // Read-only posts have no Mastodon DM to open: there is no account on this
    // server to message. Asking readOnlyPost() rather than listing providers
    // means X was covered the moment it was added, instead of offering "Open in
    // chat" for an account that exists only on Twitter.
    if (this.isAnonymousPublic() || this.readOnlyPost()) {
      return null;
    }
    const me = this.auth.account();
    const posts = this.thread();
    if (!me || !posts.length) {
      return null;
    }
    // Bluesky posts route to a different DM system; if any post is bsky this
    // isn't a Mastodon 1:1 chat we can open here.
    if (posts.some((p) => this.isBluesky(p))) {
      return null;
    }
    const others = new Map<string, Account>();
    for (const p of posts) {
      const acc = p.account;
      if (acc.id !== me.id) {
        others.set(acc.id, acc);
      }
    }
    // Exactly one other voice → a clean two-person chat. Zero (a solo thread) or
    // two-plus (a group) both disqualify.
    return others.size === 1 ? [...others.values()][0] : null;
  });

  /** The conversations-tab key for a 1:1 chat, matching how public chats group
   *  by the other person (see notifications' `chatKey`). Null when not eligible. */
  protected chatKey = computed(() => {
    const partner = this.chatPartner();
    return partner ? `pub:${partner.acct}` : null;
  });

  /**
   * Query params for the "open in chat" link. `open` selects (or, on the chat
   * page, seeds) the 1:1 chat by its public key; `with` carries the partner's
   * account id so the chat page can fetch the full record and draft a fresh chat
   * even when no message history exists yet; `context` identifies the post the
   * user clicked, so the transcript never opens as an unexplained blank. Null
   * when not eligible.
   */
  protected chatQueryParams = computed<Record<string, string> | null>(() => {
    const partner = this.chatPartner();
    const key = this.chatKey();
    const context = this.status()?.id;
    return partner && key && context ? { open: key, with: partner.id, context } : null;
  });

  /** Patch a status wherever it lives (focused post, ancestors, or descendants). */
  patch(updated: Status): void {
    if (this.status()?.id === updated.id) {
      this.status.set(updated);
    }
    this.onContextChanged(updated);
  }

  // Favourite / boost / bookmark handlers used to live here, for reader mode's
  // own action row. Reader mode is a page now and does not have one — the
  // thread view's actions belong to `StatusCard`, which has always owned them.
  // See sprint/kindle-1-page-and-shell.md.

  /** Latest route id and `?reader` value. `currentId` is read by the Reader link. */
  protected readonly currentId = signal('');
  protected readonly threadReader = signal(false);
  private readerParam: string | null = null;
  /** True once a hand-off to the reader page is under way. See `applyReaderMode`. */
  private redirecting = false;

  ngOnInit(): void {
    // `?reader` is read first. Both streams emit synchronously on subscribe, and
    // `paramMap` used to be subscribed first — so a `?reader=1` arrival loaded
    // the whole thread (two requests, or a feed fetch) and *then* discovered it
    // was supposed to hand off to the reader. Reading the query parameter first
    // means the hand-off happens before anything is paid for.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.readerParam = params.get('reader');
      this.threadReader.set(this.readerParam === 'thread');
      this.applyReaderMode();
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        return;
      }
      this.currentId.set(id);
      // RSS items are articles, so they hand off unless the link opts out with
      // ?reader=0 — and that decision needs the id, which only arrives here.
      if (this.applyReaderMode()) {
        return;
      }
      this.load(id);
    });
  }

  /**
   * Reader mode is a page now: hand off to it rather than rendering it here.
   *
   * `?reader=1` used to flip a signal on this component. The reader has state
   * of its own (a library, a position, notes), and it could not live inside a
   * component whose job is rendering a conversation — see
   * `sprint/kindle-0-overview.md`. The query parameter keeps working; it just
   * means "go there" instead of "become that".
   *
   * `replaceUrl` matters. Without it the thread URL stays on the stack, so Back
   * from the reader lands on a page that immediately bounces forward again and
   * the reader is trapped.
   *
   * `redirecting` guards the bounce a different way: both `paramMap` and
   * `queryParamMap` call this, so an unguarded navigate here re-enters through
   * the second stream while the first is still settling.
   */
  private applyReaderMode(): boolean {
    if (this.readerParam === 'thread') return false;
    if (this.redirecting) {
      return true;
    }
    // Nothing to hand off until the id is known.
    if (!this.currentId()) {
      return false;
    }
    // RSS items are articles, so they default to reader ON unless the link
    // explicitly opts out with ?reader=0.
    const rssDefault = this.currentId().startsWith('rss:') && this.readerParam !== '0';
    if (this.readerParam !== '1' && !rssDefault) {
      return false;
    }
    this.redirecting = true;
    void this.router.navigate(['/read', this.currentId()], { replaceUrl: true });
    return true;
  }

  load(id: string): void {
    this.loader.load(id);
  }

  onReply(status: Status): void {
    // Local practice replies also draw an Eliza answer into the store, so
    // re-assemble the whole thread rather than only appending the viewer's line.
    const focused = this.status();
    if (focused && this.isLocal(focused)) {
      // `load` re-derives a local thread from the stores with no network, which
      // is exactly the re-assembly wanted here.
      this.loader.load(focused.id);
      return;
    }
    this.descendants.update((d) => [...d, status]);
  }

  onChanged(updated: Status): void {
    this.status.set(updated);
  }

  onContextChanged(updated: Status): void {
    const patch = (list: Status[]) => list.map((s) => (s.id === updated.id ? updated : s));
    this.ancestors.update(patch);
    this.descendants.update(patch);
  }

  onContextDeleted(removed: Status): void {
    const drop = (list: Status[]) => list.filter((s) => s.id !== removed.id);
    this.ancestors.update(drop);
    this.descendants.update(drop);
  }

  /** The focused status was deleted: leave the thread. */
  onFocusedDeleted(): void {
    this.router.navigateByUrl('/home');
  }

  protected isBluesky(post: Status): boolean {
    return post.provider === 'bluesky';
  }

  /** True for a browser-local practice post (Eliza's or the viewer's) — its reply
   *  box is the local composer, never the network one. */
  protected isLocal(post: Status): boolean {
    return isElizaId(post.id) || post.id.startsWith('local:');
  }
}
