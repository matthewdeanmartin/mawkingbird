import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionsRun, DEPLOY_CEILING_MS } from './hugo-deploy';
import { HugoDeployWatch } from './hugo-deploy-watch';
import { HugoRepo, HugoSettings } from './hugo-settings';

const REPO: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: null,
  includeInProfile: false,
};

const OURS = 'commit-abc';
const RUN_URL = 'https://github.com/mistersql/my-blog/actions/runs/1';

function runsResponse(runs: Partial<ActionsRun>[], status = 200): Response {
  return new Response(
    JSON.stringify({
      workflow_runs: runs.map((run) => ({
        head_sha: OURS,
        status: 'completed',
        conclusion: 'success',
        html_url: RUN_URL,
        ...run,
      })),
    }),
    { status },
  );
}

/**
 * Answer every poll with a *fresh* Response.
 *
 * `mockResolvedValue(response)` hands the same object to every call, and a
 * `Response` body can only be read once — the second poll then fails to parse
 * and the watcher reports `unknown`. Polling specs must mint a new one per call.
 */
function alwaysRespond(make: () => Response): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(make()));
}

/** Requests this watcher made to the Actions API. */
function runCalls(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map((call) => String(call[0]))
    .filter((url) => url.includes('/actions/runs'));
}

/** Advance fake timers and let the awaited fetch settle between each step. */
async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('HugoDeployWatch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function connect(): HugoDeployWatch {
    TestBed.inject(HugoSettings).connect('tok', REPO);
    return TestBed.inject(HugoDeployWatch);
  }

  it('starts queued before the first poll has even fired', () => {
    alwaysRespond(() => runsResponse([]));
    const watch = connect();

    watch.watch(OURS);

    expect(watch.current()).toEqual({ kind: 'queued' });
    expect(runCalls()).toHaveLength(0);
  });

  it('reaches live and then stops polling', async () => {
    alwaysRespond(() => runsResponse([{}]));
    const watch = connect();

    watch.watch(OURS);
    await tick(3_000);

    expect(watch.current()).toEqual({ kind: 'live', runUrl: RUN_URL });
    expect(watch.watching()).toBe(false);

    const after = runCalls().length;
    await tick(60_000);
    expect(runCalls()).toHaveLength(after);
  });

  it('reports a failed build and stops', async () => {
    alwaysRespond(() => runsResponse([{ conclusion: 'failure' }]));
    const watch = connect();

    watch.watch(OURS);
    await tick(3_000);

    expect(watch.current()).toMatchObject({ kind: 'failed', conclusion: 'failure' });
    expect(watch.watching()).toBe(false);
  });

  it('keeps polling on a backoff while the build is running', async () => {
    alwaysRespond(() => runsResponse([{ status: 'in_progress', conclusion: null }]));
    const watch = connect();

    watch.watch(OURS);
    await tick(3_000);
    expect(runCalls()).toHaveLength(1);

    // 5s, not another 3s.
    await tick(4_000);
    expect(runCalls()).toHaveLength(1);
    await tick(1_000);
    expect(runCalls()).toHaveLength(2);

    expect(watch.current()).toMatchObject({ kind: 'building' });
  });

  it('says no-build once the grace period passes with no matching run', async () => {
    alwaysRespond(() =>
      runsResponse([{ head_sha: 'someone-else', status: 'in_progress', conclusion: null }]),
    );
    const watch = connect();

    watch.watch(OURS);
    // Poll past the 20s window: 3 + 5 + 8 + 13 = 29s.
    await tick(30_000);

    expect(watch.current()).toEqual({ kind: 'no-build' });
    expect(watch.watching()).toBe(false);
  });

  it('gives up at the ceiling rather than polling forever', async () => {
    alwaysRespond(() => runsResponse([{ status: 'in_progress', conclusion: null }]));
    const watch = connect();

    watch.watch(OURS);
    await tick(DEPLOY_CEILING_MS + 30_000);

    expect(watch.current()).toMatchObject({ kind: 'unknown' });
    expect(watch.watching()).toBe(false);

    const after = runCalls().length;
    // Five minutes of backoff, not five minutes of 3-second polls.
    expect(after).toBeLessThan(30);
    await tick(120_000);
    expect(runCalls()).toHaveLength(after);
  });

  it('names the missing token permission rather than looking like a failed publish', async () => {
    alwaysRespond(
      () => new Response(JSON.stringify({ message: 'Resource not accessible' }), { status: 403 }),
    );
    const watch = connect();

    watch.watch(OURS);
    await tick(3_000);

    expect(watch.current()).toMatchObject({ kind: 'unknown' });
    expect((watch.current() as { reason: string }).reason).toContain('Actions: Read-only');
    expect(watch.watching()).toBe(false);
  });

  it('stops on demand, and a request already in flight cannot revive it', async () => {
    alwaysRespond(() => runsResponse([{ status: 'in_progress', conclusion: null }]));
    const watch = connect();
    watch.watch(OURS);

    watch.stop();
    await tick(60_000);

    expect(watch.current()).toBeNull();
    expect(runCalls()).toHaveLength(0);
  });

  it('lets a second publish supersede the first, with only one poller left', async () => {
    alwaysRespond(() => runsResponse([{ status: 'in_progress', conclusion: null }]));
    const watch = connect();

    watch.watch(OURS);
    await tick(3_000);
    const afterFirst = runCalls().length;

    watch.watch('commit-def');
    await tick(3_000);

    // One more poll, not two pollers each firing.
    expect(runCalls()).toHaveLength(afterFirst + 1);
    // And it is watching the *new* commit: the only run in flight belongs to
    // the first one, so the second is still unclaimed rather than reported as
    // building on someone else's run.
    expect(watch.current()).toEqual({ kind: 'queued' });
  });

  it('does not watch a commit it cannot identify', () => {
    alwaysRespond(() => runsResponse([]));
    const watch = connect();

    watch.watch('');

    // Guessing from "the newest run" is exactly the wrong answer.
    expect(watch.current()).toBeNull();
    expect(watch.watching()).toBe(false);
  });
});
