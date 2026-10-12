import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FeatureFlags } from '../../feature-flags';
import { MawkingbirdAccess, ownsMawkingbirdServices } from './mawkingbird-access';
import { MawkingbirdSession } from './mawkingbird-session';
import { ProfileSyncStarter } from './profile-sync-starter';
import { PlusTokenSource } from './plus-token.interceptor';
import { PlusBadgeEntitlement } from './plus-badge-entitlement';
import { PlusSession } from './plus-session';
import { PlusCatalogue } from './plus-catalogue';
import { PROFILE_SYNC_KEY } from './profile-sync-state';

beforeEach(() => {
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [provideHttpClient()] });
});
afterEach(() => vi.unstubAllGlobals());

it('disabled Plus prevents startup, focus, badge and free-account token traffic even with stored sync', async () => {
  TestBed.inject(FeatureFlags).setState('mawkingbird-plus', 'off');
  localStorage.setItem(PROFILE_SYNC_KEY, JSON.stringify({ state: 'on' }));
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const starter = TestBed.inject(ProfileSyncStarter);
  await starter.start();
  await starter.recheckOnFocus();
  await starter.recheckEntitlement();
  await TestBed.inject(PlusBadgeEntitlement).check();
  expect(await TestBed.inject(PlusTokenSource).token()).toBeNull();
  expect(await TestBed.inject(MawkingbirdSession).token()).toBeNull();
  expect(await TestBed.inject(PlusSession).token()).toBeNull();
  await TestBed.inject(PlusCatalogue).load();
  expect(fetch).not.toHaveBeenCalled();
  expect(TestBed.inject(MawkingbirdAccess).enabled()).toBe(false);
});

it.each(['selfhost.example', 'matthewdeanmartin.github.io', 'mawkingbird.com.evil.test'])(
  'self-hosted %s does not use operator account services',
  (host) => {
    expect(ownsMawkingbirdServices(host)).toBe(false);
  },
);

it('self-hosting stays silent even when the local Plus flag is switched on', async () => {
  TestBed.inject(FeatureFlags).setState('mawkingbird-plus', 'production');
  vi.stubGlobal('location', { hostname: 'selfhost.example', href: 'https://selfhost.example/' });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(await TestBed.inject(MawkingbirdSession).token()).toBeNull();
  await TestBed.inject(ProfileSyncStarter).start();
  await TestBed.inject(PlusBadgeEntitlement).check();
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['mawkingbird.com', 'localhost', '127.0.0.1'])(
  'owned/development host %s can use services when enabled',
  (host) => {
    expect(ownsMawkingbirdServices(host)).toBe(true);
  },
);
