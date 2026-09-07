import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalPostStore } from './local-post-store';
import { Auth } from '../auth';
import { ELIZA_ID } from './eliza-identity';

describe('LocalPostStore', () => {
  let store: LocalPostStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    // An identity to author posts with — anonymous is the primary audience.
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    store = TestBed.inject(LocalPostStore);
  });

  it('starts empty', () => {
    expect(store.posts()).toEqual([]);
  });

  it('compose stores only the viewer’s post', () => {
    // Eliza used to answer every practice post automatically. She does not any
    // more: an ELIZA reflection attached to something you wrote for your own
    // sake was noise, and it made the practice feed read as a conversation
    // nobody asked to have. She talks in chat instead.
    const mine = store.compose('hello world');
    expect(mine).not.toBeNull();

    const posts = store.posts();
    expect(posts.length).toBe(1);
    expect(posts[0].id).toBe(mine!.id);
    expect(posts.some((p) => p.account.id === ELIZA_ID)).toBe(false);
  });

  it("the viewer's post uses a local: id", () => {
    const mine = store.compose('practice');
    expect(mine!.id.startsWith('local:')).toBe(true);
  });

  it('reply threads under the target without drawing an answer', () => {
    const mine = store.reply('eliza:post:welcome', 'nice to meet you');
    expect(mine!.in_reply_to_id).toBe('eliza:post:welcome');

    expect(store.posts().some((p) => p.in_reply_to_id === mine!.id)).toBe(false);
  });

  it('ignores blank input', () => {
    expect(store.compose('   ')).toBeNull();
    expect(store.posts()).toEqual([]);
  });

  it('persists across a refresh (localStorage)', () => {
    store.compose('remember me');
    const fresh = TestBed.inject(LocalPostStore);
    fresh.refresh();
    expect(fresh.posts().length).toBe(1);
  });

  it('delete removes a post and its replies', () => {
    const mine = store.compose('delete me');
    store.reply(mine!.id, 'a follow-up');
    expect(store.posts().length).toBe(2);
    store.delete(mine!.id);
    expect(store.posts().length).toBe(0);
  });

  it('sorts newest first', () => {
    store.compose('first');
    store.compose('second');
    const times = store.posts().map((p) => Date.parse(p.created_at));
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });

  it('assembles a thread with the post and its descendants', () => {
    const mine = store.compose('a practice post')!;
    const follow = store.reply(mine.id, 'and another thing')!;
    const built = store.thread(mine.id, []);
    expect(built).not.toBeNull();
    expect(built!.status.id).toBe(mine.id);
    expect(built!.descendants.map((d) => d.id)).toContain(follow.id);
  });

  it('includes an Eliza timeline post in the thread corpus', () => {
    const timelinePost = { id: 'eliza:post:welcome' } as never;
    // Reply to a timeline post, then thread from that timeline post.
    store.reply('eliza:post:welcome', 'hi Eliza');
    const built = store.thread('eliza:post:welcome', [timelinePost]);
    expect(built).not.toBeNull();
    expect(built!.descendants.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown id', () => {
    expect(store.thread('local:nope', [])).toBeNull();
  });
});
