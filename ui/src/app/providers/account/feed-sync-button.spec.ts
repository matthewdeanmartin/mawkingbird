import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedSyncButton } from './feed-sync-button';
import { PlusPaywall } from './plus-paywall';
import { CollectionAdoptionRunner } from './collection-adoption-runner';
import { FeatureFlags } from '../../feature-flags';

describe('FeedSyncButton', () => {
  let button: FeedSyncButton;
  const require = vi.fn();
  const inspect = vi.fn();
  const apply = vi.fn();
  beforeEach(() => {
    require.mockReset().mockResolvedValue(false);
    inspect.mockReset().mockResolvedValue({ needsChoice: false });
    apply.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: PlusPaywall, useValue: { require } },
        { provide: FeatureFlags, useValue: { enabled: () => true } },
        { provide: CollectionAdoptionRunner, useValue: { inspect, apply } },
      ],
    });
    button = TestBed.runInInjectionContext(() => new FeedSyncButton());
  });
  it('opens the free paywall before touching cloud subscriptions, on every deliberate click', async () => {
    await button.sync();
    await button.sync();
    expect(require).toHaveBeenCalledTimes(2);
    expect(require).toHaveBeenCalledWith('feeds');
    expect(inspect).not.toHaveBeenCalled();
  });
  it('syncs a paid account through the existing adoption flow', async () => {
    require.mockResolvedValue(true);
    await button.sync();
    expect(inspect).toHaveBeenCalledWith('feeds');
    expect(button.message()).toBe('plus.feedSync.done');
  });
  it('asks before reconciling two existing sets, then applies the chosen merge', async () => {
    require.mockResolvedValue(true);
    inspect.mockResolvedValue({ needsChoice: true });
    await button.sync();
    expect(button.choice()).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    await button.apply('merge');
    expect(apply).toHaveBeenCalledWith('feeds', 'merge');
    expect(button.choice()).toBe(false);
  });
  it('reports a failed write without claiming synchronization succeeded', async () => {
    require.mockResolvedValue(true);
    inspect.mockResolvedValue({ needsChoice: true });
    apply.mockResolvedValue(false);
    await button.sync();
    await button.apply('replace');
    expect(button.choice()).toBe(true);
    expect(button.message()).toBe('plus.feedSync.failed');
  });
});
