/**
 * ElizaService — the single delegate both feed providers route Eliza-directed
 * work to. Fully client-side: no HTTP, no clock beyond `Date.now`, so it behaves
 * identically in anonymous mode and against the real mastodon.social backend.
 *
 * Sprint 1 scope: identity + the reply brain. It answers three questions the
 * interception seams need —
 *   - "is this id / handle Eliza?"      → {@link owns}
 *   - "give me Eliza's account/posts"   → {@link account}, {@link timeline}
 *   - "what does Eliza say to this?"    → {@link reply}
 * Later sprints add the local post/DM stores and the follow flag; those hang off
 * this same service so there is exactly one brain behind every door.
 */

import { inject, Injectable, Injector } from '@angular/core';
import { Account, Relationship, Status } from '../models';
import { elizaReply } from './eliza-engine';
import { ElizaFollow } from './eliza-follow';
import { ConversationStore } from '../chat/conversation-store';
import { LocalPostStore } from './local-post-store';
import {
  ELIZA_ACCT,
  ELIZA_ID,
  ELIZA_PEER,
  elizaAccount,
  elizaTimeline,
  isElizaId,
} from './eliza-identity';

@Injectable({ providedIn: 'root' })
export class ElizaService {
  private readonly followState = inject(ElizaFollow);
  // Resolved lazily to break the cycle: the post/DM stores inject ElizaService.
  private readonly injector = inject(Injector);

  /** Reactive: does the viewer follow Eliza? Gates her DM thread and replies. */
  readonly following = this.followState.following;

  /** Rolling seed so a live conversation varies between equally-valid replies.
   *  Deterministic tests call {@link replyWithSeed} instead of relying on this. */
  private seed = 0;

  /** True if `id` is Eliza's account or one of her post ids. */
  owns(id: string | null | undefined): boolean {
    return isElizaId(id);
  }

  /** True if a handle refers to Eliza (`eliza`, `@eliza`, `eliza@…`). */
  ownsHandle(handle: string | null | undefined): boolean {
    if (!handle) return false;
    const normalized = handle.trim().replace(/^@/, '').split('@')[0].toLowerCase();
    return normalized === ELIZA_ACCT;
  }

  /** Eliza's account id (`eliza:self`). */
  get id(): string {
    return ELIZA_ID;
  }

  /** A fresh copy of Eliza's synthetic account. */
  account(): Account {
    return elizaAccount();
  }

  /** Eliza's timeline posts, newest first with pinned hoisted. */
  timeline(now: number = Date.now()): Status[] {
    return elizaTimeline(now);
  }

  /** The viewer ⇄ Eliza relationship, shaped like a real Mastodon one. */
  relationship(): Relationship {
    return this.followState.relationship();
  }

  /** Follow Eliza (browser-local; never touches a real following list). */
  follow(): void {
    this.followState.follow();
  }

  /** Unfollow Eliza, wiping the whole practice relationship: your local practice
   *  posts and the chat. Ending the follow ends the simulation cleanly rather
   *  than leaving orphaned content. */
  unfollow(): void {
    this.followState.unfollow();
    this.injector.get(LocalPostStore).clear();
    this.injector.get(ConversationStore).clearPeer(ELIZA_PEER);
  }

  /** Re-read follow state after an account switch changes the storage scope. */
  refresh(): void {
    this.followState.refresh();
  }

  /** Eliza's reply to one user line, advancing the live-conversation seed. */
  reply(text: string): string {
    return elizaReply(text, this.seed++);
  }

  /** Deterministic reply for a fixed seed (used by callers that need to
   *  reproduce output, and by tests). Does not advance the rolling seed. */
  replyWithSeed(text: string, seed: number): string {
    return elizaReply(text, seed);
  }
}
