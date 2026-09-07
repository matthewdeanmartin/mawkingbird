import { beforeEach, describe, expect, it } from 'vitest';
import {
  deploymentChannel,
  FeatureFlags,
  FEATURE_FLAGS,
  flagsInGroup,
  isFeatureEnabled,
} from './feature-flags';
import {
  CONNECTION_CATALOG,
  CONNECTION_FLAGS,
} from './pages/settings/connections/connection-catalog';

const STORAGE_KEY = 'mockingbird_feature_flags';

describe('feature flag rollout states', () => {
  it('runs everything released at its own rung and below', () => {
    // production: everywhere.
    expect(isFeatureEnabled('production', 'production')).toBe(true);
    expect(isFeatureEnabled('production', 'canary')).toBe(true);
    expect(isFeatureEnabled('production', 'test')).toBe(true);

    // canary: canary and test, but not production.
    expect(isFeatureEnabled('canary', 'production')).toBe(false);
    expect(isFeatureEnabled('canary', 'canary')).toBe(true);
    // The rung that makes test useful: a feature staged on canary must be
    // visible in test too, or the deployment meant for trying things out is
    // the one place you cannot try them.
    expect(isFeatureEnabled('canary', 'test')).toBe(true);

    // test: test only.
    expect(isFeatureEnabled('test', 'production')).toBe(false);
    expect(isFeatureEnabled('test', 'canary')).toBe(false);
    expect(isFeatureEnabled('test', 'test')).toBe(true);

    // off: nowhere, including test.
    expect(isFeatureEnabled('off', 'production')).toBe(false);
    expect(isFeatureEnabled('off', 'canary')).toBe(false);
    expect(isFeatureEnabled('off', 'test')).toBe(false);
  });
});

describe('deploymentChannel', () => {
  it('reads the channel from the base href', () => {
    expect(deploymentChannel('https://mawkingbird.com/')).toBe('production');
    expect(deploymentChannel('https://mawkingbird.com/canary/')).toBe('canary');
    expect(deploymentChannel('https://mawkingbird.com/test/')).toBe('test');
  });
});

describe('the billing flags', () => {
  it('keeps Mawkingbird Plus off anywhere a real customer could buy it', () => {
    // Canary is production: same origin, live billing, real users. Until a live
    // Stripe price exists, a checkout button there is a button that takes money
    // for something that cannot be delivered.
    for (const id of ['mawkingbird-plus', 'proxy-mawkingbird-plus'] as const) {
      const state = FEATURE_FLAGS.find((flag) => flag.id === id)?.defaultState;
      expect(state).toBe('test');
      expect(isFeatureEnabled(state!, 'production')).toBe(false);
      expect(isFeatureEnabled(state!, 'canary')).toBe(false);
      expect(isFeatureEnabled(state!, 'test')).toBe(true);
    }
  });
});

describe('FeatureFlags', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));

  it('defaults pastebin to the production rollout', () => {
    const flags = new FeatureFlags();

    expect(flags.state('pastebin')).toBe('production');
    expect(flags.enabled('pastebin')).toBe(true);
  });

  it('retains an override for the same published hash', () => {
    const first = new FeatureFlags();
    first.setState('pastebin', 'off');

    const reloaded = new FeatureFlags();

    expect(reloaded.state('pastebin')).toBe('off');
  });

  it('resets overrides when the published hash changes', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ publishedHash: 'an-older-published-hash', states: { pastebin: 'off' } }),
    );

    const flags = new FeatureFlags();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      publishedHash?: string;
    };

    expect(flags.state('pastebin')).toBe('production');
    expect(stored.publishedHash).toBe(flags.publishedHash);
  });

  it('reports no disabled reason while a flag is enabled', () => {
    const flags = new FeatureFlags();

    expect(flags.disabledReason('connector-bluesky')).toBeNull();
  });

  it('explains a turned-off connector, and says so differently for canary-only', () => {
    const flags = new FeatureFlags();

    flags.setState('connector-twitter', 'off');
    expect(flags.disabledReason('connector-twitter')).toBe('Disabled by a feature flag.');

    // Canary-only on a production build is still off, but for a reason worth
    // distinguishing: it is coming, rather than broken.
    flags.setState('connector-twitter', 'canary');
    expect(flags.disabledReason('connector-twitter')).toContain('canary build first');
  });
});

describe('connector flags', () => {
  it('gates every catalog entry with a flag that exists', () => {
    const ids = new Set(FEATURE_FLAGS.map((flag) => flag.id));

    for (const entry of CONNECTION_CATALOG) {
      const flagId = CONNECTION_FLAGS[entry.id];
      expect(flagId, `${entry.id} has no flag`).toBeDefined();
      expect(ids.has(flagId), `${flagId} is not a declared flag`).toBe(true);
    }
  });

  it('ships every connector on production, so today nothing is withheld', () => {
    for (const flag of flagsInGroup('connectors')) {
      expect(flag.defaultState, `${flag.id} should default to production`).toBe('production');
    }
  });
});
