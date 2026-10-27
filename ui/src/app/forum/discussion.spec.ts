import { describe, expect, it } from 'vitest';
import { Status } from '../models';
import { post, reply, account } from '../testing/forum-fixtures';
import {
  compareSummaries,
  Discussion,
  discussionKey,
  filterSummaries,
  findCandidates,
  instanceOf,
  isDiscussion,
  mergePosts,
  summarize,
} from './discussion';

function discussion(posts: Status[], overrides: Partial<Discussion> = {}): Discussion {
  return {
    key: discussionKey(posts[0]),
    anchor: posts[0],
    partial: false,
    posts,
    treeLoaded: true,
    ...overrides,
  };
}

describe('isDiscussion', () => {
  const root = post('1', 'a');

  it('needs two posts by two people', () => {
    expect(isDiscussion(discussion([root, reply('2', 'b', root)]))).toBe(true);
  });

  it('is not a lone post, even one asking a question', () => {
    const asked = post('1', 'a', { content: '<p>Anyone?</p>', replies_count: 3 });
    expect(isDiscussion(discussion([asked]))).toBe(false);
  });

  it('is not a tweet storm', () => {
    const second = reply('2', 'a', root);
    expect(isDiscussion(discussion([root, second, reply('3', 'a', second)]))).toBe(false);
  });
});

describe('discussionKey', () => {
  it('prefers the ActivityPub uri, which is the same on every server', () => {
    expect(discussionKey(post('1', 'a'))).toBe('https://origin.example/statuses/1');
    expect(discussionKey(post('1', 'a', { uri: undefined, url: 'https://u.example/1' }))).toBe(
      'https://u.example/1',
    );
    expect(discussionKey(post('9', 'a', { uri: undefined }))).toBe('9');
  });
});

describe('mergePosts', () => {
  it('adds new posts in time order, unwraps boosts and ignores duplicates', () => {
    const root = post('1', 'a');
    const later = reply('3', 'c', root);
    const boost = post('90', 'z', { reblog: reply('2', 'b', root) });
    const merged = mergePosts(discussion([root]), [later, boost, root]);
    expect(merged.posts.map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('returns the same object when nothing is new', () => {
    const start = discussion([post('1', 'a')]);
    expect(mergePosts(start, [post('1', 'a')])).toBe(start);
  });
});

describe('instanceOf', () => {
  it('reads the host from a remote acct, or from the profile URL for a local one', () => {
    expect(instanceOf(account('1', 'u1@Remote.Example'))).toBe('remote.example');
    expect(instanceOf(account('1'))).toBe('home.example');
  });
});

describe('summarize', () => {
  const root = post('1', 'a', {
    content: '<p>Which editor?</p>',
    tags: [{ name: 'Vim', url: '' }],
  });
  const r1 = reply('2', 'b', root, { tags: [{ name: 'emacs', url: '' }] });
  const r2 = reply('3', 'me', r1);
  const r3 = reply('4', 'b', r2);
  const all = discussion([root, r1, r2, r3]);

  it('puts the starter first, then people by how much they posted', () => {
    const summary = summarize(all, 'me', new Set());
    expect(summary.participants.map((p) => [p.account.id, p.posts])).toEqual([
      ['a', 1],
      ['b', 2],
      ['me', 1],
    ]);
    expect(summary.latestAt).toBe(r3.created_at);
    expect(summary.hashtags).toEqual(['vim', 'emacs']);
    expect(summary.question).toBe(true);
  });

  it('counts friends replies, but not the root', () => {
    expect(summarize(all, 'me', new Set(['a', 'b'])).friendReplyCount).toBe(2);
  });

  it('takes the server reply count when it knows of more than were seen', () => {
    const counted = discussion([{ ...root, replies_count: 12 }, r1]);
    expect(summarize(counted, null, new Set()).replyCount).toBe(12);
    expect(summarize(all, null, new Set()).replyCount).toBe(3);
  });

  it('tells starting from joining', () => {
    expect(summarize(all, 'me', new Set())).toMatchObject({ iStarted: false, iJoined: true });
    expect(summarize(all, 'a', new Set())).toMatchObject({ iStarted: true, iJoined: false });
    expect(summarize(all, 'x', new Set())).toMatchObject({ iStarted: false, iJoined: false });
  });
});

describe('filterSummaries and compareSummaries', () => {
  const asked = post('1', 'friend', { content: '<p>Why?</p>' });
  const mine = post('2', 'me');
  const other = post('3', 'x');
  const summaries = [
    summarize(discussion([asked, reply('11', 'x', asked)]), 'me', new Set(['friend'])),
    summarize(discussion([mine, reply('12', 'x', mine)]), 'me', new Set(['friend'])),
    summarize(
      discussion([other, reply('13', 'me', other), reply('14', 'friend', other)]),
      'me',
      new Set(['friend']),
    ),
  ];
  const ids = (list: typeof summaries) => list.map((s) => s.discussion.anchor.id);

  it('cuts the list five ways', () => {
    expect(ids(filterSummaries(summaries, 'talk'))).toEqual(['1', '2', '3']);
    expect(ids(filterSummaries(summaries, 'asked'))).toEqual(['1']);
    expect(ids(filterSummaries(summaries, 'friends'))).toEqual(['1']);
    expect(ids(filterSummaries(summaries, 'mine'))).toEqual(['2']);
    expect(ids(filterSummaries(summaries, 'joined'))).toEqual(['3']);
  });

  it('sorts Recent by latest activity and Popular by friends replies first', () => {
    expect(ids([...summaries].sort(compareSummaries('recent')))).toEqual(['3', '2', '1']);
    expect(ids([...summaries].sort(compareSummaries('popular')))[0]).toBe('3');
  });
});

describe('findCandidates', () => {
  it('ignores lone posts that nobody answered, question or not', () => {
    expect(findCandidates([post('1', 'a', { content: '<p>Why?</p>' })], null, new Set())).toEqual(
      [],
    );
  });

  it('groups replies under the top-most sampled post, so a thread costs one call', () => {
    const root = post('1', 'a', { replies_count: 2 });
    const r1 = reply('2', 'b', root);
    const r2 = reply('3', 'c', r1);
    const candidates = findCandidates([r2, root, r1], null, new Set());
    expect(candidates).toHaveLength(1);
    expect(candidates[0].probe.id).toBe('1');
    expect(candidates[0].members.map((m) => m.id).sort()).toEqual(['1', '2', '3']);
  });

  it('probes a reply whose parent was not sampled', () => {
    const orphan = reply('5', 'b', post('4', 'a'));
    expect(findCandidates([orphan], null, new Set())[0].probe.id).toBe('5');
  });

  it('skips what an earlier probe already explained', () => {
    const orphan = reply('5', 'b', post('4', 'a'));
    expect(findCandidates([orphan], null, new Set(['5']))).toEqual([]);
  });

  it('ranks my conversations first, then replies to others, and sinks storms', () => {
    const storm = post('1', 's', { replies_count: 1 });
    const stormNext = reply('2', 's', storm);
    const chatty = reply('3', 'b', post('30', 'c'));
    const busy = post('4', 'd', { replies_count: 5 });
    const mention = reply('5', 'e', post('50', 'me'));
    const order = findCandidates([storm, stormNext, chatty, busy, mention], 'me', new Set()).map(
      (c) => c.probe.id,
    );
    expect(order).toEqual(['5', '3', '4', '1']);
  });

  it('unwraps boosts', () => {
    const boosted = post('7', 'b', { replies_count: 2 });
    const wrapper = post('70', 'z', { reblog: boosted });
    expect(findCandidates([wrapper], null, new Set())[0].probe.id).toBe('7');
  });
});
