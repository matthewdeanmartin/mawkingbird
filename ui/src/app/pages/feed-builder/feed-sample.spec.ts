import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { SAMPLE, SampleProgress, Sampler, samplePreview, shuffled } from './feed-sample';

const post = (id: string, minutesAgo: number, uri = `https://x/${id}`): Status =>
  ({
    id,
    uri,
    created_at: new Date(Date.UTC(2026, 10, 4, 12, 0) - minutesAgo * 60_000).toISOString(),
  }) as Status;

/** A sampler that records what it was asked for and answers from a table. */
function recorder(answers: Record<string, number>) {
  const asked: { source: string; limit: number }[] = [];
  const sampler: Sampler<string> = {
    fetch: async (source, limit) => {
      asked.push({ source, limit });
      const n = Math.min(answers[source] ?? limit, limit + 2); // servers may send extra
      return Array.from({ length: n }, (_, i) => post(`${source}-${i}`, i + source.length));
    },
  };
  return { asked, sampler };
}

const TAGS = Array.from({ length: 10 }, (_, i) => `tag${i}`);
const PEOPLE = Array.from({ length: 36 }, (_, i) => `p${i}@x.social`);
/** Deterministic "random": identity order for shuffles. */
const noShuffle = () => 0.999999;

describe('Feed Builder preview sample', () => {
  it('reads a fixed handful: 3 hashtags at 5 posts and 5 people at 3 posts', async () => {
    const tags = recorder({});
    const people = recorder({});
    const posts = await samplePreview({
      tags: TAGS,
      people: PEOPLE,
      tagSampler: tags.sampler,
      personSampler: people.sampler,
      random: noShuffle,
    });
    expect(tags.asked.length).toBe(SAMPLE.tags);
    expect(people.asked.length).toBe(SAMPLE.people);
    expect(tags.asked.every((ask) => ask.limit === SAMPLE.postsPerTag)).toBe(true);
    expect(people.asked.every((ask) => ask.limit === SAMPLE.postsPerPerson)).toBe(true);
    // Extra posts a server sends beyond the limit are dropped: 3×5 + 5×3.
    expect(posts.length).toBe(30);
    // Newest first.
    const times = posts.map((p) => Date.parse(p.created_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('tops off a quiet hashtag or unreachable person from the rest of the selection', async () => {
    const tags = recorder({ tag0: 0, tag1: 0 });
    const people = { asked: [] as string[], sampler: { fetch: async () => [] } as Sampler<string> };
    people.sampler = {
      fetch: async (source) => {
        people.asked.push(source);
        if (source === 'p2@x.social') throw new Error('server down');
        return [post(source, 1)];
      },
    };
    const posts = await samplePreview({
      tags: TAGS,
      people: PEOPLE,
      tagSampler: tags.sampler,
      personSampler: people.sampler,
      random: noShuffle,
    });
    // Two empty tags were replaced by two more; one failed person by one more.
    expect(tags.asked.map((a) => a.source)).toEqual(['tag0', 'tag1', 'tag2', 'tag3', 'tag4']);
    expect(people.asked.length).toBe(SAMPLE.people + 1);
    expect(posts.filter((p) => p.id.startsWith('tag')).length).toBe(3 * SAMPLE.postsPerTag);
  });

  it('never exceeds the request ceiling, even when everything is quiet', async () => {
    const tags = recorder(Object.fromEntries(TAGS.map((t) => [t, 0])));
    const people = recorder(Object.fromEntries(PEOPLE.map((p) => [p, 0])));
    const progress: SampleProgress[] = [];
    const posts = await samplePreview({
      tags: TAGS,
      people: PEOPLE,
      tagSampler: tags.sampler,
      personSampler: people.sampler,
      onProgress: (p) => progress.push({ ...p }),
    });
    expect(tags.asked.length + people.asked.length).toBe(SAMPLE.maxCalls);
    expect(posts).toEqual([]);
    const last = progress.at(-1) as SampleProgress;
    expect(last.done).toBe(SAMPLE.maxCalls);
    expect(last.planned).toBe(SAMPLE.maxCalls);
    expect(progress.every((p) => p.done <= p.planned)).toBe(true);
  });

  it('uses what a small selection has, and drops a post seen twice', async () => {
    const shared = post('same', 1, 'https://x/shared');
    const posts = await samplePreview({
      tags: ['a'],
      people: ['p@x.social'],
      tagSampler: { fetch: async () => [shared, post('t', 2)] },
      personSampler: { fetch: async () => [{ ...shared, id: 'other-id' }] },
    });
    expect(posts.map((p) => p.uri)).toEqual(['https://x/shared', 'https://x/t']);
  });

  it('shuffles differently with a different random source', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const a = shuffled(TAGS, random);
    const b = shuffled(TAGS, random);
    expect([...a].sort()).toEqual([...TAGS].sort());
    expect(a).not.toEqual(b);
  });
});
