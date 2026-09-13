import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlusPaywall } from './plus-paywall';
import { PlusCatalogue } from './plus-catalogue';
import { PlusSession } from './plus-session';
import { MawkingbirdSession } from './mawkingbird-session';
import { FeatureFlags } from '../../feature-flags';
import { fakePlusCatalogue } from '../../testing/plus-catalogue';

describe('PlusPaywall', () => {
  let wall: PlusPaywall;
  let account: {
    ensureReady: ReturnType<typeof vi.fn>;
    ready: () => boolean;
    error: () => null;
    user: ReturnType<typeof signal<object | null>>;
  };
  let plus: { refresh: ReturnType<typeof vi.fn>; isSupporter: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    account = {
      ready: () => true,
      error: () => null,
      ensureReady: vi.fn().mockResolvedValue(undefined),
      user: signal<object | null>(null),
    };
    plus = {
      refresh: vi.fn().mockResolvedValue('token'),
      isSupporter: vi.fn().mockReturnValue(false),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FeatureFlags, useValue: { enabled: () => true } },
        { provide: PlusCatalogue, useFactory: fakePlusCatalogue },
        { provide: MawkingbirdSession, useValue: account },
        { provide: PlusSession, useValue: plus },
      ],
    });
    wall = TestBed.inject(PlusPaywall);
  });
  it('shows an offer to a signed-out visitor and does not write or mint', async () => {
    expect(await wall.require('feeds')).toBe(false);
    expect(wall.state()).toEqual({ feature: 'feeds', status: 'free' });
    expect(plus.refresh).not.toHaveBeenCalled();
  });
  it('refreshes entitlement and lets a paying account proceed', async () => {
    account.user.set({});
    plus.isSupporter.mockReturnValue(true);
    expect(await wall.require('connections')).toBe(true);
    expect(wall.state()).toBeNull();
    expect(plus.refresh).toHaveBeenCalledTimes(1);
  });
  it('never labels an unavailable membership check as free', async () => {
    account.user.set({});
    plus.refresh.mockResolvedValue(null);
    expect(await wall.require('settings')).toBe(false);
    expect(wall.state()?.status).toBe('unavailable');
  });
  it('deduplicates simultaneous attempts, and allows a deliberate attempt after dismissal', async () => {
    const first = wall.require('feeds');
    expect(await wall.require('proxy')).toBe(false);
    await first;
    expect(wall.state()?.feature).toBe('feeds');
    wall.dismiss();
    await wall.require('proxy');
    expect(wall.state()?.feature).toBe('proxy');
  });
  it('does not resurrect a dismissed dialog when a lookup completes', async () => {
    const pending = wall.require('settings');
    wall.dismiss();
    await pending;
    expect(wall.state()).toBeNull();
  });
  it('does not open a settings offer after the visitor leaves that route', async () => {
    expect(await wall.require('settings', () => false)).toBe(false);
    expect(wall.state()).toBeNull();
  });
});
