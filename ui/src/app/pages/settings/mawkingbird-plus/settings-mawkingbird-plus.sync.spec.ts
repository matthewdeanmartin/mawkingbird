import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsMawkingbirdPlus } from './settings-mawkingbird-plus';
import { MawkingbirdSession } from '../../../providers/account/mawkingbird-session';
import { PlusSession } from '../../../providers/account/plus-session';
import { SettingsSyncToggle } from '../../../providers/account/settings-sync-toggle';
import { PlusDiagnostics } from '../../../providers/account/plus-diagnostics';
import { ProfileSync } from '../../../providers/account/profile-sync';
import { PageDiagnostics } from '../../../page-diagnostics';
import { CorsProxyUsageStore } from '../../../providers/cors-proxy/cors-proxy-usage';
import { PlusFeatures, type PlusFeature } from '../../../providers/account/plus-features';
import { CorsProxySettings } from '../../../providers/cors-proxy/cors-proxy-settings';
import {
  CollectionAdoptionRunner,
  type AdoptableCollection,
  type AdoptionInspection,
} from '../../../providers/account/collection-adoption-runner';

/** The manual button and welcome dialog must drive every dataset they claim to sync. */
describe('SettingsMawkingbirdPlus collection sync', () => {
  let component: SettingsMawkingbirdPlus;
  let adoption: {
    inspect: ReturnType<
      typeof vi.fn<(collection: AdoptableCollection) => Promise<AdoptionInspection>>
    >;
    apply: ReturnType<typeof vi.fn>;
  };
  let sync: {
    push: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof signal>;
    syncing: ReturnType<typeof signal>;
    readOnly: () => boolean;
  };
  let diagnostics: { load: ReturnType<typeof vi.fn> };
  let settingsSync: {
    on: ReturnType<typeof signal>;
    detail: () => string;
    set: ReturnType<typeof vi.fn>;
  };
  let features: {
    enabled: Record<PlusFeature, boolean>;
    isOn: (feature: PlusFeature) => boolean;
    refresh: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    adoption = {
      inspect: vi.fn(async (collection: AdoptableCollection) => ({
        collection,
        localCount: 1,
        remoteCount: 0,
        needsChoice: false,
      })),
      apply: vi.fn().mockResolvedValue(true),
    };
    sync = {
      push: vi.fn().mockResolvedValue({ kind: 'saved', keys: 7, revision: 6 }),
      record: signal({ state: 'syncing', dirty: true }),
      syncing: signal(false),
      readOnly: () => false,
    };
    diagnostics = { load: vi.fn().mockResolvedValue(undefined) };
    settingsSync = { on: signal(true), detail: () => '', set: vi.fn() };
    features = {
      enabled: {
        corsProxy: true,
        trustSync: true,
        listsSync: true,
        feedsSync: true,
        apiKeys: true,
      },
      isOn(feature) {
        return this.enabled[feature];
      },
      refresh: vi.fn(),
      set: vi.fn((feature: PlusFeature, on: boolean) => {
        features.enabled[feature] = on;
      }),
    };

    TestBed.configureTestingModule({
      imports: [SettingsMawkingbirdPlus],
      providers: [
        {
          provide: MawkingbirdSession,
          useValue: {
            user: signal(null),
            ready: signal(true),
            error: signal(null),
            sendingLink: signal(false),
          },
        },
        { provide: PlusSession, useValue: { isSupporter: () => true } },
        {
          provide: SettingsSyncToggle,
          useValue: settingsSync,
        },
        { provide: PlusDiagnostics, useValue: diagnostics },
        { provide: ProfileSync, useValue: sync },
        { provide: PageDiagnostics, useValue: { info: vi.fn() } },
        { provide: CorsProxyUsageStore, useValue: { usage: signal({ requests: 0 }) } },
        { provide: PlusFeatures, useValue: features },
        {
          provide: CorsProxySettings,
          useValue: { missingEntitledProxy: () => false, adoptSupporterProxy: vi.fn() },
        },
        { provide: CollectionAdoptionRunner, useValue: adoption },
      ],
    });
    component = TestBed.createComponent(SettingsMawkingbirdPlus).componentInstance;
  });

  it('syncs every enabled collection when Sync now is pressed', async () => {
    await component['syncNow']();

    expect(sync.push).toHaveBeenCalledWith(true);
    expect(adoption.inspect.mock.calls.map(([collection]) => collection)).toEqual([
      'trust',
      'feeds',
      'lists',
    ]);
    expect(component['syncMessage']()).toContain(
      'Synced trusted accounts, RSS subscriptions, client lists.',
    );
    expect(diagnostics.load).toHaveBeenCalledOnce();
  });

  it('allows enabled collections to sync while settings sync is off', async () => {
    settingsSync.on.set(false);

    expect(component['syncBlockedReason']()).toBeNull();

    await component['syncNow']();

    expect(adoption.inspect).toHaveBeenCalledTimes(3);
  });

  it('runs first adoption for collection choices saved by the welcome dialog', async () => {
    features.enabled.feedsSync = false;

    await component['welcomeSaved']();

    expect(features.refresh).toHaveBeenCalledOnce();
    expect(adoption.inspect.mock.calls.map(([collection]) => collection)).toEqual([
      'trust',
      'lists',
    ]);
  });

  it('continues with later collections after an adoption choice', async () => {
    adoption.inspect.mockImplementation(async (collection: AdoptableCollection) => ({
      collection,
      localCount: 1,
      remoteCount: collection === 'trust' ? 1 : 0,
      needsChoice: collection === 'trust',
    }));

    await component['syncNow']();

    expect(component['pendingAdoption']()?.collection).toBe('trust');
    expect(adoption.inspect).toHaveBeenCalledTimes(1);

    await component['resolveAdoption']('merge');

    expect(adoption.apply).toHaveBeenCalledWith('trust', 'merge');
    expect(adoption.inspect.mock.calls.map(([collection]) => collection)).toEqual([
      'trust',
      'feeds',
      'lists',
    ]);
  });
});
