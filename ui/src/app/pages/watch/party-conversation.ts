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
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { Streaming, StreamEvent } from '../../streaming';
import { StatusCard } from '../../status-card/status-card';
import { StatusVisibility } from '../../status-visibility';
import { normalizeHashtag } from '../../hashtag';
import { stripHtml } from '../../sentiment';
import { canonicalStatusKey } from '../../providers/anonymous/anonymous-feed-corpus';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import {
  PARTY_REFRESH_SECONDS,
  PartyMode,
  PartyRefresh,
  WatchPartyPrefs,
} from '../../providers/videos/watch-party-prefs';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbPopover } from '../../design-system/popover/popover';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';

// i18n watch.party.toolbar: Watch party chat
// i18n watch.party.compact: Compact
// i18n watch.party.compactTitle: One line per message, like a chat room. Select a line to open the full post.
// i18n watch.party.modeLabel: Show
// i18n watch.party.mode.both: Replies + hashtag
// i18n watch.party.mode.replies: Post replies
// i18n watch.party.mode.hashtag: Hashtag
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
    TranslocoPipe,
    StatusCard,
    MbButton,
    MbField,
    MbControl,
    MbDialog,
    MbPopover,
    MbToolbar,
    MbToolbarButton,
  ],
  templateUrl: './party-conversation.html',
  styleUrl: './party-conversation.css',
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
  /** Whether the chat box may reply to {@link root} (a post on the signed-in server). */
  readonly canReply = input(false);
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
  /** Asks the page to re-read the root's replies; there is no stream for them. */
  readonly repliesDue = output<void>();
  protected prefs = inject(WatchPartyPrefs);
  private api = inject(Api);
  private auth = inject(Auth);
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

  /** Without a video post there are no replies; the chat is the hashtag. */
  protected mode = computed<PartyMode>(() => (this.root() ? this.prefs.mode() : 'hashtag'));
  protected canStream = computed(() => this.auth.kind() === 'mastodon');
  protected hasMore = computed(
    () => this.mode() !== 'replies' && this.tags().some((tag) => !this.exhausted().has(tag)),
  );
  protected mixed = computed(() => {
    const root = this.root();
    const rootKey = root ? canonicalStatusKey(root) : '';
    const mode = this.mode();
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
  protected chatTag = computed(() => (this.mode() !== 'replies' ? (this.tags()[0] ?? null) : null));
  protected chatReplies = computed(
    () => this.mode() !== 'hashtag' && this.canReply() && !!this.root(),
  );
  protected canPost = computed(() => this.auth.kind() === 'mastodon' && !this.auth.isAnonymous);

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
    // A tag joined while only replies are shown would otherwise vanish.
    if (this.prefs.mode() === 'replies') this.prefs.setMode('both');
    this.modeBeforeDialog = null;
    this.tagDialog.set(false);
  }
  protected cancelTagDialog(): void {
    this.tagDialog.set(false);
    this.draft.set('');
    this.validation.set(false);
    // Hashtag mode with no hashtag shows nothing; go back to what worked.
    if (this.modeBeforeDialog && !this.tags().length) this.prefs.setMode(this.modeBeforeDialog);
    this.modeBeforeDialog = null;
  }
  protected setMode(mode: PartyMode): void {
    const previous = this.prefs.mode();
    this.prefs.setMode(mode);
    if (mode === 'hashtag' && !this.tags().length) {
      this.modeBeforeDialog = previous === 'hashtag' ? 'both' : previous;
      this.openTagDialog();
    }
    this.jumpToEnd();
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
    const mode = this.mode();
    if (mode !== 'hashtag') this.repliesDue.emit();
    if (mode !== 'replies') this.tags().forEach((tag) => this.load(tag));
  }
  /**
   * One beat of the refresh timer. A tag with a live stream is only re-read
   * every fourth beat, as a backstop for events the stream dropped.
   */
  private tick(): void {
    this.now.set(Date.now());
    if (typeof document !== 'undefined' && document.hidden) return;
    this.ticks++;
    const mode = this.mode();
    if (mode !== 'hashtag') this.repliesDue.emit();
    if (mode !== 'replies')
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
    if (!text || this.sending() || !this.canPost() || (!tag && !reply)) return;
    const mentioned = this.tags().some((item) =>
      new RegExp(`(^|\\s)#${item}(?![\\p{L}\\p{N}_])`, 'iu').test(text),
    );
    const body = tag && !mentioned ? `${text} #${tag}` : text;
    this.sending.set(true);
    this.sendFailed.set(false);
    this.send$ = this.api
      .postStatus(
        body,
        {
          ...(reply ? { inReplyToId: reply.id } : {}),
          // A hashtag only reaches the party's tag timelines when public.
          ...(tag ? { visibility: 'public' } : {}),
        },
        `watch-party:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      )
      .subscribe({
        next: (status) => {
          this.sending.set(false);
          this.chat.set('');
          this.following = true;
          if (reply) this.replied.emit(status);
          if (tag)
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
    this.following = true;
    this.newest = 0;
  }
  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.clear();
  }
}
