import { Poll } from '../models';

/** Wilson score interval; NIST/SEMATECH e-Handbook §7.2.4.1. */
export function wilsonInterval(count: number, n: number): [number, number] {
  const z = 1.959963984540054;
  const p = count / n;
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const radius = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

export function pollStatistics(poll: Poll) {
  const counts = poll.options.map((option) => option.votes_count);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const n = poll.multiple ? poll.voters_count : poll.votes_count;
  if (
    !Number.isSafeInteger(n) ||
    n <= 0 ||
    counts.length < 2 ||
    counts.some((count) => !Number.isSafeInteger(count) || count < 0 || count > n) ||
    total !== poll.votes_count ||
    (!poll.multiple && total !== n) ||
    (poll.multiple && total < n)
  )
    return null;
  const options = poll.options.map((option, index) => ({
    ...option,
    index,
    share: counts[index] / n,
    interval: wilsonInterval(counts[index], n),
  }));
  const sorted = [...options].sort((a, b) => b.share - a.share);
  // Hoeffding + union bound: all k bounds cover jointly with probability >= .95.
  // Works for dependent options within a ballot, provided voters are independent.
  const radius = Math.sqrt(Math.log((2 * counts.length) / 0.05) / (2 * n));
  const separated = (a: number, b: number) => a - b > 2 * radius;
  return {
    n,
    options,
    average: total / n,
    lead: (sorted[0].share - sorted[1].share) * 100,
    leader: sorted[0].title,
    clearLeader: separated(sorted[0].share, sorted[1].share),
    ranked: sorted.slice(1).every((option, i) => separated(sorted[i].share, option.share)),
  };
}
