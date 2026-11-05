import { Status } from '../../models';

/**
 * How big one preview is (owner, 2026-11-04): a random handful, not the whole
 * selection. Ten hashtags and 36 people read in full was 46 requests of 20–40
 * posts each; this is a fixed, small budget.
 */
export const SAMPLE = {
  tags: 3,
  postsPerTag: 5,
  people: 5,
  postsPerPerson: 3,
  /** Hard ceiling on requests for one preview, top-off rounds included. */
  maxCalls: 16,
  /** Requests in flight at once. */
  concurrency: 4,
} as const;

export interface SampleProgress {
  done: number;
  /** Requests this sample expects to make: the first round, plus any top-offs. */
  planned: number;
}

export interface Sampler<T> {
  /** Recent posts for one source; [] when it has none or cannot be read. */
  fetch(source: T, limit: number): Promise<Status[]>;
}

/** Fisher–Yates, with the random source injected so tests can fix it. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Lane<T> {
  pool: T[];
  want: number;
  limit: number;
  sampler: Sampler<T>;
  filled: number;
}

/**
 * One preview: `SAMPLE.tags` random hashtags at `postsPerTag` posts each and
 * `SAMPLE.people` random people at `postsPerPerson` each, read concurrently.
 * A source that comes back empty (a quiet tag, an unreachable server) is
 * replaced from the rest of the selection in a top-off round, until each lane
 * has its quota, its pool runs out, or the request ceiling is reached.
 * Posts are de-duplicated and returned newest first.
 */
export async function samplePreview<Tag, Person>(options: {
  tags: readonly Tag[];
  people: readonly Person[];
  tagSampler: Sampler<Tag>;
  personSampler: Sampler<Person>;
  random?: () => number;
  onProgress?: (progress: SampleProgress) => void;
}): Promise<Status[]> {
  const random = options.random ?? Math.random;
  const lanes: Lane<unknown>[] = [
    {
      pool: shuffled(options.tags, random),
      want: SAMPLE.tags,
      limit: SAMPLE.postsPerTag,
      sampler: options.tagSampler as Sampler<unknown>,
      filled: 0,
    },
    {
      pool: shuffled(options.people, random),
      want: SAMPLE.people,
      limit: SAMPLE.postsPerPerson,
      sampler: options.personSampler as Sampler<unknown>,
      filled: 0,
    },
  ];
  const posts: Status[] = [];
  let calls = 0;
  let planned = 0;
  const report = () => options.onProgress?.({ done: calls, planned });

  // Each round asks every lane for the sources it is still short of.
  for (;;) {
    const round: { lane: Lane<unknown>; source: unknown }[] = [];
    for (const lane of lanes) {
      const short = lane.want - lane.filled;
      for (let i = 0; i < short && lane.pool.length && planned < SAMPLE.maxCalls; i++) {
        round.push({ lane, source: lane.pool.shift() });
        planned++;
      }
    }
    if (!round.length) break;
    report();
    let next = 0;
    const worker = async () => {
      while (next < round.length) {
        const job = round[next++];
        let got: Status[];
        try {
          got = await job.lane.sampler.fetch(job.source, job.lane.limit);
        } catch {
          got = [];
        }
        calls++;
        if (got.length) {
          job.lane.filled++;
          posts.push(...got.slice(0, job.lane.limit));
        }
        report();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SAMPLE.concurrency, round.length) }, () => worker()),
    );
  }

  const seen = new Set<string>();
  return posts
    .filter((status) => {
      const key = status.uri || status.url || status.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
