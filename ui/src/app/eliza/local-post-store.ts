/**
 * The viewer's own posts — stored only in the browser, never sent to Mastodon.
 *
 * Anonymous visitors (and anyone practising with Eliza) can compose top-level
 * posts and reply to Eliza's posts. There's no real account to post to, so each
 * post is kept here as a full {@link Status} and rendered in the Home feed
 * alongside Eliza's timeline. Every local post draws an immediate reply from
 * Eliza — prefixed with the "this doesn't really post to Mastodon" reminder —
 * so the practice space always answers back.
 *
 * State is per-account via {@link scopedKey}, matching the other anonymous
 * stores, so a signed-in account and an anonymous visitor keep separate practice
 * feeds. Ids live under the reserved `local:` / `eliza:reply:` namespaces so
 * they can never collide with real Mastodon ids (see {@link isElizaId}).
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { Account, Status } from '../models';
import { scopedKey } from '../account-scope';
import { Auth } from '../auth';

const BASE_KEY = 'mockingbird_local_posts';
const STATE_VERSION = 1;

interface LocalPostState {
  version: typeof STATE_VERSION;
  posts: Status[];
}

function storageKey(): string {
  return scopedKey(BASE_KEY);
}

function loadState(): LocalPostState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey()) ?? 'null',
    ) as Partial<LocalPostState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.posts)) {
      return { version: STATE_VERSION, posts: [] };
    }
    return {
      version: STATE_VERSION,
      posts: parsed.posts.filter(
        (s): s is Status => typeof s?.id === 'string' && typeof s.account?.username === 'string',
      ),
    };
  } catch {
    return { version: STATE_VERSION, posts: [] };
  }
}

/** Escape user text for safe embedding in the minimal HTML `status-card` renders. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Wrap plain text in paragraph HTML, preserving blank-line breaks. */
function toHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

let counter = 0;
/** A unique, sortable-ish id under a reserved namespace. */
function freshId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now()}-${counter}`;
}

/** Build a renderable {@link Status} from plain text authored by `account`. */
function buildStatus(
  id: string,
  account: Account,
  text: string,
  createdAt: string,
  inReplyToId: string | null,
): Status {
  return {
    provider: 'anonymous-mastodon',
    id,
    created_at: createdAt,
    edited_at: null,
    content: toHtml(text),
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account,
    reblog: null,
    quote: null,
    in_reply_to_id: inReplyToId,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    language: 'en',
    media_attachments: [],
    application: { name: 'Mawkingbird (practice)' },
    mentions: [],
  };
}

@Injectable({ providedIn: 'root' })
export class LocalPostStore {
  private readonly auth = inject(Auth);

  private readonly state = signal<LocalPostState>(loadState());

  /** All local posts (the viewer's and Eliza's replies), newest first. */
  readonly posts = computed(() =>
    [...this.state().posts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  );

  /** Re-read from storage after an account switch changes the scope. */
  refresh(): void {
    this.state.set(loadState());
  }

  /**
   * Assemble a thread for a local/Eliza post: the post itself, its ancestor
   * chain (walking `in_reply_to_id` up), and its direct descendants (replies).
   * The corpus is the viewer's practice posts plus Eliza's timeline, so both a
   * timeline tip and a practice reply can open as a thread. Returns null when
   * the id isn't among them.
   */
  thread(
    id: string,
    elizaTimeline: Status[],
  ): { status: Status; ancestors: Status[]; descendants: Status[] } | null {
    const corpus = [...elizaTimeline, ...this.state().posts];
    const byId = new Map(corpus.map((s) => [s.id, s]));
    const status = byId.get(id);
    if (!status) {
      return null;
    }
    const ancestors: Status[] = [];
    let cursor = status.in_reply_to_id ? byId.get(status.in_reply_to_id) : undefined;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      ancestors.unshift(cursor);
      cursor = cursor.in_reply_to_id ? byId.get(cursor.in_reply_to_id) : undefined;
    }
    const descendants = corpus
      .filter((s) => s.in_reply_to_id === id)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    return { status, ancestors, descendants };
  }

  /** Post a new top-level local status; Eliza replies to it immediately.
   *  Returns the viewer's status (the reply is appended to the store too). */
  compose(text: string): Status | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    const account = this.auth.account();
    if (!account) {
      return null;
    }
    const mine = buildStatus(freshId('local:'), account, trimmed, new Date().toISOString(), null);
    this.append([mine]);
    return mine;
  }

  /**
   * Reply to an existing post (Eliza's or one of your own).
   *
   * Eliza used to answer every one of these automatically. She no longer does:
   * an ELIZA reflection on a practice post was noise attached to something the
   * user wrote for their own sake, and it made the practice feed feel like a
   * conversation nobody had asked to have. Her chat is where she talks.
   */
  reply(inReplyToId: string, text: string): Status | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    const account = this.auth.account();
    if (!account) {
      return null;
    }
    const mine = buildStatus(
      freshId('local:'),
      account,
      trimmed,
      new Date().toISOString(),
      inReplyToId,
    );
    this.append([mine]);
    return mine;
  }

  /** Remove a local post (and any local replies to it). */
  delete(id: string): void {
    this.state.update((s) => {
      const posts = s.posts.filter((p) => p.id !== id && p.in_reply_to_id !== id);
      const next = { ...s, posts };
      this.persist(next);
      return next;
    });
  }

  /** Wipe the whole practice feed — used when the viewer unfollows Eliza. */
  clear(): void {
    const next: LocalPostState = { version: STATE_VERSION, posts: [] };
    this.persist(next);
    this.state.set(next);
  }

  private append(newPosts: Status[]): void {
    this.state.update((s) => {
      const next = { ...s, posts: [...s.posts, ...newPosts] };
      this.persist(next);
      return next;
    });
  }

  private persist(state: LocalPostState): void {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch {
      // Storage unavailable: keep the in-memory copy so the session still works.
    }
  }
}
