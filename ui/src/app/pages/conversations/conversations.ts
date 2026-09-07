import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { Compose } from '../../compose/compose';
import { HumanTimePipe } from '../../human-time.pipe';
import { ReportDialog } from '../../report-dialog/report-dialog';
import { Streaming } from '../../streaming';
import { Account, Conversation, MastodonNotification, Relationship, Status } from '../../models';
import { AiAvailability } from '../../ai-availability';
import { BotPeers } from '../../chat/bot-peers';
import {
  Conversation as StoredConversation,
  ConversationMessage,
  ConversationStore,
} from '../../chat/conversation-store';
import { LlmConversation } from '../../chat/llm-conversation';
import { ElizaService } from '../../eliza/eliza.service';
import { BlueskyChatApi, isChatScopeError } from '../../providers/bluesky/bluesky-chat-api';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import {
  BskyChatMember,
  BskyConvoView,
  BskyMessageView,
} from '../../providers/bluesky/bluesky-types';
import { Terminology } from '../../terminology';
import { TranslocoPipe } from '@jsverse/transloco';

/** localStorage map of chat key → ISO timestamp of the newest message seen there. */
const READ_KEY = 'mockingbird_chat_read';

/**
 * One row in the chat list. Private chats wrap a Mastodon conversation. Public
 * chats are synthesized client-side from mention notifications, grouped by the
 * reply guy (status author): tracing reply graphs to identify "the same thread"
 * is deliberately avoided, so all public mentions from steve read as one IM
 * history with steve, separate from any private chat with him.
 */
export interface Chat {
  key: string;
  /**
   * `bot` is a browser-local correspondent — Eliza or a language model through
   * OpenRouter. Unlike the other three it involves no Mastodon or Bluesky API
   * at all, which is what lets an anonymous visitor use this page.
   */
  kind: 'private' | 'public' | 'bsky' | 'bot';
  /** Ids of the merged conversations (private chats only; used for mark-read). */
  convIds: string[];
  /** Participants we hold full Account records for (avatars, moderation menu). */
  accounts: Account[];
  /** Every other participant's handle, including mention-only ones. */
  handles: string[];
  lastStatus: Status | null;
  unread: boolean;
  /** Bluesky chats only: the convo id and the other participants. */
  convoId?: string;
  members?: BskyChatMember[];
  /** Bluesky chats only: plain-text preview + timestamp (no Status to lean on). */
  previewText?: string;
  lastAt?: string;
}

function readMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** Leading `@user` / `@user@domain` runs (with separating spaces/commas). */
const LEADING_MENTIONS = /^(?:[\s,]*@[\w.-]+(?:@[\w.-]+)?)+[\s,:]*/;

/**
 * Drop the `@a @b …` prelude that starts almost every reply, so chat rows and
 * bubbles lead with the actual message. Handles both Mastodon's h-card markup
 * and plain-text mentions. Falls back to the original when nothing but
 * mentions remain (an empty bubble is worse than a noisy one).
 */
export function stripLeadingMentions(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = doc.body.querySelector('p') ?? doc.body;
  let node: ChildNode | null = container.firstChild;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const stripped = (node.textContent ?? '').replace(LEADING_MENTIONS, '');
      if (!stripped.trim()) {
        const next = node.nextSibling;
        node.remove();
        node = next;
        continue;
      }
      node.textContent = stripped.replace(/^\s+/, '');
      break;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('h-card') || el.classList.contains('mention')) {
        const next = node.nextSibling;
        el.remove();
        node = next;
        continue;
      }
      break;
    }
    node = node.nextSibling;
  }
  const out = doc.body.innerHTML.trim();
  return out && out !== '<p></p>' ? out : html;
}

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n pages.conversations.close: Close
// i18n pages.conversations.chats: Chats
// i18n pages.conversations.chatListHeading: Chat
// i18n pages.conversations.filters.whoAriaLabel: Who
// i18n pages.conversations.filters.allTitle: Everyone you talk to on Bluesky and the fediverse (bots have their own tab)
// i18n pages.conversations.filters.all: All
// i18n pages.conversations.filters.mutualsTitle: People you follow who follow you back
// i18n pages.conversations.filters.mutuals: Mutuals
// i18n pages.conversations.filters.botTitle: Eliza and your language model
// i18n pages.conversations.filters.bot: Bot
// i18n pages.conversations.filters.kindAriaLabel: Kind
// i18n pages.conversations.filters.privateTitle: Private DMs
// i18n pages.conversations.badge.private: 🔒 Private
// i18n pages.conversations.filters.publicTitle: Public reply threads
// i18n pages.conversations.badge.public: 📢 Public
// i18n pages.conversations.filters.bskyTitle: Bluesky DMs
// i18n pages.conversations.badge.bluesky: 🦋 Bluesky
// i18n pages.conversations.bskyScopeHint.a: 🦋 Your Bluesky app password can't read DMs. Create a new app password at bsky.app with "Allow access to your direct messages" checked, then relink in
// i18n pages.conversations.bskyScopeHint.link: Settings → Connections → Bluesky
// i18n pages.conversations.loading: Loading…
// i18n pages.conversations.emptyChats: No conversations yet. Post with visibility "direct", or reply to a mention.
// i18n pages.conversations.noMatch: No chats match the filters.
// i18n pages.conversations.unreadTitle: Unread
// i18n pages.conversations.badge.publicUpper: 📢 PUBLIC
// i18n pages.conversations.badge.bot: 🤖 This browser
// i18n pages.conversations.noOlderMessages: No older messages.
// i18n pages.conversations.loadMoreTitle: Load older mentions into your public chats
// i18n pages.conversations.loadMore: Load more
// i18n pages.conversations.actionsAriaLabel: Conversation actions
// i18n pages.conversations.mute: Mute
// i18n pages.conversations.block: Block
// i18n pages.conversations.report: Report
// i18n pages.conversations.publicBanner.title: THIS CONVERSATION IS PUBLIC.
// i18n pages.conversations.publicBanner.body: Every message here is visible to anyone on the internet — this is a reply thread, not a private DM.
// i18n pages.conversations.bot.pickerAriaLabel: Conversation
// i18n pages.conversations.bot.allConversations: All conversations
// i18n pages.conversations.bot.newConversation: + New conversation
// i18n pages.conversations.bot.everyConversationWith: Every conversation with {{name}}, oldest first. Sending a message continues the most recent one.
// i18n pages.conversations.bot.elizaNoMemory: Eliza remembers nothing between messages, so starting a new conversation clears this one rather than saving it.
// i18n pages.conversations.loadingThread: Loading thread…
// i18n pages.conversations.bot.cutOff: ⚠ Cut off — the reply was still arriving.
// i18n pages.conversations.bot.answering: Answering… you can leave this page; the reply keeps arriving.
// i18n pages.conversations.bot.stopGenerating: Stop
// i18n pages.conversations.bot.nothingYet: Nothing here yet. Say something to {{name}}.
// i18n pages.conversations.likeTitle: Like
// i18n pages.conversations.bookmarkTitle: Bookmark
// i18n pages.conversations.openAs: Open as {{term}}
// i18n pages.conversations.groupHint: 🔒 Group membership is just who's &#64;-mentioned — anyone replying can add or remove people by editing the mentions.
// i18n pages.conversations.bot.messagePlaceholder: Message {{name}}…
// i18n pages.conversations.send: Send
// i18n pages.conversations.bskyMessagePlaceholder: Message on Bluesky…
// i18n pages.conversations.replyPublicly: Reply publicly…
// i18n pages.conversations.replyPrivately: Reply privately…
// i18n pages.conversations.selectPrompt: Select a conversation.
// i18n pages.conversations.legend: 🔒 rows are private DMs; 📢 rows are public reply threads.
@Component({
  selector: 'app-conversations',
  imports: [Compose, FormsModule, HumanTimePipe, ReportDialog, RouterLink, TranslocoPipe],
  templateUrl: './conversations.html',
  styleUrl: './conversations.css',
})
export class Conversations implements OnInit, OnDestroy {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private api = inject(Api);
  private auth = inject(Auth);
  private streaming = inject(Streaming);
  private bskyChat = inject(BlueskyChatApi);
  private route = inject(ActivatedRoute);
  protected bsky = inject(BlueskySession);
  protected prefs = inject(ClientPrefs);
  protected bots = inject(BotPeers);
  protected conversations = inject(ConversationStore);
  protected llm = inject(LlmConversation);
  protected ai = inject(AiAvailability);
  private eliza = inject(ElizaService);

  /** The conversation shown for the selected bot, when one is selected. */
  protected currentConversationId = signal<string | null>(null);
  /** True when the dropdown is set to "All conversations" (flattened view). */
  protected flattened = signal(false);
  /** What the user is typing to a bot. Separate from the Mastodon composer. */
  protected botDraft = signal('');

  /** A chat key requested via `?open=…` (e.g. from a notification) to auto-select. */
  private pendingOpen = signal<string | null>(null);
  /** Partner account id from `?with=…`, letting us draft a fresh 1:1 chat when no
   *  history exists yet (the thread page's "open in chat" for a de-novo chat). */
  private pendingWith = signal<string | null>(null);
  /** Status clicked on the thread page; it anchors the transcript even when the
   *  selected correspondent has no existing chat history. */
  private pendingContext = signal<string | null>(null);
  /** True once we've honoured a pending `?open=…` so it can't re-fire on re-select. */
  private openHandled = false;

  /**
   * A client-side chat stub for a 1:1 that has no message history yet. Created
   * when "open in chat" targets someone you haven't exchanged messages with, so
   * the chat still appears in the window with a live composer. It lives only in
   * this signal: it vanishes when you leave the page, and is superseded by the
   * real row the moment an actual message exists under the same key.
   */
  protected draftChat = signal<Chat | null>(null);

  protected loading = signal(true);
  /** Loading an older page of mention notifications (public-chat history). */
  protected loadingMoreChats = signal(false);
  /** No older mention notifications remain to page in. */
  protected chatsExhausted = signal(false);
  /** Oldest notification id fetched so far, the cursor for "Load more". */
  private oldestNotifId: string | null = null;
  protected privateConvs = signal<Conversation[]>([]);
  protected bskyConvos = signal<BskyConvoView[]>([]);
  /** The linked app password can't read DMs; show the relink hint. */
  protected bskyScopeError = signal(false);
  protected bskyMessages = signal<BskyMessageView[]>([]);
  protected bskyDraft = signal('');
  protected bskySending = signal(false);
  private bskyPoll: ReturnType<typeof setInterval> | null = null;
  /** Statuses known per public chat key (from notifications + streaming). */
  private publicStatuses = signal<Map<string, Status[]>>(new Map());
  /** Full accounts observed per public chat key. */
  private publicAccounts = signal<Map<string, Account[]>>(new Map());

  protected selectedKey = signal<string | null>(null);

  /**
   * Whether the chat list is showing on a narrow screen.
   *
   * The mobile layout used to stack a 40vh peer list above the transcript, on
   * top of the header, composer, site footer and bottom nav — which left the
   * actual conversation with a minority of the screen. It is a drawer instead:
   * open it to switch chats, and it closes itself once you have.
   *
   * Ignored entirely above the breakpoint, where both panes fit side by side.
   */
  protected listOpen = signal(false);

  protected toggleList(): void {
    this.listOpen.update((open) => !open);
  }
  protected messages = signal<Status[]>([]);
  protected threadLoading = signal(false);
  protected reportTarget = signal<Account | null>(null);
  /** Accounts moderated from the header menu this session, id → 'muted' | 'blocked'. */
  protected moderated = signal<Record<string, string>>({});

  private lastRead = signal<Record<string, string>>(readMap());
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private subs: Subscription[] = [];

  /** Relationships for the mutuals filter; fetched lazily, only when it's on. */
  private rels = signal<Map<string, Relationship>>(new Map());
  private requestedRels = new Set<string>();

  private strippedCache = new Map<string, string>();

  constructor() {
    // Honour `?open=<chat key>` (from a notification's "Open in chat") once the
    // matching chat row has loaded. Runs once, then leaves manual selection alone.
    // When no such row exists but a `?with=<account id>` was supplied (a de-novo
    // 1:1 from the thread page), draft a stub chat so it still appears and can be
    // replied into — see `draftFor`.
    effect(() => {
      const want = this.pendingOpen();
      if (!want || this.openHandled) {
        return;
      }
      const chat = this.chats().find((c) => c.key === want);
      if (chat) {
        this.openHandled = true;
        // Widen the kind filter only as far as it takes to show this row.
        // Snapping it straight to `chat.kind` narrowed the list every time you
        // followed a notification: arriving from a private mention while on
        // 'all' would hide every public chat you were just looking at. A filter
        // that already shows the row is left exactly as the user set it.
        const kind = this.prefs.chatKind();
        if (kind !== 'all' && kind !== chat.kind) {
          this.prefs.setChatKind('all');
        }
        // The audience filter can hide the row we were sent to open — 'mutuals'
        // excludes bots by definition. Widen it rather than selecting something
        // the list refuses to show.
        if (this.prefs.chatAudience() === 'mutuals' && chat.kind === 'bot') {
          this.prefs.setChatAudience('all');
        }
        this.selectWithContext(chat, this.pendingContext());
        return;
      }
      // No existing row. If we can draft one for the requested partner, do so
      // (once the initial load has settled, so we don't race a real row in).
      const withId = this.pendingWith();
      if (withId && !this.loading() && !this.draftChat()) {
        this.openHandled = true;
        this.draftFor(want, withId, this.pendingContext());
      }
    });
    effect(() => {
      if (this.prefs.chatAudience() !== 'mutuals') {
        return;
      }
      const missing = new Set<string>();
      for (const chat of this.chats()) {
        // Bots are skipped, and not merely as an optimisation: their ids are
        // synthetic (`eliza:self`), so asking the server about a relationship
        // with one is a request that can only 404. They are also excluded from
        // the Mutuals filter by definition — see visibleChats.
        if (chat.kind === 'bot') {
          continue;
        }
        for (const a of chat.accounts) {
          if (!this.requestedRels.has(a.id)) {
            missing.add(a.id);
          }
        }
      }
      if (!missing.size) {
        return;
      }
      for (const id of missing) {
        this.requestedRels.add(id);
      }
      this.api.relationships([...missing]).subscribe((list) => {
        this.rels.update((map) => {
          const next = new Map(map);
          for (const r of list) {
            next.set(r.id, r);
          }
          return next;
        });
      });
    });
  }

  /** Private + public rows merged, newest activity first. */
  protected chats = computed<Chat[]>(() => {
    const me = this.auth.account();
    // The conversations API returns one row per thread; like public chats we
    // group by the people instead, merging every thread with the same set.
    const byKey = new Map<string, Chat>();
    for (const c of this.privateConvs()) {
      const key = privateKey(c.accounts);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          key,
          kind: 'private',
          convIds: [c.id],
          accounts: c.accounts,
          handles: c.accounts.map((a) => a.acct),
          lastStatus: c.last_status,
          unread: c.unread,
        });
        continue;
      }
      existing.convIds.push(c.id);
      existing.unread = existing.unread || c.unread;
      if (
        c.last_status &&
        (!existing.lastStatus || c.last_status.created_at > existing.lastStatus.created_at)
      ) {
        existing.lastStatus = c.last_status;
      }
    }
    const rows: Chat[] = [...byKey.values()];
    const read = this.lastRead();
    for (const [key, statuses] of this.publicStatuses()) {
      const last = statuses[statuses.length - 1] ?? null;
      rows.push({
        key,
        kind: 'public',
        convIds: [],
        accounts: this.publicAccounts().get(key) ?? [],
        handles: key.slice('pub:'.length).split(','),
        lastStatus: last,
        unread: !!last && last.account.id !== me?.id && (!read[key] || last.created_at > read[key]),
      });
    }
    const myDid = this.bsky.session()?.did;
    for (const convo of this.bskyConvos()) {
      if (hasMissingBlueskyMember(convo, myDid)) {
        continue;
      }
      const others = convo.members.filter((m) => m.did !== myDid);
      rows.push({
        key: `bsky:${convo.id}`,
        kind: 'bsky',
        convIds: [],
        accounts: [],
        handles: others.map((m) => m.handle),
        lastStatus: null,
        unread: convo.unreadCount > 0,
        convoId: convo.id,
        members: others,
        previewText: convo.lastMessage?.text ?? '',
        lastAt: convo.lastMessage?.sentAt,
      });
    }
    // Bot correspondents. Always present when available, with or without a
    // conversation behind them — unlike every other row here, an empty one is
    // not a stale artifact but an invitation to start talking.
    for (const bot of this.bots.peers()) {
      const latest = this.conversations.forPeer(bot.peer)[0];
      const lastMessage = latest?.messages.at(-1);
      rows.push({
        key: `bot:${bot.peer}`,
        kind: 'bot',
        convIds: [],
        accounts: [bot.account],
        handles: [bot.account.acct],
        lastStatus: null,
        // Nothing to be unread about: these never arrive while you are away,
        // because nothing here speaks until it is spoken to.
        unread: false,
        previewText: lastMessage?.text ?? '',
        lastAt: latest?.updatedAt,
      });
    }
    // A drafted 1:1 chat surfaces only until a real message exists under its key.
    // The moment the conversations/mentions data grows a row with the same key,
    // that real row wins and the stub drops out (no duplicate, no stale empty).
    const draft = this.draftChat();
    if (draft && !rows.some((r) => r.key === draft.key)) {
      rows.push(draft);
    }
    return rows.sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
  });

  /** The chat list after the audience (mutuals) and kind (🔒/📢) toggles. */
  protected visibleChats = computed<Chat[]>(() => {
    const kind = this.prefs.chatKind();
    const audience = this.prefs.chatAudience();
    const rels = this.rels();
    return this.chats().filter((c) => {
      if (kind !== 'all' && c.kind !== kind) {
        return false;
      }
      if (audience === 'bots') {
        return c.kind === 'bot';
      }
      // Bots are never mutuals — there is no relationship to be mutual about,
      // and a synthetic correspondent showing up under a filter about who
      // follows you back would be answering a question nobody asked.
      if (audience === 'mutuals') {
        if (c.kind === 'bot') {
          return false;
        }
        if (c.accounts.length) {
          const mutual = c.accounts.every((a) => {
            const r = rels.get(a.id);
            return !!r && r.following && r.followed_by;
          });
          if (!mutual) {
            return false;
          }
        }
      }
      return true;
    });
  });

  protected selected = computed(
    () => this.chats().find((c) => c.key === this.selectedKey()) ?? null,
  );

  /** Any chat that came from a server, so paging older history is meaningful. */
  protected hasServerChats = computed(() => this.chats().some((c) => c.kind !== 'bot'));

  // --- Bot conversations ---

  /** The selected bot peer key, or null when the selection is not a bot. */
  protected selectedPeer = computed(() => {
    const chat = this.selected();
    return chat?.kind === 'bot' ? chat.key.slice('bot:'.length) : null;
  });

  /** Every conversation with the selected bot, for the dropdown. */
  protected peerConversations = computed<StoredConversation[]>(() => {
    const peer = this.selectedPeer();
    return peer ? this.conversations.forPeer(peer) : [];
  });

  /**
   * The messages on screen.
   *
   * "All conversations" concatenates every conversation with this peer in
   * chronological order — the flattening the dropdown offers. It is a reading
   * view only: sending while flattened would have no conversation to append to,
   * so the composer targets the most recent one.
   */
  protected botMessages = computed<ConversationMessage[]>(() => {
    if (this.flattened()) {
      return [...this.peerConversations()]
        .reverse()
        .flatMap((conversation) => conversation.messages);
    }
    const id = this.currentConversationId();
    return id ? (this.conversations.get(id)?.messages ?? []) : [];
  });

  /** True while a model reply is streaming into the shown conversation. */
  protected botStreaming = computed(() => {
    const id = this.currentConversationId();
    return !!id && this.llm.streaming(id);
  });

  /** Select a conversation from the dropdown. `all` flattens instead. */
  protected pickConversation(value: string): void {
    if (value === 'all') {
      this.flattened.set(true);
      return;
    }
    this.flattened.set(false);
    this.currentConversationId.set(value);
  }

  /**
   * Start a fresh conversation with the selected bot.
   *
   * For Eliza this discards the previous one — see {@link ConversationStore}.
   * For a model it is kept and stays in the dropdown.
   */
  protected newConversation(): void {
    const peer = this.selectedPeer();
    if (!peer) {
      return;
    }
    this.flattened.set(false);
    this.currentConversationId.set(this.conversations.startNew(peer).id);
  }

  /** Send the drafted line to the selected bot. */
  protected sendToBot(): void {
    const peer = this.selectedPeer();
    const text = this.botDraft().trim();
    if (!peer || !text) {
      return;
    }
    // Flattened is a reading view; sending targets the live conversation.
    const id = this.flattened()
      ? this.conversations.currentFor(peer).id
      : this.ensureConversation(peer);
    this.flattened.set(false);
    this.currentConversationId.set(id);
    this.botDraft.set('');

    if (this.bots.find(peer)?.streams) {
      // Deliberately not awaited: the reply streams into the store, so this
      // page can be left and the answer still arrives.
      void this.llm.send(id, text);
      return;
    }
    // Eliza answers instantly and locally.
    this.conversations.append(id, { from: 'me', text });
    this.conversations.append(id, { from: 'them', text: this.eliza.reply(text) });
  }

  /** The shown conversation, creating one if this peer has none yet. */
  private ensureConversation(peer: string): string {
    const current = this.currentConversationId();
    if (current && this.conversations.get(current)?.peer === peer) {
      return current;
    }
    return this.conversations.currentFor(peer).id;
  }

  /**
   * Pre-seed the composer with @mentions of the reply's recipients.
   *
   * Mastodon quirk this works around (verified live against real instances):
   * `in_reply_to_id` *threads* a reply but does NOT by itself notify the parent
   * author — a recipient only gets a mention notification if their `@handle` is
   * actually in the post text. So for **public** chats we seed the recipient's
   * handle by default; a reply that reads as a silent thread-reply (no ping) is
   * the surprising case, not the norm. The composer itself shows the "remove the
   * handle to reply without notifying" hint (see Compose.showReplyMentionHint).
   *
   * **Private** (direct) chats are different: delivery there rides on the
   * `direct` visibility + the conversation itself, which already surfaces to the
   * recipient, so the obvious 1:1 partner is dropped to keep the box clean. Group
   * private chats still seed the *other* members, who wouldn't otherwise be reached.
   */
  protected replyMentions = computed(() => {
    const chat = this.selected();
    if (!chat) {
      return '';
    }
    const me = this.auth.account();
    // Who the reply is chaining onto: the author of the newest message in the
    // open thread (the person a bare reply would otherwise fail to notify).
    const replyTo = this.messages().at(-1) ?? chat.lastStatus;
    const implicit = replyTo?.account.acct;

    const handles = new Set<string>(chat.handles.filter((h) => h !== ''));
    if (chat.kind === 'public') {
      // Author-grouped chats only know the reply guy; keep everyone the last
      // message was addressed to in the thread too — and, unlike private chats,
      // keep the recipient's own handle so the reply actually pings them.
      if (replyTo) {
        if (replyTo.account.acct !== me?.acct) {
          handles.add(replyTo.account.acct);
        }
        for (const m of replyTo.mentions ?? []) {
          if (m.acct !== me?.acct) {
            handles.add(m.acct);
          }
        }
      }
    } else if (implicit) {
      // Private chats: the 1:1 partner is reached via the conversation itself,
      // so drop their handle from the box (group members are kept above).
      handles.delete(implicit);
    }
    if (me?.acct) {
      handles.delete(me.acct);
    }
    return handles.size ? [...handles].map((h) => `@${h}`).join(' ') + ' ' : '';
  });

  /** Replies chain onto the newest message in the open thread. */
  protected replyToId = computed(
    () => this.messages().at(-1)?.id ?? this.selected()?.lastStatus?.id,
  );

  /** Public replies keep the thread's visibility; private stays direct. */
  protected replyVisibility = computed(() => {
    const chat = this.selected();
    if (!chat || chat.kind === 'private') {
      return 'direct';
    }
    const vis = this.messages().at(-1)?.visibility ?? chat.lastStatus?.visibility;
    return vis && vis !== 'direct' ? vis : 'public';
  });

  ngOnInit(): void {
    const open = this.route.snapshot.queryParamMap.get('open');
    if (open) {
      this.pendingOpen.set(open);
    }
    this.pendingWith.set(this.route.snapshot.queryParamMap.get('with'));
    this.pendingContext.set(this.route.snapshot.queryParamMap.get('context'));
    this.load();
    // The IM feel: streams are live while this page is open, closed on leave.
    this.subs.push(
      this.streaming.open({ stream: 'direct' }).subscribe(({ event, payload }) => {
        if (event === 'conversation') {
          this.upsertConversation(payload as Conversation);
        }
      }),
      this.streaming.open({ stream: 'user' }).subscribe(({ event, payload }) => {
        if (event === 'notification') {
          const n = payload as MastodonNotification;
          if (n.type === 'mention' && n.status) {
            this.addPublicStatus(n.status, n.account);
          }
        } else if (event === 'update' || event === 'status_update') {
          this.maybeAppendToThread(payload as Status);
        } else if (event === 'delete') {
          this.messages.update((list) => list.filter((m) => m.id !== payload));
        }
      }),
    );
    // Bluesky chat has no client-reachable stream; poll the convo list gently —
    // once every 10 minutes, to keep third-party API traffic light.
    if (this.bsky.linked()) {
      this.bskyPoll = setInterval(() => this.refreshBskyConvos(), 10 * 60_000);
    }
  }

  ngOnDestroy(): void {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
    if (this.bskyPoll) {
      clearInterval(this.bskyPoll);
    }
  }

  load(): void {
    this.loading.set(true);
    let pending = this.bsky.linked() ? 3 : 2;
    const done = () => {
      if (--pending === 0) {
        this.loading.set(false);
      }
    };
    if (this.bsky.linked()) {
      this.bskyChat.listConvos().subscribe({
        next: (list) => {
          this.bskyConvos.set(list.convos);
          this.bskyScopeError.set(false);
          done();
        },
        error: (err: unknown) => {
          this.bskyScopeError.set(isChatScopeError(err));
          done();
        },
      });
    }
    this.api.conversations().subscribe({
      next: (convs) => {
        this.privateConvs.set(convs);
        done();
      },
      error: done,
    });
    this.api.notifications().subscribe({
      next: (notifs) => {
        this.ingestNotifPage(notifs);
        done();
      },
      error: done,
    });
  }

  /**
   * Fold one page of notifications into the public chats and advance the
   * "Load more" cursor. Only mentions build chat history; the cursor tracks the
   * overall oldest id so paging steps past non-mention notifications too.
   */
  private ingestNotifPage(notifs: MastodonNotification[]): void {
    for (const n of notifs) {
      if (n.type === 'mention' && n.status) {
        this.addPublicStatus(n.status, n.account);
      }
    }
    const oldest = notifs.at(-1);
    if (oldest) {
      this.oldestNotifId = oldest.id;
    }
  }

  /**
   * Page in older mention notifications so the public chat list and open thread
   * fill out — the first page alone shows only a sliver of a busy history.
   */
  loadMoreChats(): void {
    if (!this.oldestNotifId || this.loadingMoreChats() || this.chatsExhausted()) {
      return;
    }
    this.loadingMoreChats.set(true);
    this.api.notifications(this.oldestNotifId).subscribe({
      next: (notifs) => {
        this.loadingMoreChats.set(false);
        if (!notifs.length) {
          this.chatsExhausted.set(true);
          return;
        }
        this.ingestNotifPage(notifs);
      },
      error: () => this.loadingMoreChats.set(false),
    });
  }

  select(chat: Chat, anchor: Status | null = chat.lastStatus): void {
    this.selectedKey.set(chat.key);
    // Narrow screens show the chat list as a drawer over the transcript; once a
    // chat is chosen the list has done its job and the conversation should have
    // the screen. Harmless on desktop, where the drawer state is unused.
    this.listOpen.set(false);
    if (chat.kind === 'bot') {
      // Open the most recent conversation, or an empty new one. Nothing is
      // fetched and nothing is marked read: this correspondent lives here.
      const peer = chat.key.slice('bot:'.length);
      this.flattened.set(false);
      this.currentConversationId.set(this.conversations.currentFor(peer).id);
      return;
    }
    if (chat.kind === 'bsky') {
      this.loadBskyThread(chat);
      return;
    }
    this.markRead(chat);
    this.loadThread(chat, anchor);
  }

  /**
   * Select a route-linked chat and load the exact post that supplied the link.
   * Selecting with a null anchor paints the header and composer immediately;
   * the status request then replaces the blank transcript with useful context.
   */
  private selectWithContext(chat: Chat, contextId: string | null): void {
    if (!contextId) {
      this.select(chat);
      return;
    }
    this.select(chat, null);
    this.threadLoading.set(true);
    this.api.getStatus(contextId).subscribe({
      next: (anchor) => this.loadThread(chat, anchor),
      error: () => {
        this.threadLoading.set(false);
        this.loadThread(chat);
      },
    });
  }

  /**
   * Draft a stub 1:1 chat for `key` with the account `withId`, when no real chat
   * exists yet. Fetches the full account (for the avatar/title), builds an empty
   * public chat row, and selects it. If the account can't be fetched we quietly
   * do nothing — the empty state is better than a nameless placeholder.
   *
   * The key mirrors the public grouping (`pub:<acct>`), so the user's first reply
   * — delivered as a public status mentioning them — lands under the same key and
   * the real row transparently takes over from this stub (see `addPublicStatus`
   * and `chats()`).
   */
  private draftFor(key: string, withId: string, contextId: string | null): void {
    this.api.getAccount(withId).subscribe({
      next: (account) => {
        // Guard the race: a real row for this key may have arrived while the
        // account request was in flight. If so, prefer it.
        const existing = this.chats().find((c) => c.key === key);
        if (existing) {
          this.prefs.setChatKind(existing.kind);
          this.selectWithContext(existing, contextId);
          return;
        }
        const draft: Chat = {
          key,
          kind: 'public',
          convIds: [],
          accounts: [account],
          handles: [account.acct],
          lastStatus: null,
          unread: false,
        };
        this.draftChat.set(draft);
        // Make sure the kind filter doesn't hide the freshly drafted row.
        if (this.prefs.chatKind() !== 'all') {
          this.prefs.setChatKind('public');
        }
        this.selectWithContext(draft, contextId);
      },
      // A failed lookup leaves the normal "select a conversation" empty state.
      error: () => undefined,
    });
  }

  title(chat: Chat): string {
    if (chat.kind === 'bsky') {
      const named = (chat.members ?? []).map((m) => m.displayName || m.handle);
      return named.join(', ') || 'Bluesky chat';
    }
    if (!chat.accounts.length && !chat.handles.some((h) => h !== '')) {
      // A self-conversation (direct message to yourself).
      return this.auth.account()?.display_name || 'You';
    }
    const named = chat.accounts.map((a) => a.display_name || a.username);
    const known = new Set(chat.accounts.map((a) => a.acct));
    const unnamed = chat.handles.filter((h) => h !== '' && !known.has(h)).map((h) => `@${h}`);
    return [...named, ...unnamed].join(', ');
  }

  protected isMine(m: Status): boolean {
    return m.account.id === this.auth.account()?.id;
  }

  /** Message HTML minus the leading @mention run (memoized; edits re-render). */
  protected stripped(s: Status): string {
    const cacheKey = `${s.id}:${s.edited_at ?? ''}`;
    let out = this.strippedCache.get(cacheKey);
    if (out === undefined) {
      out = stripLeadingMentions(s.content);
      this.strippedCache.set(cacheKey, out);
    }
    return out;
  }

  // ---------------------------------------------------------------- thread

  private loadThread(chat: Chat, anchor: Status | null = chat.lastStatus): void {
    // Merged private chats span several threads; their last statuses at least
    // belong in the history even though only the anchor's context is fetched.
    const known =
      chat.kind === 'public'
        ? (this.publicStatuses().get(chat.key) ?? [])
        : this.privateConvs()
            .filter((c) => chat.convIds.includes(c.id) && c.last_status)
            .map((c) => c.last_status!);
    if (!anchor) {
      this.messages.set([]);
      this.threadLoading.set(false);
      return;
    }
    this.threadLoading.set(true);
    this.messages.set(known.length ? known : [anchor]);
    this.api.getContext(anchor.id).subscribe({
      next: (ctx) => {
        this.messages.set(dedupeSort([...ctx.ancestors, anchor, ...ctx.descendants, ...known]));
        this.threadLoading.set(false);
        this.scrollToBottom();
      },
      error: () => this.threadLoading.set(false),
    });
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  onReplyPosted(status: Status): void {
    const chat = this.selected();
    this.messages.update((list) => dedupeSort([...list, status]));
    this.scrollToBottom();
    if (!chat || chat.kind === 'private') {
      // A new direct status starts (or advances) a conversation; refresh the list
      // and follow the selection onto the (possibly new) conversation row.
      this.api.conversations().subscribe((convs) => {
        this.privateConvs.set(convs);
        const mine = convs.find((c) => c.last_status?.id === status.id);
        if (mine) {
          this.selectedKey.set(privateKey(mine.accounts));
        }
      });
    } else {
      // My own reply can't be keyed by author; it belongs to the open chat.
      this.addPublicStatus(status, status.account, chat.key);
      // A drafted chat has now earned a real message under its key — retire the
      // stub so it's the real (promoted) row that carries on.
      if (this.draftChat()?.key === chat.key) {
        this.draftChat.set(null);
      }
    }
  }

  // ---------------------------------------------------------------- bluesky

  protected bskyIsMine(m: BskyMessageView): boolean {
    return m.sender.did === this.bsky.session()?.did;
  }

  /** The sender's profile bits, for avatars/names on their bubbles. */
  protected bskyAuthor(chat: Chat, did: string): BskyChatMember | null {
    return (chat.members ?? []).find((m) => m.did === did) ?? null;
  }

  private loadBskyThread(chat: Chat): void {
    if (!chat.convoId) {
      return;
    }
    this.threadLoading.set(true);
    this.bskyMessages.set([]);
    this.bskyChat.getMessages(chat.convoId).subscribe({
      next: ({ messages }) => {
        // Newest-first from the API; deleted messages arrive without text.
        const chronological = messages.filter((m) => m.text !== undefined).reverse();
        this.bskyMessages.set(chronological);
        this.threadLoading.set(false);
        this.scrollToBottom();
        const newest = chronological.at(-1);
        if (newest) {
          // Best-effort: a failed read-receipt shouldn't surface anywhere.
          this.bskyChat.updateRead(chat.convoId!, newest.id).subscribe({ error: () => undefined });
        }
        this.bskyConvos.update((list) =>
          list.map((c) => (c.id === chat.convoId ? { ...c, unreadCount: 0 } : c)),
        );
      },
      error: () => this.threadLoading.set(false),
    });
  }

  sendBskyMessage(): void {
    const chat = this.selected();
    const text = this.bskyDraft().trim();
    if (!chat?.convoId || !text || this.bskySending()) {
      return;
    }
    this.bskySending.set(true);
    this.bskyChat.sendMessage(chat.convoId, text).subscribe({
      next: (message) => {
        this.bskySending.set(false);
        this.bskyDraft.set('');
        this.bskyMessages.update((list) => [...list, message]);
        this.bskyConvos.update((list) =>
          list.map((c) => (c.id === chat.convoId ? { ...c, lastMessage: message } : c)),
        );
        this.scrollToBottom();
      },
      error: () => this.bskySending.set(false),
    });
  }

  private refreshBskyConvos(): void {
    this.bskyChat.listConvos().subscribe({
      next: (list) => {
        const before = this.bskyConvos();
        this.bskyConvos.set(list.convos);
        const chat = this.selected();
        if (chat?.kind !== 'bsky' || !chat.convoId) {
          return;
        }
        // Reload the open thread only when its convo actually advanced.
        const prev = before.find((c) => c.id === chat.convoId);
        const next = list.convos.find((c) => c.id === chat.convoId);
        if (next && next.rev !== prev?.rev) {
          this.loadBskyThread(chat);
        }
      },
      error: () => undefined, // polling silently tolerates a flaky network
    });
  }

  // ---------------------------------------------------------------- read state

  private markRead(chat: Chat): void {
    if (chat.kind === 'private') {
      const unreadIds = this.privateConvs()
        .filter((c) => chat.convIds.includes(c.id) && c.unread)
        .map((c) => c.id);
      for (const id of unreadIds) {
        this.api.markConversationRead(id).subscribe(() => {
          this.privateConvs.update((list) =>
            list.map((c) => (c.id === id ? { ...c, unread: false } : c)),
          );
        });
      }
      return;
    }
    // Public chats have no server-side read state; remember locally.
    const stamp = chat.lastStatus?.created_at ?? new Date().toISOString();
    this.lastRead.update((map) => {
      const next = { ...map, [chat.key]: stamp };
      localStorage.setItem(READ_KEY, JSON.stringify(next));
      return next;
    });
  }

  // ---------------------------------------------------------------- streaming

  private upsertConversation(conv: Conversation): void {
    this.privateConvs.update((list) => {
      const rest = list.filter((c) => c.id !== conv.id);
      return [conv, ...rest];
    });
    const chat = this.selected();
    if (chat?.kind === 'private' && chat.key === privateKey(conv.accounts) && conv.last_status) {
      this.messages.update((list) => dedupeSort([...list, conv.last_status!]));
      this.scrollToBottom();
      this.markRead({ ...chat, unread: true, lastStatus: conv.last_status });
    }
  }

  private addPublicStatus(status: Status, author: Account, keyOverride?: string): void {
    if (status.visibility === 'direct') {
      return; // direct mentions belong to the conversations API, not public chats
    }
    const key = keyOverride ?? this.publicKey(author);
    if (!key) {
      return;
    }
    this.publicStatuses.update((map) => {
      const next = new Map(map);
      next.set(key, dedupeSort([...(next.get(key) ?? []), status]));
      return next;
    });
    const me = this.auth.account();
    if (author.id !== me?.id) {
      this.publicAccounts.update((map) => {
        const list = map.get(key) ?? [];
        if (list.some((a) => a.id === author.id)) {
          return map;
        }
        const next = new Map(map);
        next.set(key, [...list, author]);
        return next;
      });
    }
    const chat = this.selected();
    if (chat?.key === key) {
      this.messages.update((list) => dedupeSort([...list, status]));
      this.scrollToBottom();
      this.markRead({ ...chat, lastStatus: status });
    }
  }

  private maybeAppendToThread(status: Status): void {
    const chat = this.selected();
    if (!chat) {
      return;
    }
    const inThread =
      !!status.in_reply_to_id && this.messages().some((m) => m.id === status.in_reply_to_id);
    const isEdit = this.messages().some((m) => m.id === status.id);
    if (!inThread && !isEdit) {
      return;
    }
    this.messages.update((list) =>
      isEdit ? list.map((m) => (m.id === status.id ? status : m)) : dedupeSort([...list, status]),
    );
    this.scrollToBottom();
  }

  /**
   * Public chats group by the reply guy: all public mentions authored by the
   * same person read as one IM history, regardless of which thread they came
   * from (no reply-graph tracing). My own statuses have no key of their own —
   * they join whichever chat they were sent from (see onReplyPosted).
   */
  private publicKey(author: Account): string | null {
    return author.id === this.auth.account()?.id ? null : `pub:${author.acct}`;
  }

  // ---------------------------------------------------------------- bubble actions

  toggleFave(m: Status): void {
    const call = m.favourited ? this.api.unfavourite(m.id) : this.api.favourite(m.id);
    call.subscribe((updated) => this.replaceMessage(updated));
  }

  toggleBookmark(m: Status): void {
    const call = m.bookmarked ? this.api.unbookmark(m.id) : this.api.bookmark(m.id);
    call.subscribe((updated) => this.replaceMessage(updated));
  }

  toggleBoost(m: Status): void {
    const call = m.reblogged ? this.api.unreblog(m.id) : this.api.reblog(m.id);
    call.subscribe((updated) => this.replaceMessage(updated.reblog ?? updated));
  }

  private replaceMessage(updated: Status): void {
    this.messages.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
  }

  // ---------------------------------------------------------------- moderation

  muteParticipant(acc: Account): void {
    this.api.muteAccount(acc.id).subscribe(() => {
      this.moderated.update((m) => ({ ...m, [acc.id]: 'muted' }));
    });
  }

  blockParticipant(acc: Account): void {
    this.api.block(acc.id).subscribe(() => {
      this.moderated.update((m) => ({ ...m, [acc.id]: 'blocked' }));
    });
  }
}

/** Newest-activity stamp for sorting; bsky rows carry it outside lastStatus. */
function lastActivity(c: Chat): string {
  return c.lastStatus?.created_at ?? c.lastAt ?? '';
}

/** Private chats group by participant set (matching how public ones group by author). */
function privateKey(accounts: Account[]): string {
  return (
    'priv:' +
    accounts
      .map((a) => a.acct)
      .sort()
      .join(',')
  );
}

/** A failed Bluesky identity lookup can leave a reserved placeholder handle in a DM. */
function hasMissingBlueskyMember(convo: BskyConvoView, myDid: string | undefined): boolean {
  return convo.members.some((member) => {
    if (member.did === myDid) {
      return false;
    }
    const handle = member.handle.trim().toLocaleLowerCase().replace(/^@/, '');
    const displayName = member.displayName?.trim().toLocaleLowerCase() ?? '';
    return (
      handle === 'missing.invalid' ||
      handle.endsWith('.missing.invalid') ||
      displayName === 'missing.invalid'
    );
  });
}

function dedupeSort(statuses: Status[]): Status[] {
  const byId = new Map<string, Status>();
  for (const s of statuses) {
    byId.set(s.id, s);
  }
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}
