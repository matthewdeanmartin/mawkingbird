/**
 * "Did it actually publish?" — reading GitHub Actions to answer it.
 *
 * The verdict half is pure and lives at the top of this file: given the runs
 * GitHub reported, the commit we made, and how long ago we made it, what should
 * the user be told? Every interesting case is a table row, which is why it is
 * separated from the polling underneath it.
 *
 * The distinction the whole feature turns on: **a commit is not a publish.**
 * GitHub accepting a file means the post is in the repo. It is not on the site
 * until Actions has built it, and if the build fails — bad front matter, a
 * theme error, a broken shortcode — the post never appears. Saying "published"
 * at commit time is a lie by omission, and it is the lie this sprint retires.
 */

/** One workflow run, trimmed to what a verdict needs. */
export interface ActionsRun {
  /** The commit this run was triggered by. The only safe way to match ours. */
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | string | null;
  html_url: string;
}

export type DeployState =
  /** Committed; no run has claimed it yet. Normal for the first seconds. */
  | { kind: 'queued' }
  | { kind: 'building'; runUrl: string }
  | { kind: 'live'; runUrl: string }
  | { kind: 'failed'; runUrl: string; conclusion: string }
  /** No workflow is watching this branch — someone deploys another way. */
  | { kind: 'no-build' }
  /** We cannot tell: no permission, an API error, or we gave up waiting. */
  | { kind: 'unknown'; reason: string };

/**
 * How long a commit may go unclaimed before we stop calling it "queued".
 *
 * Below this, no matching run means GitHub has not created one *yet*. Above it,
 * no matching run means nothing is going to — a repo with no workflow, or one
 * whose workflow ignores this branch. Rendering those identically is the
 * difference between a correct feature and a spinner that never resolves.
 */
export const RUN_APPEARS_WITHIN_MS = 20_000;

/** Give up watching after this long, and say so rather than spinning forever. */
export const DEPLOY_CEILING_MS = 5 * 60_000;

/**
 * Backoff, not a fixed interval.
 *
 * A Hugo build is usually 30–90 seconds. Polling every 3s for the full ceiling
 * would be a hundred requests against a 5000/hour budget to publish one post,
 * and would spend most of them re-asking a question whose answer changes twice.
 * The last entry repeats until the ceiling.
 */
export const DEPLOY_POLL_SCHEDULE_MS = [3_000, 5_000, 8_000, 13_000, 15_000];

/** How long to wait before poll number `attempt` (0-based). */
export function pollDelayMs(attempt: number): number {
  const schedule = DEPLOY_POLL_SCHEDULE_MS;
  return schedule[Math.min(attempt, schedule.length - 1)];
}

/** Whether this state is an answer, or something still worth re-asking. */
export function isTerminal(state: DeployState): boolean {
  return state.kind !== 'queued' && state.kind !== 'building';
}

/**
 * The verdict, from what GitHub said.
 *
 * Matching is on `head_sha === commitSha` and nothing else. "The newest run" is
 * wrong — it belongs to whatever else happened to push, including GitHub Pages'
 * own separate deployment run — and "the newest run since we published" races
 * with a colleague's commit. A run either was triggered by our commit or it was
 * not, and only `head_sha` knows.
 */
export function nextDeployState(
  runs: readonly ActionsRun[],
  commitSha: string,
  elapsedMs: number,
): DeployState {
  const ours = runs.find((run) => run.head_sha === commitSha);
  if (!ours) {
    return elapsedMs < RUN_APPEARS_WITHIN_MS ? { kind: 'queued' } : { kind: 'no-build' };
  }
  if (ours.status !== 'completed') {
    // `queued` and `in_progress` are both "a run exists and is working on it",
    // which is one thing as far as the user is concerned.
    return { kind: 'building', runUrl: ours.html_url };
  }
  if (ours.conclusion === 'success') {
    return { kind: 'live', runUrl: ours.html_url };
  }
  // `cancelled`, `timed_out`, `action_required` and friends are all "it did not
  // publish", and the conclusion is carried through so the UI can name it.
  return {
    kind: 'failed',
    runUrl: ours.html_url,
    conclusion: ours.conclusion ?? 'failed',
  };
}

/**
 * What to say about each state.
 *
 * The failure copy matters more than the success copy: the user's next question
 * is "did I lose my writing", and the answer is no — the commit succeeded, only
 * the build did not. Saying that plainly is the difference between a scary
 * message and an actionable one.
 */
export function describeDeployState(state: DeployState): string {
  switch (state.kind) {
    case 'queued':
      return 'Committed — waiting for GitHub to start the build…';
    case 'building':
      return 'Committed — your site is rebuilding…';
    case 'live':
      return 'Published and live.';
    case 'failed':
      return `Your post was committed, but the site build ${state.conclusion === 'cancelled' ? 'was cancelled' : 'failed'}. Your writing is safe in the repository — fix the build and it will publish.`;
    case 'no-build':
      return 'Committed to your repository. No GitHub Actions build is watching this branch, so publishing happens however you normally deploy.';
    case 'unknown':
      return state.reason;
  }
}
