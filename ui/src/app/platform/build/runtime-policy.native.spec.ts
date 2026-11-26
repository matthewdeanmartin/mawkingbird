import { provideHttpClient, withXhr } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FeatureFlags, isFeatureAvailableInBuild } from './feature-flags';
import {
  MawkingbirdAccess,
  canUseHostedProxy,
} from '../../accounts/mawkingbird/mawkingbird-access';
import { MawkingbirdSession } from '../../accounts/mawkingbird/mawkingbird-session';
import { AnalyticsTracker } from '../diagnostics/analytics-tracker';
import { ConfigSync } from '../storage/config-sync';

import { RUNTIME_POLICY } from './runtime-policy';
import { BUILD_RUNTIME_POLICY as policy } from './runtime-policy.native';

const events = new Subject<NavigationEnd>();
beforeEach(() => {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: RUNTIME_POLICY, useValue: policy },
      provideHttpClient(withXhr()),
      { provide: Router, useValue: { events } },
    ],
  });
});
afterEach(() => vi.unstubAllGlobals());

it('cannot enable hosted services through persisted feature preferences on a development host', async () => {
  const flags = TestBed.inject(FeatureFlags);
  flags.setState('mawkingbird-plus', 'production');
  flags.setState('proxy-mawkingbird-plus', 'production');
  vi.stubGlobal('location', { hostname: 'localhost' });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(isFeatureAvailableInBuild('mawkingbird-plus', policy)).toBe(false);
  expect(isFeatureAvailableInBuild('proxy-mawkingbird-plus', policy)).toBe(false);
  expect(TestBed.inject(MawkingbirdAccess).enabled()).toBe(false);
  expect(canUseHostedProxy('mawkingbird.com', policy)).toBe(false);
  expect(await TestBed.inject(MawkingbirdSession).token()).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it('does not load analytics on navigation or fetch remote configuration', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const tracker = TestBed.inject(AnalyticsTracker);
  tracker.start();
  events.next(new NavigationEnd(1, '/home', '/home'));
  expect(document.querySelector('script[data-goatcounter]')).toBeNull();
  await expect(
    TestBed.inject(ConfigSync).fetchStable('https://example.com/config'),
  ).rejects.toThrow('unavailable');
  expect(fetch).not.toHaveBeenCalled();
});
