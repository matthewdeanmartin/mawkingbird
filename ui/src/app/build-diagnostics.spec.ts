import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BuildInfo } from './build-info';
import { deploymentName, logBuildDiagnostics } from './build-diagnostics';

describe('build diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('distinguishes production, canary, and test by base href', () => {
    expect(deploymentName('https://mawkingbird.com/')).toBe('production');
    expect(deploymentName('https://mawkingbird.com/canary/')).toBe('canary');
    expect(deploymentName('https://mawkingbird.com/test/')).toBe('test');
  });

  it('logs the exact stamped commit and deployment without a page URL', () => {
    const info: BuildInfo = {
      builtAt: '2026-08-22T15:32:49.000Z',
      commit: 'f180e346d8c88b2420195fc9979b861027c98592',
      commitUrl: 'https://github.com/example/repo/commit/f180e346',
      runUrl: 'https://github.com/example/repo/actions/runs/123',
    };
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logBuildDiagnostics(info, 'https://mawkingbird.com/canary/');

    expect(consoleInfo).toHaveBeenCalledWith('[Mockingbird Build] boot', {
      deployment: 'canary',
      commit: info.commit,
      builtAt: info.builtAt,
      baseUri: 'https://mawkingbird.com/canary/',
      runUrl: info.runUrl,
    });
  });
});
