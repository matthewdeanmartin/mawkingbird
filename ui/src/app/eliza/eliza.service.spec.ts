import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ElizaService } from './eliza.service';
import { LocalPostStore } from './local-post-store';
import { ConversationStore } from '../chat/conversation-store';
import { Auth } from '../auth';
import { ELIZA_ID, ELIZA_PEER } from './eliza-identity';
import { ELIZA_POSTS } from './eliza-content';

describe('ElizaService', () => {
  let eliza: ElizaService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    eliza = TestBed.inject(ElizaService);
  });

  it('owns its own ids but not real ones', () => {
    expect(eliza.owns(ELIZA_ID)).toBe(true);
    expect(eliza.owns('eliza:post:welcome')).toBe(true);
    expect(eliza.owns('42')).toBe(false);
  });

  it('recognises her handle in several forms', () => {
    expect(eliza.ownsHandle('eliza')).toBe(true);
    expect(eliza.ownsHandle('@eliza')).toBe(true);
    expect(eliza.ownsHandle('eliza@mastodon.social')).toBe(true);
    expect(eliza.ownsHandle('steve')).toBe(false);
    expect(eliza.ownsHandle(null)).toBe(false);
  });

  it('exposes her account and full timeline', () => {
    expect(eliza.account().id).toBe(ELIZA_ID);
    expect(eliza.timeline().length).toBe(ELIZA_POSTS.length);
  });

  it('replies to messages and advances its own seed', () => {
    // Two identical inputs should not be forced to match (rolling seed varies).
    const replies = new Set([
      eliza.reply('i need a break'),
      eliza.reply('i need a break'),
      eliza.reply('i need a break'),
    ]);
    expect(replies.size).toBeGreaterThan(0);
  });

  it('replyWithSeed is deterministic and does not advance the rolling seed', () => {
    expect(eliza.replyWithSeed('i need a break', 3)).toBe(eliza.replyWithSeed('i need a break', 3));
  });

  it('following her is idempotent and notifies nothing', () => {
    // She used to push a welcome into a local notification inbox. Both the
    // inbox and every notification she generated are gone: she talks in chat,
    // and nowhere else.
    eliza.follow();
    eliza.follow();

    expect(eliza.following()).toBe(true);
  });

  it('unfollowing wipes local posts and her conversations', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const posts = TestBed.inject(LocalPostStore);
    const conversations = TestBed.inject(ConversationStore);

    eliza.follow();
    posts.compose('practice post');
    const conversation = conversations.currentFor(ELIZA_PEER);
    conversations.append(conversation.id, { from: 'me', text: 'hello' });
    expect(posts.posts().length).toBeGreaterThan(0);
    expect(conversations.forPeer(ELIZA_PEER).length).toBeGreaterThan(0);

    eliza.unfollow();

    expect(posts.posts()).toEqual([]);
    expect(conversations.forPeer(ELIZA_PEER)).toEqual([]);
  });
});
