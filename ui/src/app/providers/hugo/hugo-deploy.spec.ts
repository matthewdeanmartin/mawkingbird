import { describe, expect, it } from 'vitest';
import {
  ActionsRun,
  DEPLOY_POLL_SCHEDULE_MS,
  DeployState,
  describeDeployState,
  isTerminal,
  nextDeployState,
  pollDelayMs,
  RUN_APPEARS_WITHIN_MS,
} from './hugo-deploy';

const OURS = 'commit-abc';

function run(over: Partial<ActionsRun> = {}): ActionsRun {
  return {
    head_sha: OURS,
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/me/blog/actions/runs/1',
    ...over,
  };
}

describe('nextDeployState', () => {
  it('is queued while no run has claimed the commit yet', () => {
    expect(nextDeployState([], OURS, 5_000)).toEqual({ kind: 'queued' });
  });

  it('gives up on finding a run once the grace period has passed', () => {
    // A repo with no workflow, or one that ignores this branch. Saying so beats
    // a spinner that never resolves.
    expect(nextDeployState([], OURS, RUN_APPEARS_WITHIN_MS + 1)).toEqual({ kind: 'no-build' });
  });

  it('treats queued and in_progress runs alike — both are "working on it"', () => {
    for (const status of ['queued', 'in_progress']) {
      expect(nextDeployState([run({ status, conclusion: null })], OURS, 1_000)).toEqual({
        kind: 'building',
        runUrl: 'https://github.com/me/blog/actions/runs/1',
      });
    }
  });

  it('is live on a successful completed run', () => {
    expect(nextDeployState([run()], OURS, 30_000)).toEqual({
      kind: 'live',
      runUrl: 'https://github.com/me/blog/actions/runs/1',
    });
  });

  it('carries the conclusion through on every non-success ending', () => {
    for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required']) {
      expect(nextDeployState([run({ conclusion })], OURS, 30_000)).toEqual({
        kind: 'failed',
        runUrl: 'https://github.com/me/blog/actions/runs/1',
        conclusion,
      });
    }
  });

  it('treats a completed run with no conclusion as a failure, not a success', () => {
    expect(nextDeployState([run({ conclusion: null })], OURS, 30_000)).toMatchObject({
      kind: 'failed',
    });
  });

  // The two rows a naive implementation gets wrong.

  it('ignores runs belonging to someone else’s commit', () => {
    const other = run({ head_sha: 'someone-else', status: 'in_progress', conclusion: null });

    // "The newest run" would report building here. It is not our build.
    expect(nextDeployState([other], OURS, RUN_APPEARS_WITHIN_MS + 1)).toEqual({
      kind: 'no-build',
    });
  });

  it('picks our run even when a newer unrelated run has already succeeded', () => {
    const runs = [
      run({ head_sha: 'newer-unrelated', html_url: 'https://github.com/x/2' }),
      run({ status: 'queued', conclusion: null }),
    ];

    // GitHub Pages fires its own deployment run alongside the build; taking the
    // newest would report "live" while ours is still queued.
    expect(nextDeployState(runs, OURS, 5_000)).toEqual({
      kind: 'building',
      runUrl: 'https://github.com/me/blog/actions/runs/1',
    });
  });
});

describe('isTerminal', () => {
  const cases: [DeployState, boolean][] = [
    [{ kind: 'queued' }, false],
    [{ kind: 'building', runUrl: 'u' }, false],
    [{ kind: 'live', runUrl: 'u' }, true],
    [{ kind: 'failed', runUrl: 'u', conclusion: 'failure' }, true],
    [{ kind: 'no-build' }, true],
    [{ kind: 'unknown', reason: 'r' }, true],
  ];

  for (const [state, expected] of cases) {
    it(`${state.kind} is ${expected ? '' : 'not '}an answer`, () => {
      expect(isTerminal(state)).toBe(expected);
    });
  }
});

describe('pollDelayMs', () => {
  it('backs off rather than hammering a fixed interval', () => {
    expect([0, 1, 2, 3].map(pollDelayMs)).toEqual([3_000, 5_000, 8_000, 13_000]);
  });

  it('holds at the last interval instead of growing without bound', () => {
    const last = DEPLOY_POLL_SCHEDULE_MS[DEPLOY_POLL_SCHEDULE_MS.length - 1];

    expect(pollDelayMs(50)).toBe(last);
  });
});

describe('describeDeployState', () => {
  it('says the writing is safe when the build failed', () => {
    const message = describeDeployState({
      kind: 'failed',
      runUrl: 'u',
      conclusion: 'failure',
    });

    // The user's next question is "did I lose my post". The answer is no.
    expect(message).toContain('safe');
    expect(message).toContain('committed');
  });

  it('explains a repo with no workflow without implying something broke', () => {
    const message = describeDeployState({ kind: 'no-build' });

    expect(message).toContain('No GitHub Actions build');
    expect(message.toLowerCase()).not.toContain('failed');
  });

  it('passes an unknown reason straight through', () => {
    expect(describeDeployState({ kind: 'unknown', reason: 'Add Actions: Read-only.' })).toBe(
      'Add Actions: Read-only.',
    );
  });
});
