import { describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import {
  activityMix,
  intervalParts,
  isLinkOnly,
  postingRhythm,
  postingStyle,
} from './account-signals';

const START = Date.parse('2026-11-01T00:00:00Z');
let seq = 0;

function post(minutesAfterStart: number, extra: Partial<Status> = {}): Status {
  seq += 1;
  return {
    id: `p${seq}`,
    created_at: new Date(START + minutesAfterStart * 60_000).toISOString(),
    content: '<p>Something I wrote myself, at some length.</p>',
    account: { id: 'me' },
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    card: null,
    ...extra,
  } as Status;
}

const boost = (m: number) => post(m, { reblog: post(m - 5) });
const reply = (m: number) => post(m, { in_reply_to_id: 'x', in_reply_to_account_id: 'them' });
const threadPart = (m: number) => post(m, { in_reply_to_id: 'y', in_reply_to_account_id: 'me' });
const link = (m: number) =>
  post(m, {
    content: '<p>https://example.com/story</p>',
    card: { url: 'https://example.com/story' } as never,
  });

describe('activityMix', () => {
  it('separates new posts, thread parts, replies, boosts and link-only posts', () => {
    const mix = activityMix([post(0), threadPart(1), reply(2), boost(3), boost(4), link(5)]);
    expect(mix).toEqual({ total: 6, posts: 2, threadParts: 1, replies: 1, boosts: 2, linkOnly: 1 });
  });

  it('counts a link with real commentary as the person’s own words', () => {
    const commented = post(0, {
      content:
        '<p>This is the clearest explanation of the change I have read so far: https://example.com/x</p>',
    });
    expect(isLinkOnly(commented)).toBe(false);
    expect(isLinkOnly(link(0))).toBe(true);
    expect(isLinkOnly(post(0))).toBe(false);
  });
});

describe('postingStyle', () => {
  const many = (make: (m: number) => Status, n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => make(from + i * 37));

  it('needs enough statuses to say anything', () => {
    expect(postingStyle(activityMix(many(post, 5)))).toBeNull();
  });

  it('names the dominant way of posting', () => {
    expect(postingStyle(activityMix([...many(boost, 12), ...many(post, 10, 900)]))).toBe('curator');
    expect(postingStyle(activityMix([...many(reply, 12), ...many(post, 10, 900)]))).toBe(
      'conversationalist',
    );
    expect(postingStyle(activityMix(many(link, 22)))).toBe('linkSharer');
    expect(postingStyle(activityMix([...many(threadPart, 8), ...many(post, 14, 900)]))).toBe(
      'threadWriter',
    );
    expect(postingStyle(activityMix(many(post, 22)))).toBe('broadcaster');
    expect(
      postingStyle(
        activityMix([...many(post, 10), ...many(reply, 6, 900), ...many(boost, 8, 2000)]),
      ),
    ).toBe('balanced');
  });
});

describe('postingRhythm', () => {
  const daily = (n: number, from = 0) => Array.from({ length: n }, (_, i) => post(from + i * 1440));

  it('does not judge a handful of posts', () => {
    expect(postingRhythm(daily(5))).toBeNull();
  });

  it('calls a fixed every-24-hours schedule bot-like and names the interval', () => {
    const rhythm = postingRhythm(daily(10))!;
    expect(rhythm.verdict).toBe('botLike');
    expect(rhythm.regularPct).toBe(100);
    expect(intervalParts(rhythm.interval!)).toEqual({ value: 1, unit: 'days' });
  });

  it('tolerates a minute or two of scheduler jitter', () => {
    const jittered = [0, 1441, 2879, 4321, 5760, 7201, 8641, 10080].map((m) => post(m));
    expect(postingRhythm(jittered)!.verdict).toBe('botLike');
  });

  it('calls irregular posting human', () => {
    const irregular = [0, 50, 400, 410, 1900, 2300, 4000, 4022, 5555, 7000].map((m) => post(m));
    expect(postingRhythm(irregular)).toMatchObject({ verdict: 'human', regular: 0 });
  });

  it('calls a scheduler plus live posting mixed', () => {
    const scheduled = daily(4, 100_000);
    const live = [0, 50, 400, 410, 1900, 2300, 4000, 4022, 5555, 7000].map((m) => post(m));
    const rhythm = postingRhythm([...live, ...scheduled])!;
    expect(rhythm.verdict).toBe('mixed');
    expect(rhythm.regular).toBe(4);
  });

  it('ignores threads and boosts, which come in even bursts from people too', () => {
    const burst = Array.from({ length: 10 }, (_, i) => threadPart(i * 6));
    const boosts = Array.from({ length: 10 }, (_, i) => boost(1000 + i * 6));
    const irregular = [0, 50, 400, 410, 1900, 2300, 4000, 4022, 5555, 7000].map((m) => post(m));
    expect(postingRhythm([...burst, ...boosts, ...irregular])!.verdict).toBe('human');
  });

  it('does not treat quick-fire posting as a schedule', () => {
    const quick = Array.from({ length: 10 }, (_, i) => post(i));
    expect(postingRhythm(quick)!.verdict).toBe('human');
  });
});
