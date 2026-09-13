import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionSyncButton } from './connection-sync-button';
import { PlusPaywall } from './plus-paywall';
import { VaultPreference } from '../vault/vault-preference';
import { VaultService } from '../vault/vault-service';
import { VaultAdoption } from '../vault/vault-adoption';
import { FeatureFlags } from '../../feature-flags';
describe('ConnectionSyncButton', () => {
  let button: ConnectionSyncButton;
  const require = vi.fn();
  const refresh = vi.fn();
  const unlocked = vi.fn();
  const reconcileExisting = vi.fn();
  beforeEach(() => {
    require.mockReset().mockResolvedValue(false);
    refresh.mockReset().mockResolvedValue(undefined);
    unlocked.mockReset().mockReturnValue(false);
    reconcileExisting.mockReset().mockResolvedValue({ failed: [], conflicts: [] });
    TestBed.configureTestingModule({
      providers: [
        { provide: PlusPaywall, useValue: { require } },
        { provide: FeatureFlags, useValue: { enabled: () => true } },
        { provide: VaultPreference, useValue: { available: true, set: vi.fn() } },
        { provide: VaultService, useValue: { refresh, unlocked } },
        { provide: VaultAdoption, useValue: { reconcileExisting } },
      ],
    });
    button = TestBed.runInInjectionContext(() => new ConnectionSyncButton());
  });
  it('paywalls a free sync attempt before vault access', async () => {
    await button.sync();
    expect(require).toHaveBeenCalledWith('connections');
    expect(refresh).not.toHaveBeenCalled();
  });
  it('requires an unlocked vault even after entitlement succeeds', async () => {
    require.mockResolvedValue(true);
    await button.sync();
    expect(button.message()).toBe('plus.connectionSync.unlock');
    expect(reconcileExisting).not.toHaveBeenCalled();
  });
  it('reconciles paid, unlocked connections and surfaces conflicts', async () => {
    require.mockResolvedValue(true);
    unlocked.mockReturnValue(true);
    await button.sync();
    expect(reconcileExisting).toHaveBeenCalledOnce();
    expect(button.message()).toBe('plus.connectionSync.done');
    reconcileExisting.mockResolvedValue({
      failed: [],
      conflicts: [{ connector: 'GitHub', message: 'changed' }],
    });
    await button.sync();
    expect(button.message()).toBe('plus.connectionSync.failed');
    expect(button.needsAttention()).toBe(true);
  });
});
