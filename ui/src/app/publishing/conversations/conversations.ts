import { qualifiedHandle } from '../../accounts/account-handle';
import { ChatSound } from './chat-sound';
import { ChatPerson, ChatSuggestions, person, rankSuggestions } from './chat-suggestions';
import { emojiReply } from './emoji-reply';
import { compactContentLinks, ContentLinks } from '../../posts/content-links';
import { LinkedText } from '../../posts/linked-text';
// i18n pages.conversations.startFailed: Could not start this chat. Check your chat permissions and try again.
import { accountProfilePath } from '../../accounts/account-route';
import { CustomEmojiPipe } from '../custom-emoji.pipe';
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
import { catchError, forkJoin, map, of, Subscription, timeout } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { Compose } from '../compose/compose';
import { HumanTimePipe } from '../../i18n/human-time.pipe';
import { ReportDialog } from '../../moderation/report-dialog/report-dialog';
import { StreamDiagnostics, Streaming, StreamState } from '../../platform/api/streaming';
import {
  Account,
  Conversation,
  MastodonNotification,
  Relationship,
  Status,
} from '../../platform/api/models';
import { AiAvailability } from '../../platform/build/ai-availability';
import { BotPeers } from '../../chat/bot-peers';
import {
  Conversation as StoredConversation,
  ConversationMessage,
  ConversationStore,
} from '../../chat/conversation-store';
import { LlmConversation } from '../../chat/llm-conversation';
import { ElizaService } from '../../chat/eliza/eliza.service';
import {
  BlueskyChatApi,
  isChatScopeError,
  xrpcErrorCode,
} from '../../connections/bluesky/bluesky-chat-api';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import {
  BSKY_DELETED_MESSAGE,
  BskyChatMember,
  BskyConvoView,
  BskyMessageView,
} from '../../connections/bluesky/bluesky-types';
import { AppDialogs } from '../../shell/app-dialogs';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbMenuItem } from '../../design-system/menu/menu-item';
import { MbPopover } from '../../design-system/popover/popover';
import { MbPostMenu } from '../../design-system/menu/post-menu';
import { EmojiPicker } from '../emoji-picker/emoji-picker';
import { Terminology } from '../../i18n/terminology';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';

/** localStorage map of chat key → ISO timestamp of the newest message seen there. */
const READ_KEY = 'mockingbird_chat_read';

/** Private conversations per page: Mastodon's maximum. */
const CONVERSATION_PAGE = 40;
/** Mention notifications per page: Mastodon's v1 maximum is 80; 40 keeps each request light. */
const MENTION_PAGE = 40;
/** How long Connecting…/Reconnecting… shows before it offers diagnostics. */
const STUCK_AFTER_MS = 5_000;
/** Mention pages fetched on open, before any Load more (about 120 mentions). */
const INITIAL_MENTION_PAGES = 3;
/** While not live: how often the open conversation and the chat list are re-fetched. */
const POLL_THREAD_MS = 20_000;
const POLL_LIST_MS = 60_000;

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
  /** Bluesky only: a message request not yet accepted (listed apart from chats). */
  request?: boolean;
  /** Bluesky only: notifications for this chat are muted. */
  muted?: boolean;
}

/** Emoji reactions on one message, grouped for the chips under its bubble. */
export interface ReactionChip {
  value: string;
  count: number;
  mine: boolean;
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
// i18n pages.conversations.bskyScopeHint.relink: 🦋 This Bluesky link can't read DMs. Unlink and choose Continue with Bluesky to relink with DM access in
// i18n pages.conversations.bskyScopeHint.link: Settings → Connections → Bluesky
// i18n pages.conversations.loading: Loading…
// i18n pages.conversations.emptyChats: No conversations yet. Enter a handle in Chat with to start a private conversation.
// i18n pages.conversations.noMatch: No chats match the filters.
// i18n pages.conversations.unreadTitle: Unread
// i18n pages.conversations.badge.publicUpper: 📢 PUBLIC
// i18n pages.conversations.badge.bot: 🤖 This browser
// i18n pages.conversations.noOlderMessages: No older messages.
// i18n pages.conversations.loadMoreTitle: Load older mentions into your public chats
// i18n pages.conversations.loadMore: Load more
// i18n pages.conversations.loadOlder: Load older messages
// i18n pages.conversations.refresh: Refresh
// i18n pages.conversations.refreshing: Refreshing…
// i18n pages.conversations.live.live: ● Live
// i18n pages.conversations.live.liveTitle: New messages, likes and replies arrive as they happen.
// i18n pages.conversations.live.connecting: Connecting…
// i18n pages.conversations.live.connectingTitle: Opening the live connection to your server.
// i18n pages.conversations.live.down: Reconnecting…
// i18n pages.conversations.live.downTitle: The live connection dropped. Until it is back, the open chat is checked every 20 seconds; Refresh checks now.
// i18n pages.conversations.live.unavailable: Not live
// i18n pages.conversations.live.unavailableTitle: Your server does not offer live updates. The open chat is checked every 20 seconds; Refresh checks now.
// i18n pages.conversations.live.diagnose: Still not live. Click to see why.
// i18n pages.conversations.liveDiag.title: Why live updates are not working
// i18n pages.conversations.liveDiag.close: Close
// i18n pages.conversations.liveDiag.summary: Live updates have not connected for {{seconds}} seconds. This is what Mawkingbird knows. Browsers hide the details of a failed live connection, so the server's own reason may be missing.
// i18n pages.conversations.liveDiag.offline: Your browser says it is offline. Check your network connection first.
// i18n pages.conversations.liveDiag.streamDirect: Private messages
// i18n pages.conversations.liveDiag.streamUser: Mentions and replies
// i18n pages.conversations.liveDiag.server: Live server: {{server}}
// i18n pages.conversations.liveDiag.discoveryFailed: Your server did not say where its live updates are, so its own address was tried.
// i18n pages.conversations.liveDiag.failures: Failed attempts since it was last live: {{count}}
// i18n pages.conversations.liveDiag.lastClose: Last error: code {{code}}, {{reason}} ({{seconds}} s ago)
// i18n pages.conversations.liveDiag.reason1006: the connection failed or dropped without a reason (often a network, firewall or server problem)
// i18n pages.conversations.liveDiag.noReason: no reason given
// i18n pages.conversations.liveDiag.paused: Paused after repeated failures. Next try in {{seconds}} s.
// i18n pages.conversations.liveDiag.nextIn: Next try in {{seconds}} s.
// i18n pages.conversations.liveDiag.polling: Until it is live again, the open chat is checked every 20 seconds.
// i18n pages.conversations.liveDiag.doctor: Network Doctor
// i18n pages.conversations.liveDiag.reconnect: Reconnect now
// i18n pages.conversations.composeKind.public: 🌐 Public reply: anyone can see it. Choose “Mentioned only” to send it privately instead.
// i18n pages.conversations.composeKind.private: 🔒 Private message: only the people mentioned in it receive it.
// i18n pages.conversations.movedToPrivate: You sent that privately, so it is here in your private chat with {{name}} rather than in the public one.
// i18n pages.conversations.actionsAriaLabel: Conversation actions
// i18n pages.conversations.mute: Mute
// i18n pages.conversations.block: Block
// i18n pages.conversations.report: Report
// i18n pages.conversations.publicBanner.title: Public conversation
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
// i18n pages.conversations.groupHint: 🔒 Group membership is just who's @-mentioned — anyone replying can add or remove people by editing the mentions.
// i18n pages.conversations.bot.messagePlaceholder: Message {{name}}…
// i18n pages.conversations.send: Send
// i18n pages.conversations.bskyMessagePlaceholder: Message on Bluesky…
// i18n pages.conversations.replyPublicly: Reply publicly…
// i18n pages.conversations.replyPrivately: Reply privately…
// i18n pages.conversations.selectPrompt: Select a conversation.
// i18n pages.conversations.legend: 🔒 rows are private DMs; 📢 rows are public reply threads.
@Component({
  selector: 'app-conversations',
  imports: [
    ContentLinks,
    LinkedText,
    CustomEmojiPipe,
    Compose,
    EmojiPicker,
    FormsModule,
    MbButton,
    MbDialog,
    MbMenuItem,
    MbPostMenu,
    MbPopover,
    HumanTimePipe,
    ReportDialog,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './conversations.html',
  styleUrl: './conversations.css',
})
export class Conversations implements OnInit, OnDestroy {
  protected readonly accountProfilePath = accountProfilePath;
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private api = inject(Api);
  private auth = inject(Auth);
  private diagnostics = inject(PageDiagnostics);
  protected mastodonAvailable = computed(() => !this.auth.lacksMastodonToken);
  protected mastodonLoadError = signal(false);
  protected bskyLoadError = signal(false);
  protected bskySendError = signal(false);
  protected threadError = signal<'bluesky' | null>(null);
  private loadSub = new Subscription();
  private threadSub: Subscription | null = null;
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
  private dialogs = inject(AppDialogs);
  private i18n = inject(TranslocoService);

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
  /** Cursor for older private conversations: the oldest row's last status id. */
  private oldestConvStatusId: string | null = null;
  private mentionsExhausted = false;
  private convsExhausted = false;
  /**
   * Whether new messages arrive by themselves. Combined from the two Mastodon
   * streams this page opens; `off` when there is no Mastodon account at all.
   */
  protected liveState = signal<StreamState | 'off'>('off');
  /** Indicator wording per state, as whole keys so the i18n check can see them. */
  protected readonly liveText: Record<StreamState | 'off', { label: string; title: string }> = {
    live: { label: 'pages.conversations.live.live', title: 'pages.conversations.live.liveTitle' },
    connecting: {
      label: 'pages.conversations.live.connecting',
      title: 'pages.conversations.live.connectingTitle',
    },
    down: { label: 'pages.conversations.live.down', title: 'pages.conversations.live.downTitle' },
    unavailable: {
      label: 'pages.conversations.live.unavailable',
      title: 'pages.conversations.live.unavailableTitle',
    },
    off: { label: '', title: '' },
  };
  /** What each stream last reported about its connection (see StreamDiagnostics). */
  private streamInfo = signal<Partial<Record<'direct' | 'user', StreamDiagnostics>>>({});
  /** Not live for STUCK_AFTER_MS: the indicator becomes a button that explains why. */
  protected liveStuck = signal(false);
  protected liveDiagnosticsOpen = signal(false);
  private notLiveSince = Date.now();
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;
  private streamSubs: Subscription[] = [];
  private streamStates: Record<'direct' | 'user', StreamState> = {
    direct: 'connecting',
    user: 'connecting',
  };
  /** The Refresh button's own spinner, separate from the first load. */
  protected refreshing = signal(false);
  /** Set after a public chat's reply was sent privately and moved to its own chat. */
  protected movedToPrivate = signal<{ key: string; name: string } | null>(null);
  private pollTimers: ReturnType<typeof setInterval>[] = [];
  protected privateConvs = signal<Conversation[]>([]);
  protected bskyConvos = signal<BskyConvoView[]>([]);
  /** The linked app password can't read DMs; show the relink hint. */
  protected bskyScopeError = signal(false);
  protected bskyMessages = signal<BskyMessageView[]>([]);
  protected bskyDraft = signal('');
  protected bskySending = signal(false);
  /** The chat list shows Bluesky message requests instead of chats. */
  protected showRequests = signal(false);
  /** Message whose reaction picker is open, by id. */
  protected reactingTo = signal<string | null>(null);
  /** i18n key of the last failed Bluesky chat action (reaction, mute, leave, delete). */
  protected bskyActionError = signal<string | null>(null);
  protected bskyRequestCount = computed(() => this.chats().filter((c) => c.request).length);
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
  protected listOpen = signal(true);

  protected toggleList(): void {
    this.listOpen.update((open) => !open);
  }
  protected messages = signal<Status[]>([]);
  protected threadLoading = signal(false);
  protected moderationAccounts(chat: Chat): Account[] {
    return chat.accounts.filter((a) => a.id !== this.auth.account()?.id);
  }
  protected chatWith = signal('');

  // ---------------------------------------------------------- Chat with suggestions
  protected readonly chatSuggestions = inject(ChatSuggestions);
  /** Follows found by the server for a large account, newest search only. */
  private readonly searchedPeople = signal<ChatPerson[]>([]);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private searchSub: Subscription | undefined;
  /** People already in a private chat with you: free, the list is loaded anyway. */
  private readonly chatPartners = computed(() => {
    const me = this.auth.account()?.id;
    return this.chats()
      .filter((chat) => chat.kind === 'private')
      .flatMap((chat) => chat.accounts)
      .filter((account) => account.id !== me)
      .map(person);
  });
  /** What the box offers for the current text: mutuals first, then chat partners. */
  protected readonly chatWithSuggestions = computed(() =>
    rankSuggestions(
      this.chatWith(),
      [...this.chatSuggestions.mutuals(), ...this.searchedPeople()],
      this.chatPartners(),
    ),
  );

  /** First use of the box, not page open, pays for the mutual set (once a week). */
  protected onChatWithFocus(): void {
    void this.chatSuggestions.ensure();
  }

  protected onChatWithInput(value: string): void {
    this.chatWith.set(value);
    this.searchFollowsLater(value);
  }

  /**
   * Only when there is no mutual set to filter (an account past the build cap,
   * or a failed build): one search of your follows per pause in typing, never
   * per keypress, and not while local matches already fill the list.
   */
  private searchFollowsLater(value: string): void {
    clearTimeout(this.searchTimer);
    const query = value.trim().replace(/^@/, '');
    const source = this.chatSuggestions.source();
    if (source !== 'capped' && source !== 'failed') return;
    if (query.length < 2 || this.chatWithSuggestions().length >= 5) return;
    this.searchTimer = setTimeout(() => {
      this.searchSub?.unsubscribe();
      this.searchSub = this.chatSuggestions.searchFollowed(query).subscribe({
        next: (accounts) => this.searchedPeople.set(accounts.map(person)),
        error: () => undefined,
      });
    }, 350);
  }
  protected startingChat = signal(false);
  protected moderationChat = signal<Chat | null>(null);
  protected activeModerationChat = computed(() => {
    const chat = this.moderationChat();
    return chat ? (this.chats().find((c) => c.key === chat.key) ?? chat) : null;
  });
  protected moderationBusy = signal(false);
  protected moderationError = signal(false);
  protected muteDuration = 3600;
  protected sound = inject(ChatSound);
  protected emojiReply = emojiReply;
  protected emojiSending = signal(false);
  protected emojiError = signal(false);
  protected transcript = computed(() => {
    const messages = this.messages();
    const ids = new Set(messages.filter((m) => !emojiReply(m)).map((m) => m.id));
    return messages.filter(
      (m) => !m.in_reply_to_id || !ids.has(m.in_reply_to_id) || !emojiReply(m),
    );
  });
  protected groupedReplies(id: string): Status[] {
    return this.messages().filter((m) => m.in_reply_to_id === id && !!emojiReply(m));
  }

  protected groupedEmojiChips(
    id: string,
  ): { value: string; count: number; authors: string; mine: boolean }[] {
    const groups = new Map<string, Status[]>();
    for (const reply of this.groupedReplies(id)) {
      const value = emojiReply(reply)!;
      groups.set(value, [...(groups.get(value) ?? []), reply]);
    }
    return [...groups].map(([value, replies]) => ({
      value,
      count: new Set(replies.map((r) => r.account.id)).size,
      authors: [...new Set(replies.map((r) => '@' + r.account.acct))].join(', '),
      mine: replies.some((r) => this.isMine(r)),
    }));
  }

  protected toggleEmojiReply(target: Status, value: string): void {
    if (this.emojiSending()) return;
    const mine = this.groupedReplies(target.id).filter(
      (r) => this.isMine(r) && emojiReply(r) === value,
    );
    if (!mine.length) {
      this.sendEmojiReply(target, value);
      return;
    }
    this.emojiSending.set(true);
    this.emojiError.set(false);
    const chat = this.selected();
    this.subs.push(
      forkJoin(
        mine.map((reply) =>
          this.api.deleteStatus(reply.id).pipe(
            map(() => reply.id),
            catchError(() => of(null)),
          ),
        ),
      ).subscribe((results) => {
        const deleted = new Set(results.filter((id) => id !== null));
        this.messages.update((messages) => messages.filter((m) => !deleted.has(m.id)));
        this.publicStatuses.update(
          (groups) =>
            new Map(
              [...groups].map(([key, messages]) => [
                key,
                messages.filter((m) => !deleted.has(m.id)),
              ]),
            ),
        );
        this.emojiSending.set(false);
        this.emojiError.set(results.some((id) => id === null));
        if (chat?.kind === 'private') this.refreshList({ mastodon: true, bluesky: false });
      }),
    );
  }

  protected startPrivateChat(chat: Chat): void {
    const latest = this.selectedKey() === chat.key ? this.messages().at(-1) : chat.lastStatus;
    const ids = new Set(chat.accounts.map((a) => a.id));
    for (const mention of latest?.mentions ?? []) {
      if (mention.id !== this.auth.account()?.id) ids.add(mention.id);
    }
    const missing = [...ids].filter((id) => !chat.accounts.some((a) => a.id === id));
    if (!missing.length) {
      this.openPrivateChat(chat.accounts);
      return;
    }
    this.startChatError.set(false);
    this.subs.push(
      forkJoin(missing.map((id) => this.api.getAccount(id))).subscribe({
        next: (accounts) => this.openPrivateChat([...chat.accounts, ...accounts]),
        error: () => this.startChatError.set(true),
      }),
    );
  }

  private privateChatKey(accounts: Account[]): string {
    return privateKey(accounts.filter((a) => a.id !== this.auth.account()?.id));
  }

  /** Context is a reply graph, not a recipient boundary. Never import a different DM audience. */
  private belongsToChat(status: Status, chat: Chat): boolean {
    if (chat.kind !== 'private') return status.visibility !== 'direct';
    if (status.visibility !== 'direct') return false;
    const me = this.auth.account()?.id;
    const audience = new Set([status.account.id, ...(status.mentions ?? []).map((m) => m.id)]);
    audience.delete(me ?? '');
    const expected = new Set(chat.accounts.map((a) => a.id).filter((id) => id !== me));
    return audience.size === expected.size && [...audience].every((id) => expected.has(id));
  }

  private openPrivateChat(accounts: Account[]): void {
    if (!accounts.length) return;
    const key = this.privateChatKey(accounts);
    const chat = this.chats().find((c) => c.key === key) ?? {
      key,
      kind: 'private' as const,
      accounts,
      handles: accounts.map((a) => a.acct),
      convIds: [],
      lastStatus: null,
      unread: false,
    };
    if (!this.chats().some((c) => c.key === key)) this.draftChat.set(chat);
    this.prefs.setChatKind('all');
    this.prefs.setChatAudience('all');
    this.showRequests.set(false);
    this.select(chat);
  }

  protected startNamedChat(): void {
    const handle = this.chatWith().trim().replace(/^@/, '');
    if (!handle || this.startingChat()) return;
    this.startingChat.set(true);
    this.startChatError.set(false);
    this.subs.push(
      this.api.resolveReplyMention(handle).subscribe({
        next: (result) => {
          const account = result.accounts.find(
            (a) =>
              a.acct.toLowerCase() === handle.toLowerCase() ||
              qualifiedHandle(a)?.toLowerCase() === handle.toLowerCase(),
          );
          this.startingChat.set(false);
          if (!account) {
            this.startChatError.set(true);
            return;
          }
          this.openPrivateChat([account]);
          this.chatWith.set('');
        },
        error: () => {
          this.startingChat.set(false);
          this.startChatError.set(true);
        },
      }),
    );
  }

  protected sendEmojiReply(target: Status, emoji: string, picker?: MbPopover): void {
    if (this.emojiSending()) return;
    if (this.groupedReplies(target.id).some((r) => this.isMine(r) && emojiReply(r) === emoji)) {
      picker?.close();
      return;
    }
    this.emojiSending.set(true);
    this.emojiError.set(false);
    const chat = this.selected();
    const handles = new Set([
      target.account.acct,
      ...(target.mentions ?? []).map((m) => m.acct),
      ...(chat?.handles ?? []),
    ]);
    if (handles.size > 1) handles.delete(this.auth.account()?.acct ?? '');
    const text = [...handles].map((h) => '@' + h).join(' ') + ' ' + emoji;
    this.subs.push(
      this.api
        .postStatus(text.trim(), {
          inReplyToId: target.id,
          visibility: target.visibility,
        })
        .subscribe({
          next: (status) => {
            this.emojiSending.set(false);
            if (this.selectedKey() === chat?.key) {
              picker?.close();
              this.onReplyPosted(status);
            }
          },
          error: () => {
            this.emojiSending.set(false);
            this.emojiError.set(true);
          },
        }),
    );
  }

  private soundFor(status: Status): void {
    if (!this.sound.enabled()) return;
    const relationship = this.rels().get(status.account.id);
    if (!relationship && status.account.id !== this.auth.account()?.id) {
      this.subs.push(
        this.api
          .relationships([status.account.id])
          .pipe(timeout(15_000))
          .subscribe({
            next: (relationships) => {
              const relationship = relationships.find((r) => r.id === status.account.id);
              if (relationship)
                this.rels.update((map) => new Map(map).set(relationship.id, relationship));
              this.sound.receive(
                status,
                relationship,
                this.auth.account()?.id,
                !!this.moderated()[status.account.id],
              );
            },
            error: () => undefined,
          }),
      );
      return;
    }
    this.sound.receive(
      status,
      relationship,
      this.auth.account()?.id,
      !!this.moderated()[status.account.id],
    );
  }

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
        this.showRequests.set(!!chat.request);
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
      if (
        !this.mastodonAvailable() ||
        (this.prefs.chatAudience() !== 'mutuals' && !this.sound.enabled())
      ) {
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
      const key = this.privateChatKey(c.accounts);
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
        request: convo.status === 'request',
        muted: !!convo.muted,
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
    // Requests are their own list, not mixed into chats or narrowed by filters.
    if (this.showRequests()) {
      return this.chats().filter((c) => c.request);
    }
    return this.chats().filter((c) => {
      if (c.request) {
        return false;
      }
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
   * Private delivery requires explicit mentions of every participant. A self
   * conversation explicitly mentions the signed-in account.
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
    } else if (implicit && implicit !== me?.acct) {
      // Private chats keep every participant's handle, the partner's included.
      // A "mentioned only" post reaches exactly the accounts @-mentioned in its
      // text; the conversation does not deliver it. This used to drop the
      // partner's handle, so private replies from chat reached nobody.
      handles.add(implicit);
    }
    if (me?.acct) {
      handles.delete(me.acct);
      if (chat.kind === 'private' && !handles.size) handles.add(me.acct);
    }
    return handles.size ? [...handles].map((h) => `@${h}`).join(' ') + ' ' : '';
  });

  /** The other person in a 1:1 Mastodon chat, whom every message mentions (see Compose). */
  protected chatPartner = computed(() => {
    const chat = this.selected();
    if (!chat || (chat.kind !== 'private' && chat.kind !== 'public')) return null;
    const others = chat.handles.filter((h) => h !== '' && h !== this.auth.account()?.acct);
    return others.length === 1 ? { handle: others[0], kind: chat.kind } : null;
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
    // Account-scoped preferences can still contain an unavailable old filter.
    if (!this.mastodonAvailable()) {
      if (['private', 'public'].includes(this.prefs.chatKind())) this.prefs.setChatKind('all');
      if (this.prefs.chatAudience() === 'mutuals') this.prefs.setChatAudience('all');
    } else if (!this.bsky.linked() && this.prefs.chatKind() === 'bsky') {
      this.prefs.setChatKind('all');
    }
    this.load();
    this.startPolling();
    if (!this.mastodonAvailable()) return;
    this.openStreams();
  }

  /**
   * The IM feel: streams are live while this page is open, closed on leave.
   * Their connection state drives the Live indicator, and polling (see
   * startPolling) covers whatever time they are not live.
   */
  private openStreams(): void {
    for (const sub of this.streamSubs) sub.unsubscribe();
    this.streamStates = { direct: 'connecting', user: 'connecting' };
    this.noteStreamState('direct', 'connecting');
    this.streamSubs = [
      this.streaming
        .open({ stream: 'direct' }, (state, info) => this.noteStreamState('direct', state, info))
        .subscribe(({ event, payload }) => {
          if (event === 'conversation') {
            this.upsertConversation(payload as Conversation);
            const incoming = (payload as Conversation).last_status;
            if (incoming) this.soundFor(incoming);
          }
        }),
      this.streaming
        .open({ stream: 'user' }, (state, info) => this.noteStreamState('user', state, info))
        .subscribe(({ event, payload }) => {
          if (event === 'notification') {
            const n = payload as MastodonNotification;
            if (n.type === 'mention' && n.status) {
              this.addPublicStatus(n.status, n.account);
              this.soundFor(n.status);
            } else if (n.status && ['favourite', 'reblog', 'update'].includes(n.type)) {
              // Someone liked, boosted or edited a message: the notification
              // carries the status with fresh counts. These used to be dropped,
              // so a like only showed up after a reload.
              this.refreshMessage(n.status);
            }
          } else if (event === 'update' || event === 'status_update') {
            this.maybeAppendToThread(payload as Status);
          } else if (event === 'delete') {
            this.messages.update((list) => list.filter((m) => m.id !== payload));
          }
        }),
    ];
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    this.searchSub?.unsubscribe();
    this.loadSub.unsubscribe();
    this.threadSub?.unsubscribe();
    for (const sub of [...this.subs, ...this.streamSubs]) {
      sub.unsubscribe();
    }
    for (const timer of this.pollTimers) {
      clearInterval(timer);
    }
    if (this.stuckTimer) clearTimeout(this.stuckTimer);
  }

  // ---------------------------------------------------------------- live state

  /** Both streams must be live for the page to be; any one unavailable means never. */
  private noteStreamState(
    which: 'direct' | 'user',
    state: StreamState,
    info?: StreamDiagnostics,
  ): void {
    this.streamStates[which] = state;
    if (info) this.streamInfo.update((all) => ({ ...all, [which]: info }));
    const states = Object.values(this.streamStates);
    const next: StreamState = states.includes('unavailable')
      ? 'unavailable'
      : states.every((s) => s === 'live')
        ? 'live'
        : states.includes('down')
          ? 'down'
          : 'connecting';
    const wasTrying = ['connecting', 'down'].includes(this.liveState());
    const trying = next === 'connecting' || next === 'down';
    this.liveState.set(next);
    if (trying && wasTrying) return; // still the same outage: keep its clock
    if (this.stuckTimer) clearTimeout(this.stuckTimer);
    this.stuckTimer = null;
    this.liveStuck.set(false);
    if (trying) {
      this.notLiveSince = Date.now();
      this.stuckTimer = setTimeout(() => this.liveStuck.set(true), STUCK_AFTER_MS);
    }
  }

  /** The indicator, once it has said Connecting… or Reconnecting… for 5 s. */
  protected openLiveDiagnostics(): void {
    if (this.liveStuck()) this.liveDiagnosticsOpen.set(true);
  }

  /** One line per stream for the diagnostics panel; times are relative to now. */
  protected liveDiagnosticRows = computed(() => {
    this.liveDiagnosticsOpen(); // re-read times each time the panel opens
    const now = Date.now();
    const seconds = (at: number) => Math.max(0, Math.round(Math.abs(at - now) / 1000));
    return (['direct', 'user'] as const).map((which) => {
      const info = this.streamInfo()[which];
      return {
        which,
        state: this.streamStates[which],
        server: info?.server ?? null,
        failures: info?.failures ?? 0,
        closeCode: info?.lastClose?.code ?? null,
        closeReason: info?.lastClose?.reason || null,
        closedAgo: info?.lastClose ? seconds(info.lastClose.at) : null,
        nextIn: info?.nextAttemptAt ? seconds(info.nextAttemptAt) : null,
        pausedFor: info?.pausedUntil ? seconds(info.pausedUntil) : null,
        discoveryFailed: info?.discoveryFailed ?? false,
      };
    });
  });

  protected notLiveSeconds(): number {
    return Math.round((Date.now() - this.notLiveSince) / 1000);
  }

  protected browserOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  /** Reconnect now: drop the backoff and any pause, then reopen both streams. */
  protected reconnectNow(): void {
    this.liveDiagnosticsOpen.set(false);
    this.streaming.retryNow();
    this.liveState.set('off'); // a fresh outage clock for the new attempt
    this.openStreams();
  }

  /**
   * The fallback for when messages cannot arrive by themselves: Mastodon while
   * its streams are not live, and Bluesky always (it has no stream here). The
   * open conversation is re-fetched every 20 s, the chat list every 60 s, and
   * nothing at all while the tab is hidden.
   */
  private startPolling(): void {
    const visible = () => typeof document === 'undefined' || !document.hidden;
    this.pollTimers.push(
      setInterval(() => {
        const chat = this.selected();
        if (!visible() || !chat || this.threadLoading()) return;
        if (chat.kind === 'bsky' || (chat.kind !== 'bot' && this.liveState() !== 'live')) {
          this.refreshThread();
        }
      }, POLL_THREAD_MS),
      setInterval(() => {
        if (!visible() || this.loading() || this.refreshing()) return;
        this.refreshList({ mastodon: true, bluesky: true });
      }, POLL_LIST_MS),
    );
  }

  /** The Refresh button: every chat list and the open conversation, now. */
  protected refreshAll(): void {
    if (this.refreshing() || this.loading()) return;
    this.refreshList({ mastodon: true, bluesky: true });
    this.refreshThread();
  }

  /**
   * Re-fetch the newest page of each list and merge it in. Merging (not
   * replacing) keeps anything paged in with Load more, and the paging cursors
   * are left alone so Load more still continues from the oldest row.
   */
  private refreshList(which: { mastodon: boolean; bluesky: boolean }): void {
    let pending = 0;
    const settle = () => {
      if (--pending <= 0) this.refreshing.set(false);
    };
    this.refreshing.set(true);
    if (which.bluesky && this.bsky.linked()) {
      pending++;
      this.subs.push(
        this.bskyChat
          .listConvos()
          .pipe(timeout(15_000))
          .subscribe({
            next: (list) => {
              const before = this.bskyConvos();
              this.bskyConvos.set(list.convos);
              this.bskyScopeError.set(false);
              this.bskyLoadError.set(false);
              const chat = this.selected();
              if (chat?.kind === 'bsky' && chat.convoId) {
                const prev = before.find((c) => c.id === chat.convoId);
                const next = list.convos.find((c) => c.id === chat.convoId);
                if (next && next.rev !== prev?.rev) this.loadBskyThread(chat);
              }
              settle();
            },
            error: (error: unknown) => {
              this.blueskyLoadFailed(error);
              settle();
            },
          }),
      );
    }
    if (which.mastodon && this.mastodonAvailable()) {
      pending += 2;
      this.api.conversations(undefined, CONVERSATION_PAGE).subscribe({
        next: (convs) => {
          for (const c of convs) {
            if (c.last_status) this.soundFor(c.last_status);
          }
          this.privateConvs.update((list) => mergeConversations(list, convs));
          settle();
        },
        error: settle,
      });
      this.api.notifications(undefined, { types: ['mention'], limit: MENTION_PAGE }).subscribe({
        next: (notifs) => {
          for (const n of notifs) {
            if (n.status) {
              this.addPublicStatus(n.status, n.account);
              this.soundFor(n.status);
            }
          }
          settle();
        },
        error: settle,
      });
    }
    if (!pending) this.refreshing.set(false);
  }

  /** Re-fetch the open conversation, keeping what is shown and updating counts. */
  private refreshThread(): void {
    const chat = this.selected();
    if (!chat || chat.kind === 'bot') return;
    if (chat.kind === 'bsky') {
      this.loadBskyThread(chat);
      return;
    }
    const newest = this.messages().at(-1);
    if (!newest || !this.mastodonAvailable()) return;
    const key = chat.key;
    // The context excludes the status itself, so it is fetched alongside for its
    // own counts. Fresh copies come last, so dedupeSort keeps them.
    forkJoin([this.api.getContext(newest.id), this.api.getStatus(newest.id)]).subscribe({
      next: ([ctx, self]) => {
        if (this.selectedKey() !== key) return;
        const before = this.messages().length;
        this.messages.update((list) =>
          dedupeSort([
            ...list,
            ...[...ctx.ancestors, self, ...ctx.descendants].filter((m) =>
              this.belongsToChat(m, chat),
            ),
          ]),
        );
        if (this.messages().length > before) this.scrollToBottom();
      },
      error: () => undefined,
    });
  }

  /** A status we already show came back with fresh counts or text. */
  private refreshMessage(status: Status): void {
    if (this.messages().some((m) => m.id === status.id)) {
      this.replaceMessage(status);
    }
  }

  load(): void {
    this.loadSub.unsubscribe();
    this.loadSub = new Subscription();
    this.mastodonLoadError.set(false);
    this.bskyLoadError.set(false);
    this.bskyScopeError.set(false);
    this.loading.set(true);
    this.oldestNotifId = null;
    this.oldestConvStatusId = null;
    this.mentionsExhausted = false;
    this.convsExhausted = false;
    this.chatsExhausted.set(false);
    let pending = (this.bsky.linked() ? 1 : 0) + (this.mastodonAvailable() ? 2 : 0);
    if (!pending) this.loading.set(false);
    const done = () => {
      if (--pending === 0) {
        this.loading.set(false);
      }
    };
    if (this.bsky.linked()) {
      this.loadSub.add(
        this.bskyChat
          .listConvos()
          .pipe(timeout(15_000))
          .subscribe({
            next: (list) => {
              this.bskyConvos.set(list.convos);
              this.bskyScopeError.set(false);
              done();
            },
            error: (err: unknown) => {
              this.blueskyLoadFailed(err);
              done();
            },
          }),
      );
    }
    if (!this.mastodonAvailable()) return;
    const failed = (error: unknown) => {
      this.mastodonLoadError.set(true);
      this.diagnostics.error('Conversations', 'load:mastodon-error', error);
      done();
    };
    this.loadSub.add(
      this.api
        .conversations(undefined, CONVERSATION_PAGE)
        .pipe(timeout(15_000))
        .subscribe({
          next: (convs) => {
            this.privateConvs.set(convs);
            this.noteConvPage(convs);
            done();
          },
          error: failed,
        }),
    );
    // Several pages of mentions, one after another: a single page used to be
    // the whole history, and with every notification type in it (likes,
    // boosts, follows) a busy account saw only a handful of mentions.
    const page = (left: number): void => {
      this.loadSub.add(
        this.api
          .notifications(this.oldestNotifId ?? undefined, {
            types: ['mention'],
            limit: MENTION_PAGE,
          })
          .pipe(timeout(15_000))
          .subscribe({
            next: (notifs) => {
              this.ingestNotifPage(notifs);
              if (left > 1 && !this.mentionsExhausted) {
                page(left - 1);
              } else {
                done();
              }
            },
            error: failed,
          }),
      );
    };
    page(INITIAL_MENTION_PAGES);
  }

  /**
   * Fold one page of mention notifications into the public chats and advance
   * the "Load more" cursor. A short page means there is nothing older.
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
    if (notifs.length < MENTION_PAGE) {
      this.mentionsExhausted = true;
    }
    this.chatsExhausted.set(this.mentionsExhausted && this.convsExhausted);
  }

  /** Advance the private-conversation cursor (Mastodon pages by last status id). */
  private noteConvPage(convs: Conversation[]): void {
    const oldest = convs.at(-1)?.last_status?.id;
    if (oldest) {
      this.oldestConvStatusId = oldest;
    }
    if (convs.length < CONVERSATION_PAGE || !oldest) {
      this.convsExhausted = true;
    }
    this.chatsExhausted.set(this.mentionsExhausted && this.convsExhausted);
  }

  /**
   * Page in older private conversations and older mentions together, so both
   * kinds of chat fill out. Returns when both requests have settled.
   */
  loadMoreChats(after?: () => void): void {
    if (!this.mastodonAvailable() || this.loadingMoreChats() || this.chatsExhausted()) {
      return;
    }
    this.loadingMoreChats.set(true);
    let pending = 0;
    const settle = () => {
      if (--pending === 0) {
        this.loadingMoreChats.set(false);
        after?.();
      }
    };
    if (!this.convsExhausted && this.oldestConvStatusId) {
      pending++;
      this.api.conversations(this.oldestConvStatusId, CONVERSATION_PAGE).subscribe({
        next: (convs) => {
          this.privateConvs.update((list) => mergeConversations(list, convs));
          this.noteConvPage(convs);
          settle();
        },
        error: settle,
      });
    }
    if (!this.mentionsExhausted) {
      pending++;
      this.api
        .notifications(this.oldestNotifId ?? undefined, { types: ['mention'], limit: MENTION_PAGE })
        .subscribe({
          next: (notifs) => {
            this.ingestNotifPage(notifs);
            settle();
          },
          error: settle,
        });
    }
    if (!pending) {
      this.loadingMoreChats.set(false);
      this.chatsExhausted.set(true);
    }
  }

  /**
   * "Load older messages" in an open chat: page the list back, then pull the
   * threads of any older conversations that joined this chat.
   */
  protected loadOlderMessages(): void {
    const key = this.selectedKey();
    this.loadMoreChats(() => {
      const chat = this.selected();
      if (!chat || chat.key !== key) return;
      if (chat.kind === 'public') {
        // addPublicStatus already appended them to the open transcript.
        return;
      }
      const shown = new Set(this.messages().map((m) => m.id));
      for (const conv of this.privateConvs()) {
        const last = conv.last_status;
        if (!chat.convIds.includes(conv.id) || !last || shown.has(last.id)) continue;
        this.api.getContext(last.id).subscribe((ctx) => {
          if (this.selectedKey() !== key) return;
          this.messages.update((list) =>
            dedupeSort([
              ...list,
              last,
              ...[...ctx.ancestors, ...ctx.descendants].filter((m) => this.belongsToChat(m, chat)),
            ]),
          );
        });
      }
    });
  }

  select(chat: Chat, anchor: Status | null = chat.lastStatus): void {
    this.threadSub?.unsubscribe();
    this.threadLoading.set(false);
    this.threadError.set(null);
    this.bskySendError.set(false);
    this.bskyActionError.set(null);
    this.reactingTo.set(null);
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
    if (!this.mastodonAvailable() || contextId?.startsWith('bsky:')) {
      this.select(chat);
      return;
    }
    if (!contextId) {
      this.select(chat);
      return;
    }
    this.select(chat, null);
    this.threadLoading.set(true);
    this.threadSub = this.api.getStatus(contextId).subscribe({
      next: (anchor) => {
        if (this.selectedKey() === chat.key)
          this.loadThread(chat, this.belongsToChat(anchor, chat) ? anchor : chat.lastStatus);
      },
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
  protected startChatError = signal(false);
  protected retryStartChat(): void {
    const key = this.pendingOpen();
    const id = this.pendingWith();
    if (key && id) this.draftFor(key, id, this.pendingContext());
  }

  private draftFor(key: string, withId: string, contextId: string | null): void {
    this.startChatError.set(false);
    if (withId.startsWith('bsky:')) {
      this.bskyChat.getConvoForMembers(withId.slice(5)).subscribe({
        next: ({ convo }) => {
          this.bskyConvos.update((rows) => [...rows.filter((r) => r.id !== convo.id), convo]);
          const chat = this.chats().find((c) => c.convoId === convo.id);
          if (chat) {
            this.prefs.setChatKind('all');
            this.selectWithContext(chat, null);
          }
        },
        error: (error: unknown) => {
          this.startChatError.set(true);
          this.blueskyLoadFailed(error);
        },
      });
      return;
    }
    if (!this.mastodonAvailable()) return;
    this.api.getAccount(withId).subscribe({
      next: (account) => {
        // Guard the race: a real row for this key may have arrived while the
        // account request was in flight. If so, prefer it.
        const existing = this.chats().find((c) => c.key === key);
        if (existing) {
          // Widen only. This used to set the saved filter to the chat's own
          // kind, so opening a public chat from a profile left the list on
          // "public" for good, and private chats seemed to disappear.
          const kind = this.prefs.chatKind();
          if (kind !== 'all' && kind !== existing.kind) this.prefs.setChatKind('all');
          this.selectWithContext(existing, contextId);
          return;
        }
        const draft: Chat = {
          key,
          kind:
            this.route.snapshot.queryParamMap.get('visibility') === 'direct' ? 'private' : 'public',
          convIds: [],
          accounts: [account],
          handles: [account.acct],
          lastStatus: null,
          unread: false,
        };
        this.draftChat.set(draft);
        // Make sure the kind filter doesn't hide the freshly drafted row,
        // widening to all rather than narrowing to this one kind.
        if (this.prefs.chatKind() !== 'all' && this.prefs.chatKind() !== draft.kind) {
          this.prefs.setChatKind('all');
        }
        this.selectWithContext(draft, contextId);
      },
      error: () => this.startChatError.set(true),
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
      out = compactContentLinks(stripLeadingMentions(s.content));
      this.strippedCache.set(cacheKey, out);
    }
    return out;
  }

  // ---------------------------------------------------------------- thread

  private loadThread(chat: Chat, anchor: Status | null = chat.lastStatus): void {
    if (!this.mastodonAvailable()) return;
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
    this.threadSub = this.api.getContext(anchor.id).subscribe({
      next: (ctx) => {
        if (this.selectedKey() !== chat.key) return;
        const context = [...ctx.ancestors, ...ctx.descendants].filter((m) =>
          this.belongsToChat(m, chat),
        );
        this.messages.set(dedupeSort([...context, anchor, ...known]));
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
    this.movedToPrivate.set(null);
    // Sent as "mentioned only" from a public chat: it is a private message now,
    // and belongs in the private chat with these people, not in the public one.
    const wentPrivate = chat?.kind === 'public' && status.visibility === 'direct';
    if (!wentPrivate) {
      this.messages.update((list) => dedupeSort([...list, status]));
      this.scrollToBottom();
    }
    if (!chat || chat.kind === 'private' || wentPrivate) {
      // A new direct status starts (or advances) a conversation; refresh the list
      // and follow the selection onto the (possibly new) conversation row.
      this.api.conversations(undefined, CONVERSATION_PAGE).subscribe((convs) => {
        // Merged, so conversations paged in with Load more stay listed.
        this.privateConvs.update((list) => mergeConversations(list, convs));
        const mine = convs.find((c) => c.last_status?.id === status.id);
        if (!mine) return;
        const key = this.privateChatKey(mine.accounts);
        if (wentPrivate) {
          // Open the private chat itself, so its own history loads.
          const row = this.chats().find((c) => c.key === key);
          const kind = this.prefs.chatKind();
          if (kind !== 'all' && kind !== 'private') this.prefs.setChatKind('all');
          if (row) {
            this.select(row);
            this.movedToPrivate.set({ key, name: this.title(row) });
          }
        } else {
          this.selectedKey.set(key);
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
    this.threadError.set(null);
    this.threadSub?.unsubscribe();
    this.bskyMessages.set([]);
    this.threadSub = this.bskyChat
      .getMessages(chat.convoId)
      .pipe(timeout(15_000))
      .subscribe({
        next: ({ messages }) => {
          // Newest-first from the API. Messages deleted for you arrive without
          // text as a deletedMessageView and read "Message deleted".
          const chronological = messages
            .filter((m) => m.text !== undefined || isDeletedMessage(m))
            .reverse();
          this.bskyMessages.set(chronological);
          this.threadLoading.set(false);
          this.scrollToBottom();
          const newest = chronological.filter((m) => !isDeletedMessage(m)).at(-1);
          if (newest) {
            // Best-effort: a failed read-receipt shouldn't surface anywhere.
            this.bskyChat
              .updateRead(chat.convoId!, newest.id)
              .subscribe({ error: () => undefined });
          }
          this.bskyConvos.update((list) =>
            list.map((c) => (c.id === chat.convoId ? { ...c, unreadCount: 0 } : c)),
          );
        },
        error: (error: unknown) => {
          this.threadLoading.set(false);
          this.threadError.set('bluesky');
          this.diagnostics.error('Conversations', 'thread:bluesky-error', error);
        },
      });
  }

  sendBskyMessage(): void {
    const chat = this.selected();
    const text = this.bskyDraft().trim();
    if (!chat?.convoId || !text || this.bskySending()) {
      return;
    }
    this.bskySending.set(true);
    this.bskySendError.set(false);
    this.subs.push(
      this.bskyChat
        .sendMessage(chat.convoId, text)
        .pipe(timeout(15_000))
        .subscribe({
          next: (message) => {
            this.bskySending.set(false);
            if (this.selectedKey() !== chat.key) return;
            if (this.bskyDraft().trim() === text) this.bskyDraft.set('');
            this.bskyMessages.update((list) => [...list, message]);
            // Replying to a message request accepts it, as on bsky.app.
            this.bskyConvos.update((list) =>
              list.map((c) =>
                c.id === chat.convoId ? { ...c, lastMessage: message, status: 'accepted' } : c,
              ),
            );
            if (chat.request) this.leaveRequestsIfEmpty();
            this.scrollToBottom();
          },
          error: (error: unknown) => {
            this.bskySending.set(false);
            if (this.selectedKey() === chat.key) this.bskySendError.set(true);
            this.diagnostics.error('Conversations', 'send:bluesky-error', error);
          },
        }),
    );
  }

  private blueskyLoadFailed(error: unknown): void {
    this.bskyScopeError.set(this.bsky.session()?.authMethod !== 'oauth' && isChatScopeError(error));
    this.bskyLoadError.set(true);
    this.diagnostics.error('Conversations', 'load:bluesky-error', error);
  }

  protected retryThread(): void {
    const chat = this.selected();
    if (chat?.kind === 'bsky') this.loadBskyThread(chat);
  }

  // i18n pages.conversations.requests.show: Requests ({{count}})
  // i18n pages.conversations.requests.showTitle: Message requests from people you haven't chatted with yet
  // i18n pages.conversations.requests.back: ← Chats
  // i18n pages.conversations.requests.empty: No message requests.
  // i18n pages.conversations.requests.badge: Request
  // i18n pages.conversations.requests.notice: {{name}} wants to chat. Accept to move this to your chats, or decline to remove it. Replying also accepts it.
  // i18n pages.conversations.requests.accept: Accept
  // i18n pages.conversations.requests.decline: Decline
  // i18n pages.conversations.bskyMenu.label: Conversation options
  // i18n pages.conversations.bskyMenu.close: Close
  // i18n pages.conversations.bskyMenu.mute: Mute conversation
  // i18n pages.conversations.bskyMenu.unmute: Unmute conversation
  // i18n pages.conversations.bskyMenu.leave: Leave conversation
  // i18n pages.conversations.mutedTitle: Muted: no notifications from this chat
  // i18n pages.conversations.leaveConfirm.message: Leave this conversation? It is removed from your chats. If they write to you again, it comes back.
  // i18n pages.conversations.leaveConfirm.confirm: Leave
  // i18n pages.conversations.declineConfirm.message: Decline this message request? It is removed from your requests. If they write to you again, it comes back.
  // i18n pages.conversations.declineConfirm.confirm: Decline
  // i18n pages.conversations.actionFailed: That didn't work on Bluesky. Try again.

  protected toggleRequests(): void {
    this.showRequests.update((on) => !on);
  }

  /** Back to the chats list once the last request has been dealt with. */
  private leaveRequestsIfEmpty(): void {
    if (!this.bskyRequestCount()) this.showRequests.set(false);
  }

  protected acceptRequest(chat: Chat): void {
    if (!chat.convoId) return;
    this.bskyActionError.set(null);
    this.bskyChat.acceptConvo(chat.convoId).subscribe({
      next: () => {
        this.bskyConvos.update((list) =>
          list.map((c) => (c.id === chat.convoId ? { ...c, status: 'accepted' } : c)),
        );
        this.leaveRequestsIfEmpty();
      },
      error: (error: unknown) => this.bskyActionFailed('accept', error),
    });
  }

  /** Leave a chat, or decline a request (the same call); confirmed first. */
  protected async leaveBskyConvo(chat: Chat): Promise<void> {
    if (!chat.convoId) return;
    const prefix = chat.request ? 'declineConfirm' : 'leaveConfirm';
    const ok = await this.dialogs.confirm(
      this.i18n.translate(`pages.conversations.${prefix}.message`),
      {
        confirmLabel: this.i18n.translate(`pages.conversations.${prefix}.confirm`),
        danger: true,
      },
    );
    if (!ok) return;
    this.bskyActionError.set(null);
    this.bskyChat.leaveConvo(chat.convoId).subscribe({
      next: () => {
        this.bskyConvos.update((list) => list.filter((c) => c.id !== chat.convoId));
        this.moderationChat.set(null);
        if (this.selectedKey() === chat.key) {
          this.selectedKey.set(null);
          this.bskyMessages.set([]);
        }
        this.leaveRequestsIfEmpty();
      },
      error: (error: unknown) => this.bskyActionFailed('leave', error),
    });
  }

  protected toggleBskyMute(chat: Chat): void {
    if (!chat.convoId) return;
    this.bskyActionError.set(null);
    this.bskyChat.setConvoMuted(chat.convoId, !chat.muted).subscribe({
      next: ({ convo }) => {
        this.bskyConvos.update((list) =>
          list.map((c) =>
            c.id === chat.convoId ? { ...c, muted: convo?.muted ?? !chat.muted } : c,
          ),
        );
        this.moderationChat.set(null);
      },
      error: (error: unknown) => this.bskyActionFailed('mute', error),
    });
  }

  // i18n pages.conversations.reactions.add: Add reaction
  // i18n pages.conversations.reactions.chip: {{emoji}} {{count}}
  // i18n pages.conversations.reactions.limit: Bluesky allows only a few reactions from you on one message. Remove one first.
  // i18n pages.conversations.messageMenu: Message options
  // i18n pages.conversations.deleteForMe: Delete for me
  // i18n pages.conversations.deleteConfirm.message: Delete this message for you only? It disappears from your view; the other person keeps their copy.
  // i18n pages.conversations.deletedMessage: Message deleted

  protected bskyIsDeleted(m: BskyMessageView): boolean {
    return isDeletedMessage(m);
  }

  /** Reactions grouped by emoji in first-seen order; `mine` when you made one. */
  protected reactionChips(m: BskyMessageView): ReactionChip[] {
    const me = this.bsky.session()?.did;
    const byValue = new Map<string, ReactionChip>();
    for (const r of m.reactions ?? []) {
      const chip = byValue.get(r.value) ?? { value: r.value, count: 0, mine: false };
      chip.count++;
      chip.mine ||= r.sender.did === me;
      byValue.set(r.value, chip);
    }
    return [...byValue.values()];
  }

  protected toggleReactionPicker(m: BskyMessageView): void {
    this.reactingTo.update((id) => (id === m.id ? null : m.id));
  }

  /** From the picker: Bluesky takes one native emoji, not a `:shortcode:`. */
  protected pickReaction(m: BskyMessageView, value: string): void {
    this.reactingTo.set(null);
    if (value.startsWith(':')) return;
    const mine = this.reactionChips(m).some((c) => c.value === value && c.mine);
    if (!mine) this.setReaction(m, value, true);
  }

  protected toggleReaction(m: BskyMessageView, chip: ReactionChip): void {
    this.setReaction(m, chip.value, !chip.mine);
  }

  private setReaction(m: BskyMessageView, value: string, on: boolean): void {
    const convoId = this.selected()?.convoId;
    if (!convoId) return;
    this.bskyActionError.set(null);
    this.bskyChat.setReaction(convoId, m.id, value, on).subscribe({
      next: ({ message }) => this.replaceBskyMessage(message),
      error: (error: unknown) => {
        if (xrpcErrorCode(error) === 'ReactionLimitReached') {
          this.bskyActionError.set('pages.conversations.reactions.limit');
          return;
        }
        this.bskyActionFailed('reaction', error);
      },
    });
  }

  protected async deleteForMe(m: BskyMessageView): Promise<void> {
    const convoId = this.selected()?.convoId;
    if (!convoId) return;
    const ok = await this.dialogs.confirm(
      this.i18n.translate('pages.conversations.deleteConfirm.message'),
      { confirmLabel: this.i18n.translate('pages.conversations.deleteForMe'), danger: true },
    );
    if (!ok) return;
    this.bskyActionError.set(null);
    this.bskyChat.deleteMessageForSelf(convoId, m.id).subscribe({
      next: (deleted) =>
        this.replaceBskyMessage({ ...deleted, $type: BSKY_DELETED_MESSAGE, text: undefined }),
      error: (error: unknown) => this.bskyActionFailed('delete', error),
    });
  }

  private replaceBskyMessage(updated: BskyMessageView): void {
    this.bskyMessages.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
  }

  private bskyActionFailed(action: string, error: unknown): void {
    this.bskyActionError.set('pages.conversations.actionFailed');
    this.diagnostics.error('Conversations', `${action}:bluesky-error`, error);
  }

  // i18n pages.conversations.loadError.mastodon: Could not load all Mastodon conversations. Try again.
  // i18n pages.conversations.loadError.bluesky: Could not load Bluesky conversations. Try again.
  // i18n pages.conversations.threadError.bluesky: Could not load Bluesky messages.
  // i18n pages.conversations.sendError.bluesky: Could not send your Bluesky message. Your draft is still here; check the conversation before retrying.
  // i18n pages.conversations.retry: Retry

  // ---------------------------------------------------------------- read state

  // i18n pages.conversations.markUnread: Mark as unread
  // i18n pages.conversations.remove: Remove from this list
  // i18n pages.conversations.removeConfirm: Remove this conversation from your list? The messages are not deleted, and a new message brings it back.
  // i18n pages.conversations.convActionFailed: That did not work. Try again.

  /**
   * Mark a Mastodon private chat unread and step out of it, since reading it
   * here would mark it read again straight away.
   */
  protected markUnread(chat: Chat): void {
    if (chat.kind !== 'private' || !chat.convIds.length) return;
    forkJoin(chat.convIds.map((id) => this.api.markConversationUnread(id))).subscribe({
      next: () => {
        this.privateConvs.update((list) =>
          list.map((c) => (chat.convIds.includes(c.id) ? { ...c, unread: true } : c)),
        );
        if (this.selectedKey() === chat.key) this.selectedKey.set(null);
      },
      error: () => this.convActionError.set(true),
    });
  }

  /** Remove a Mastodon private chat from the list (`DELETE /conversations/:id`). */
  protected async removeChat(chat: Chat): Promise<void> {
    if (chat.kind !== 'private' || !chat.convIds.length) return;
    if (!(await this.dialogs.confirm(this.i18n.translate('pages.conversations.removeConfirm'))))
      return;
    forkJoin(chat.convIds.map((id) => this.api.removeConversation(id))).subscribe({
      next: () => {
        this.privateConvs.update((list) => list.filter((c) => !chat.convIds.includes(c.id)));
        if (this.selectedKey() === chat.key) this.selectedKey.set(null);
      },
      error: () => this.convActionError.set(true),
    });
  }

  protected convActionError = signal(false);

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
    if (
      chat?.kind === 'private' &&
      chat.key === this.privateChatKey(conv.accounts) &&
      conv.last_status
    ) {
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
    if (!this.belongsToChat(status, chat)) return;
    if (!inThread && !isEdit) {
      return;
    }
    this.messages.update((list) =>
      isEdit ? list.map((m) => (m.id === status.id ? status : m)) : dedupeSort([...list, status]),
    );
    if (chat.kind === 'public') this.addPublicStatus(status, status.account, chat.key);
    else if (chat.kind === 'private') {
      this.privateConvs.update((rows) =>
        rows.map((c) =>
          chat.convIds.includes(c.id) &&
          (!c.last_status || status.created_at > c.last_status.created_at)
            ? { ...c, last_status: status }
            : c,
        ),
      );
    }
    if (!isEdit) this.soundFor(status);
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
    this.moderateParticipant(acc, 'muted');
  }

  blockParticipant(acc: Account): void {
    this.moderateParticipant(acc, 'blocked');
  }

  protected reportParticipant(acc: Account): void {
    this.moderationChat.set(null);
    this.reportTarget.set(acc);
  }

  private moderateParticipant(acc: Account, action: 'muted' | 'blocked'): void {
    if (this.moderationBusy()) return;
    this.moderationBusy.set(true);
    this.moderationError.set(false);
    const request =
      action === 'muted'
        ? this.api.muteAccount(acc.id, this.muteDuration || undefined)
        : this.api.block(acc.id);
    this.subs.push(
      request.subscribe({
        next: () => {
          this.moderated.update((m) => ({ ...m, [acc.id]: action }));
          this.moderationBusy.set(false);
          this.moderationChat.set(null);
        },
        error: () => {
          this.moderationBusy.set(false);
          this.moderationError.set(true);
        },
      }),
    );
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

function isDeletedMessage(m: BskyMessageView): boolean {
  return m.$type === BSKY_DELETED_MESSAGE;
}

/** Newer rows win: a conversation re-fetched by refresh replaces its stale copy. */
function mergeConversations(current: Conversation[], incoming: Conversation[]): Conversation[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return [...byId.values()];
}

function dedupeSort(statuses: Status[]): Status[] {
  const byId = new Map<string, Status>();
  for (const s of statuses) {
    byId.set(s.id, s);
  }
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// i18n pages.conversations.chatWith: Chat with
// i18n pages.conversations.chatHandle: @person@server
// i18n pages.conversations.startPrivate: Start Private Chat
// i18n pages.conversations.moderate: Moderate…
// i18n pages.conversations.moderationTitle: Conversation options
// i18n pages.conversations.moderationIntro: Choose what would help. A temporary mute can give you a break without ending contact.
// i18n pages.conversations.muteExplanation: Mute hides their messages and notifications. They are not notified.
// i18n pages.conversations.blockExplanation: Block prevents interaction until you unblock this person in your account settings.
// i18n pages.conversations.reportExplanation: Report asks server moderators to review a problem. You can explain what happened before submitting.
// i18n pages.conversations.muteHour: For one hour
// i18n pages.conversations.muteDay: For one day
// i18n pages.conversations.muteWeek: For one week
// i18n pages.conversations.muteForever: Until I unmute
// i18n pages.conversations.moderationFailed: That action failed. Please try again.
// i18n pages.conversations.soundOn: Sound on · mutuals only
// i18n pages.conversations.soundOff: Enable sound · mutuals only
// i18n pages.conversations.soundHint: At most one sound every 10 seconds for new messages from people you follow who follow you back.
// i18n pages.conversations.emojiFailed: Could not update this reaction. Please try again.
// i18n pages.conversations.emojiReply: React with emoji
// i18n pages.conversations.emojiClose: Close emoji picker

// i18n pages.conversations.muted: Muted
// i18n pages.conversations.blocked: Blocked

// i18n pages.conversations.bskyModerationExplanation: Mute stops notifications for this conversation. Leaving removes the conversation from your list.

// i18n pages.conversations.emojiReaction: Reaction {{emoji}}: {{count}}
