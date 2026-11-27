import { StatusReplacement, replaceStatus } from '../../feeds/reconcile-status';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  output,
  signal,
  untracked,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Status } from '../../platform/api/models';
import { Streaming, StreamEvent } from '../../platform/api/streaming';
import { StatusCard } from '../../posts/status-card/status-card';
import { StatusVisibility } from '../../moderation/status-visibility';
import { normalizeHashtag } from '../../discovery/hashtag';
import { stripHtml } from '../../feeds/sentiment';
import { canonicalStatusKey } from '../../accounts/anonymous/anonymous-feed-corpus';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { AnonymousAccount } from '../../accounts/anonymous/anonymous-account';
import {
  PARTY_REFRESH_SECONDS,
  PartyMode,
  PartyRefresh,
  WatchPartyPrefs,
} from '../videos/watch-party-prefs';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbPopover } from '../../design-system/popover/popover';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { YoutubeFeeds } from '../videos/youtube-feeds';
import { YoutubeComment } from '../videos/youtube-details';
import { YoutubeComments } from './youtube-comments';

// i18n watch.party.toolbar: Watch party chat
// i18n watch.party.compact: Compact
// i18n watch.party.compactTitle: One line per message, like a chat room. Select a line to open the full post.
// i18n watch.party.modeLabel: Comments
// i18n watch.party.mode.both: Replies + hashtag
// i18n watch.party.mode.replies: Post replies
// i18n watch.party.mode.hashtag: Hashtag
// i18n watch.party.mode.youtube: YouTube
// i18n watch.party.refreshLabel: Updates
// i18n watch.party.refreshMode.stream: Live
// i18n watch.party.refreshMode.poll5: Every 5s
// i18n watch.party.refreshMode.poll15: Every 15s
// i18n watch.party.refreshMode.poll60: Every minute
// i18n watch.party.refreshMode.manual: Manual
// i18n watch.party.refreshMode.streamTitle: Live hashtag updates where your server streams them; replies and everything else are checked every 15 seconds.
// i18n watch.party.refresh: Refresh party
// i18n watch.party.refreshShort: Refresh
// i18n watch.party.add: Add hashtag to party
// i18n watch.party.addTag: Add hashtag
// i18n watch.party.dialog.title: Hashtag for this show
// i18n watch.party.dialog.cancel: Cancel
// i18n watch.party.dialog.join: Join
// i18n watch.party.tags: Hashtag for this show
// i18n watch.party.placeholder: Hashtag for this show
// i18n watch.party.temporary: Posts with these hashtags join the chat for this visit only. Nothing is followed or saved.
// i18n watch.party.remove: Remove #{{tag}} from party
// i18n watch.party.invalid: Use valid hashtags, with up to eight different tags per party.
// i18n watch.party.failed: Couldn't load: {{tags}}. Refresh to try again.
// i18n watch.party.more: Load earlier messages
// i18n watch.party.empty: No messages yet.
// i18n watch.party.emptyHashtag: Add a hashtag for this show to see the chat.
// i18n watch.party.loading: Loading party posts…
// i18n watch.party.chattersLabel: 👥 {{count}} chatting
// i18n watch.party.chattersEmpty: No one has posted yet.
// i18n watch.party.active: active
// i18n watch.party.highlight: Highlight messages from {{nick}}
// i18n watch.party.newMessages: {{count}} new messages ↓
// i18n watch.party.media: [media]
// i18n watch.party.filtered: [filtered]
// i18n watch.party.cw: CW: {{text}}
// i18n watch.party.chatLabel: Chat message
// i18n watch.party.chatPlaceholderTag: Chat in #{{tag}}
// i18n watch.party.chatPlaceholderReply: Reply to the video post
// i18n watch.party.send: Send
// i18n watch.party.sendFailed: Couldn't send. Your message is still in the box.
// i18n watch.party.signInToChat: Sign in with Mastodon to chat here.
// i18n watch.party.needTarget: Add a hashtag to chat.
// i18n watch.party.chatPlaceholderStart: Share the video and start the chat
// i18n watch.party.startNote: Your first message is shared as a public post with the video link. Everything after that replies to it.

/** A chat message as the compact view shows it. */
interface ChatLine {
  key: string;
  status: Status;
  context: 'thread' | 'public';
  time: string;
  nick: string;
  account: string;
  hue: number;
  text: string;
  cw: string;
  media: boolean;
  filtered: boolean;
}

/** Active means posted within this window, the way a channel's user count feels. */
const ACTIVE_MS = 10 * 60 * 1000;
/** Pixels from the bottom that still count as "following" the chat. */
const STICK_PX = 32;

function hue(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

@Component({
  selector: 'app-party-conversation',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    StatusCard,
    MbButton,
    MbField,
    MbControl,
    MbDialog,
    MbPopover,
    MbToolbar,
    MbToolbarButton,
    YoutubeComments,
  ],
  templateUrl: './party-conversation.html',
  styleUrl: './party-conversation.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '[attr.data-view]': 'prefs.view()' },
})
export class PartyConversation implements OnDestroy {
  readonly comments = input<Status[]>([]);
  readonly root = input<Status | null>(null);
  readonly session = input.required<string>();
  /**
   * Tags to join as each session starts — a party opened from the finder
   * (`/watch?…&tags=a,b`). Still visit-only, like tags added by hand: nothing
   * is followed or saved. Invalid ones are skipped rather than reported, since
   * the reader did not type them.
   */
  readonly initialTags = input<readonly string[]>([]);
  /** Where signing in to chat comes back to: this video, as a path with its query. */
  readonly signInNext = input('/home');
  /** Whether the chat box may reply to {@link root} (a post on the signed-in server). */
  readonly canReply = input(false);
  /**
   * The video's address, when there is no post to reply to (a YouTube video
   * from RSS or a subscription). The first message shares it as a public post,
   * which then roots the chat, so nothing lands in a home feed without context.
   */
  readonly shareLink = input<string | null>(null);
  /** The share post a first message made: the page makes it the {@link root}. */
  readonly started = output<Status>();
  /** The YouTube video being watched, for the read-only YouTube comments mode (Native). */
  readonly youtubeVideoId = input<string | null>(null);
  /** A YouTube comment the reader wants to quote in a post. */
  readonly quoted = output<YoutubeComment>();
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
  readonly replaced = output<StatusReplacement>();
  /** Asks the page to re-read the root's replies; there is no stream for them. */
  readonly repliesDue = output<void>();
  protected prefs = inject(WatchPartyPrefs);
  private api = inject(Api);
  private auth = inject(Auth);
  private youtube = inject(YoutubeFeeds);
  private streaming = inject(Streaming);
  private publicApi = inject(AnonymousPublicApi);
  private anonymous = inject(AnonymousAccount);
  private visibility = inject(StatusVisibility);
  private injector = inject(Injector);
  protected draft = signal('');
  protected tags = signal<string[]>([]);
  protected validation = signal(false);
  protected failed = signal<string[]>([]);
  protected busy = signal<string[]>([]);
  protected tagDialog = signal(false);
  /** The mode to return to when the hashtag dialog is cancelled. */
  private modeBeforeDialog: PartyMode | null = null;
  /** The reader's choice for this visit; `null` follows {@link autoMode}. */
  protected chosen = signal<PartyMode | null>(null);
  protected expanded = signal<Set<string>>(new Set());
  protected highlight = signal<string | null>(null);
  protected chat = signal('');
  protected sending = signal(false);
  protected sendFailed = signal(false);
  protected unseen = signal(0);
  private following = true;
  private newest = 0;
  private now = signal(Date.now());
  private pages = signal<Record<string, Status[]>>({});
  private removed = signal<Set<string>>(new Set());
  private cursors = new Map<string, string>();
  private exhausted = signal<Set<string>>(new Set());
  private requests = new Map<string, Subscription>();
  private streams = new Map<string, Subscription>();
  private send$?: Subscription;
  private timer?: ReturnType<typeof setInterval>;
  private ticks = 0;
  private log = viewChild<ElementRef<HTMLElement>>('log');

  /**
   * How Watch was opened picks the conversation (owner, 2026-11-17): from a
   * post, its replies; from a party (tags supplied), replies and the hashtag;
   * a bare video, the hashtag. The toolbar switches for this visit only.
   */
  protected autoMode = computed<PartyMode>(() =>
    this.root() ? (this.initialTags().length ? 'both' : 'replies') : 'hashtag',
  );
  /** The modes this video can offer: replies need a post, YouTube needs Native. */
  protected modes = computed<PartyMode[]>(() => [
    ...(this.root() ? (['replies'] as const) : []),
    'hashtag',
    ...(this.root() ? (['both'] as const) : []),
    ...(this.youtubeVideoId() && this.youtube.canReadDetails() ? (['youtube'] as const) : []),
  ]);
  protected mode = computed<PartyMode>(() => {
    const chosen = this.chosen();
    return chosen && this.modes().includes(chosen) ? chosen : this.autoMode();
  });
  /** Whether the hashtag posts / the post's replies are part of the current mode. */
  protected showsTags = computed(() => this.mode() === 'hashtag' || this.mode() === 'both');
  protected showsReplies = computed(() => this.mode() === 'replies' || this.mode() === 'both');
  protected canStream = computed(() => this.auth.kind() === 'mastodon');
  protected hasMore = computed(
    () => this.showsTags() && this.tags().some((tag) => !this.exhausted().has(tag)),
  );
  protected mixed = computed(() => {
    const root = this.root();
    const rootKey = root ? canonicalStatusKey(root) : '';
    const mode = this.mode();
    if (mode === 'youtube') return [];
    const replies = new Set(this.comments().map(canonicalStatusKey));
    const tagged = Object.values(this.pages()).flat();
    const tagKeys = new Set(tagged.map(canonicalStatusKey));
    const items = new Map<string, Status>();
    for (const status of [...tagged, ...this.comments()]) {
      const key = canonicalStatusKey(status);
      if (key === rootKey || this.removed().has(key)) continue;
      if (mode === 'replies' && !replies.has(key)) continue;
      if (mode === 'hashtag' && !tagKeys.has(key)) continue;
      const held = items.get(key);
      if (
        !held ||
        Date.parse(status.edited_at || status.created_at) >=
          Date.parse(held.edited_at || held.created_at)
      )
        items.set(key, status);
    }
    return [...items]
      .map(([key, status]) => ({
        key,
        status,
        context: replies.has(key) ? ('thread' as const) : ('public' as const),
      }))
      .filter((item) => !this.visibility.rendersNothing(item.status, item.context))
      .sort(
        (a, b) =>
          Date.parse(a.status.created_at) - Date.parse(b.status.created_at) ||
          a.key.localeCompare(b.key),
      );
  });
  protected lines = computed<ChatLine[]>(() =>
    this.mixed().map(({ key, status, context }) => {
      const post = status.reblog ?? status;
      const account = post.account?.acct ?? post.account?.username ?? '';
      const date = new Date(post.created_at);
      return {
        key,
        status,
        context,
        time: Number.isNaN(date.getTime())
          ? ''
          : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        nick: post.account?.username || account.split('@')[0] || '?',
        account,
        hue: hue(account),
        text: stripHtml(post.content ?? ''),
        cw: post.spoiler_text ?? '',
        media: (post.media_attachments?.length ?? 0) > 0,
        filtered: this.visibility
          .activeFilters(status, context)
          .some((filter) => filter.filter.filter_action === 'warn'),
      };
    }),
  );
  /** Everyone in the chat, most recently heard from first. */
  protected chatters = computed(() => {
    const now = this.now();
    const people = new Map<string, { nick: string; account: string; hue: number; last: number }>();
    for (const line of this.lines()) {
      const at = Date.parse(line.status.created_at);
      const held = people.get(line.account);
      if (!held || at > held.last)
        people.set(line.account, {
          nick: line.nick,
          account: line.account,
          hue: line.hue,
          last: at,
        });
    }
    return [...people.values()]
      .map((person) => ({ ...person, active: now - person.last < ACTIVE_MS }))
      .sort((a, b) => b.last - a.last);
  });
  protected activeChatters = computed(
    () => this.chatters().filter((person) => person.active).length,
  );
  /** Where the chat box posts: the first party tag and/or a reply to the video post. */
  protected chatTag = computed(() => (this.showsTags() ? (this.tags()[0] ?? null) : null));
  protected chatReplies = computed(() => this.showsReplies() && this.canReply() && !!this.root());
  /** No post yet but a video to share: the next message starts the party. */
  protected startsParty = computed(() => !this.root() && !!this.shareLink());
  protected canPost = computed(() => this.auth.kind() === 'mastodon' && !this.auth.isAnonymous);

  /** `add` keeps the login page open for someone signed in to another network. */
  protected signInParams = computed(() => ({
    next: this.signInNext(),
    ...(this.auth.kind() === 'anonymous' ? {} : { add: 1 }),
  }));

  /** The login page sends a live anonymous session straight on, so leave it first. */
  protected leaveAnonymous(): void {
    this.auth.exitAnonymous();
  }

  constructor() {
    effect(() => {
      this.session();
      this.clear();
      untracked(() =>
        this.initialTags()
          .filter((tag) => normalizeHashtag(tag))
          .slice(0, 8)
          .forEach((tag) => this.addTag(tag)),
      );
    });
    // Streams follow the refresh choice: only Live opens them.
    effect(() => {
      const live = this.prefs.refresh() === 'stream' && this.canStream();
      untracked(() => {
        if (!live) {
          this.streams.forEach((sub) => sub.unsubscribe());
          this.streams.clear();
        } else this.tags().forEach((tag) => this.openStream(tag));
      });
    });
    effect((onCleanup) => {
      const seconds = PARTY_REFRESH_SECONDS[this.prefs.refresh()];
      if (!seconds) return;
      const timer = setInterval(() => this.tick(), seconds * 1000);
      this.timer = timer;
      onCleanup(() => clearInterval(timer));
    });
    // Follow the chat like a live channel: new messages scroll into view
    // unless the reader has scrolled up, when they are counted instead.
    effect(() => {
      const items = this.mixed();
      const latest = items.reduce(
        (max, item) => Math.max(max, Date.parse(item.status.created_at) || 0),
        0,
      );
      untracked(() => {
        const fresh = this.newest
          ? items.filter((item) => Date.parse(item.status.created_at) > this.newest).length
          : 0;
        this.newest = Math.max(this.newest, latest);
        if (this.following) this.scrollToEnd();
        else if (fresh) this.unseen.update((count) => count + fresh);
      });
    });
  }

  addTag(raw: string): void {
    const tag = normalizeHashtag(raw);
    if (
      !tag ||
      (this.tags().length >= 8 &&
        !this.tags().some((item) => item.toLowerCase() === tag.toLowerCase()))
    ) {
      this.validation.set(true);
      return;
    }
    this.validation.set(false);
    if (this.tags().some((item) => item.toLowerCase() === tag.toLowerCase())) return;
    this.tags.update((tags) => [...tags, tag]);
    // A tag joined while tags are not shown (replies, YouTube) would otherwise vanish.
    if (!this.showsTags()) this.chosen.set(this.root() ? 'both' : 'hashtag');
    this.load(tag);
    if (this.prefs.refresh() === 'stream' && this.canStream()) this.openStream(tag);
  }
  private openStream(tag: string): void {
    if (this.streams.has(tag)) return;
    this.streams.set(
      tag,
      this.streaming.open({ stream: 'hashtag', tag }).subscribe({
        next: (event) => this.event(tag, event),
        error: () => {
          // Polling takes over this tag; Refresh remains available.
          this.streams.delete(tag);
        },
      }),
    );
  }
  /** Tags typed into the hashtag dialog. True when they were all joined. */
  protected addInput(): boolean {
    const raw = this.draft()
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!raw.length || raw.some((tag) => !normalizeHashtag(tag))) {
      this.validation.set(true);
      return false;
    }
    const unique = new Set(
      [...this.tags(), ...raw.map((tag) => normalizeHashtag(tag)!)].map((tag) => tag.toLowerCase()),
    );
    if (unique.size > 8) {
      this.validation.set(true);
      return false;
    }
    raw.forEach((tag) => this.addTag(tag));
    this.draft.set('');
    return true;
  }
  protected openTagDialog(): void {
    this.validation.set(false);
    this.tagDialog.set(true);
  }
  protected joinFromDialog(): void {
    if (!this.addInput()) return;
    // A tag joined while it is not shown would otherwise vanish.
    if (!this.showsTags()) this.chosen.set(this.root() ? 'both' : 'hashtag');
    this.modeBeforeDialog = null;
    this.tagDialog.set(false);
  }
  protected cancelTagDialog(): void {
    this.tagDialog.set(false);
    this.draft.set('');
    this.validation.set(false);
    // Hashtag mode with no hashtag shows nothing; go back to what worked.
    if (this.modeBeforeDialog && !this.tags().length) this.chosen.set(this.modeBeforeDialog);
    this.modeBeforeDialog = null;
  }
  protected setMode(mode: PartyMode): void {
    const previous = this.mode();
    this.chosen.set(mode);
    if (mode === 'hashtag' && !this.tags().length) {
      this.modeBeforeDialog = previous === 'hashtag' ? 'both' : previous;
      this.openTagDialog();
    }
    if (mode !== 'youtube') this.jumpToEnd();
  }
  protected setRefresh(refresh: PartyRefresh): void {
    this.prefs.setRefresh(refresh);
  }
  protected toggleView(): void {
    this.prefs.setView(this.prefs.view() === 'compact' ? 'cards' : 'compact');
    this.jumpToEnd();
  }
  protected toggleLine(key: string): void {
    this.expanded.update((keys) => {
      const next = new Set(keys);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }
  protected toggleHighlight(account: string): void {
    this.highlight.update((current) => (current === account ? null : account));
  }
  protected removeTag(tag: string): void {
    this.requests.get(tag)?.unsubscribe();
    this.requests.delete(tag);
    this.streams.get(tag)?.unsubscribe();
    this.streams.delete(tag);
    this.tags.update((tags) => tags.filter((item) => item !== tag));
    this.busy.update((tags) => tags.filter((item) => item !== tag));
    this.failed.update((tags) => tags.filter((item) => item !== tag));
    this.pages.update((pages) => {
      const next = { ...pages };
      delete next[tag];
      return next;
    });
    this.cursors.delete(tag);
    this.exhausted.update((tags) => {
      const next = new Set(tags);
      next.delete(tag);
      return next;
    });
  }
  /** Fetch everything the current mode shows, now. */
  protected refresh(): void {
    this.now.set(Date.now());
    if (this.showsReplies()) this.repliesDue.emit();
    if (this.showsTags()) this.tags().forEach((tag) => this.load(tag));
  }
  /**
   * One beat of the refresh timer. A tag with a live stream is only re-read
   * every fourth beat, as a backstop for events the stream dropped.
   */
  private tick(): void {
    this.now.set(Date.now());
    if (typeof document !== 'undefined' && document.hidden) return;
    this.ticks++;
    // YouTube comments are never polled: they load when asked for.
    if (this.showsReplies()) this.repliesDue.emit();
    if (this.showsTags())
      this.tags()
        .filter((tag) => !this.streams.has(tag) || this.ticks % 4 === 0)
        .forEach((tag) => this.load(tag));
  }
  protected more(): void {
    this.tags()
      .filter((tag) => !this.exhausted().has(tag))
      .forEach((tag) => this.load(tag, true));
  }
  protected send(): void {
    const text = this.chat().trim();
    const tag = this.chatTag();
    const reply = this.chatReplies() ? this.root() : null;
    const start = !reply && this.startsParty() ? this.shareLink() : null;
    if (!text || this.sending() || !this.canPost() || (!tag && !reply && !start)) return;
    const mentioned = this.tags().some((item) =>
      new RegExp(`(^|\\s)#${item}(?![\\p{L}\\p{N}_])`, 'iu').test(text),
    );
    // A reply has its context in the post it answers, so it skips the tag and
    // stays unlisted: out of public and hashtag timelines (owner, 2026-11-27).
    const tagged = !reply && tag && !mentioned ? ` #${tag}` : '';
    const body = start ? `${text}\n\n${start}${tagged}` : `${text}${tagged}`;
    this.sending.set(true);
    this.sendFailed.set(false);
    this.send$ = this.api
      .postStatus(
        body,
        {
          ...(reply ? { inReplyToId: reply.id } : {}),
          // A hashtag only reaches the party's tag timelines when public; the
          // share post is what others find the party by.
          ...(reply ? { visibility: 'unlisted' } : tag || start ? { visibility: 'public' } : {}),
        },
        `watch-party:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      )
      .subscribe({
        next: (status) => {
          this.sending.set(false);
          this.chat.set('');
          this.following = true;
          if (reply) this.replied.emit(status);
          if (start) {
            this.started.emit(status);
            // Keep the hashtag chat in view beside the new post's replies.
            this.chosen.set(this.tags().length ? 'both' : 'replies');
          }
          if (tag && !reply)
            this.pages.update((pages) => ({ ...pages, [tag]: [status, ...(pages[tag] ?? [])] }));
        },
        error: () => {
          this.sending.set(false);
          this.sendFailed.set(true);
        },
      });
  }
  protected onScroll(): void {
    const log = this.log()?.nativeElement;
    if (!log) return;
    this.following = log.scrollHeight - log.scrollTop - log.clientHeight <= STICK_PX;
    if (this.following) this.unseen.set(0);
  }
  protected jumpToEnd(): void {
    this.following = true;
    this.unseen.set(0);
    this.scrollToEnd();
  }
  private scrollToEnd(): void {
    afterNextRender(
      () => {
        const log = this.log()?.nativeElement;
        if (log) log.scrollTop = log.scrollHeight;
      },
      { injector: this.injector },
    );
  }
  private load(tag: string, older = false): void {
    if (this.busy().includes(tag)) return;
    this.busy.update((tags) => [...tags, tag]);
    const cursor = older ? this.cursors.get(tag) : undefined;
    const request = this.auth.isAnonymous
      ? this.publicApi.getTagTimeline(this.anonymous.server(), tag, cursor)
      : this.api.tagTimeline(tag, cursor, 20);
    const sub = request.subscribe({
      next: (statuses) => {
        this.pages.update((pages) => {
          const merged = new Map(
            (pages[tag] ?? []).map((status) => [canonicalStatusKey(status), status]),
          );
          statuses.forEach((status) => merged.set(canonicalStatusKey(status), status));
          return {
            ...pages,
            [tag]: [...merged.values()]
              .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
              .slice(0, 200),
          };
        });
        if (older || !this.cursors.has(tag)) {
          const last = statuses.at(-1);
          if (last) this.cursors.set(tag, this.nativeId(last));
          this.exhausted.update((tags) => {
            const next = new Set(tags);
            if (statuses.length < 20 || (this.pages()[tag]?.length ?? 0) >= 200) next.add(tag);
            else next.delete(tag);
            return next;
          });
        }
        this.failed.update((tags) => tags.filter((item) => item !== tag));
        this.busy.update((tags) => tags.filter((item) => item !== tag));
      },
      error: () => {
        this.failed.update((tags) => [...new Set([...tags, tag])]);
        this.busy.update((tags) => tags.filter((item) => item !== tag));
      },
    });
    this.requests.set(tag, sub);
  }
  private nativeId(status: Status): string {
    return (status.providerRef as { statusId?: string } | undefined)?.statusId ?? status.id;
  }
  private event(tag: string, event: StreamEvent): void {
    if (event.event === 'delete') {
      const id = String(event.payload);
      for (const status of [...this.comments(), ...Object.values(this.pages()).flat()])
        if (this.nativeId(status) === id) this.erase(status);
      return;
    }
    if (event.event !== 'update' && event.event !== 'status.update') return;
    const status = event.payload as Status;
    if (!status?.id || !status.account || !Array.isArray(status.media_attachments)) return;
    this.pages.update((pages) => ({
      ...pages,
      [tag]: [
        status,
        ...(pages[tag] ?? []).filter(
          (item) => canonicalStatusKey(item) !== canonicalStatusKey(status),
        ),
      ].slice(0, 200),
    }));
  }
  protected update(status: Status): void {
    this.pages.update((pages) =>
      Object.fromEntries(
        Object.entries(pages).map(([tag, posts]) => [
          tag,
          posts.map((item) =>
            canonicalStatusKey(item) === canonicalStatusKey(status) ? status : item,
          ),
        ]),
      ),
    );
  }
  protected swap(change: StatusReplacement): void {
    this.pages.update((pages) =>
      Object.fromEntries(
        Object.entries(pages).map(([tag, posts]) => [tag, replaceStatus(posts, change)]),
      ),
    );
  }
  protected erase(status: Status): void {
    this.removed.update((items) => new Set([...items, canonicalStatusKey(status)]));
  }
  private clear(): void {
    this.requests.forEach((sub) => sub.unsubscribe());
    this.requests.clear();
    this.streams.forEach((sub) => sub.unsubscribe());
    this.streams.clear();
    this.send$?.unsubscribe();
    this.sending.set(false);
    this.sendFailed.set(false);
    this.tags.set([]);
    this.pages.set({});
    this.busy.set([]);
    this.failed.set([]);
    this.removed.set(new Set());
    this.exhausted.set(new Set());
    this.expanded.set(new Set());
    this.highlight.set(null);
    this.cursors.clear();
    this.draft.set('');
    this.validation.set(false);
    this.unseen.set(0);
    this.chosen.set(null);
    this.following = true;
    this.newest = 0;
  }
  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.clear();
  }
}
