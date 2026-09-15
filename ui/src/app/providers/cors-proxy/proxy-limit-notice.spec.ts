import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlags } from '../../feature-flags';
import { PlusBadgeEntitlement, PlusBadgeState } from '../account/plus-badge-entitlement';
import { PlusCatalogue } from '../account/plus-catalogue';
import { fakePlusCatalogue } from '../../testing/plus-catalogue';
import { ProxyActivity, PROXY_PAUSED_KEY, PROXY_PROMPT_KEY } from './proxy-activity';
import { ProxyLimitNotice } from './proxy-limit-notice';

describe('Proxy limit notice', () => {
  const enabled = signal(false);
  const tier = signal<PlusBadgeState>('free');
  const check = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.removeItem(PROXY_PROMPT_KEY);
    localStorage.removeItem(PROXY_PAUSED_KEY);
    enabled.set(false);
    tier.set('free');
    check.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FeatureFlags, useValue: { enabled: () => enabled() } },
        { provide: PlusBadgeEntitlement, useValue: { state: tier, check } },
        { provide: PlusCatalogue, useValue: fakePlusCatalogue() },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    sessionStorage.removeItem(PROXY_PROMPT_KEY);
    localStorage.removeItem(PROXY_PAUSED_KEY);
  });
  function render() {
    const fixture = TestBed.createComponent(ProxyLimitNotice);
    const activity = TestBed.inject(ProxyActivity);
    activity.exhausted('10', true);
    fixture.detectChanges();
    return { fixture, activity, element: fixture.nativeElement as HTMLElement };
  }
  it('offers a dismissible toast with Plus off and does not consume an upgrade prompt', () => {
    const { fixture, activity, element } = render();
    expect(element.querySelector('.toast')).not.toBeNull();
    expect(element.querySelector('a')).toBeNull();
    expect(element.querySelector('dialog')).toBeNull();
    expect(check).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PROXY_PROMPT_KEY)).toBeNull();
    element.querySelector('button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('aside')).toBeNull();
    expect(activity.paused()).toBe(false);
    activity.exhausted('10', true);
    fixture.detectChanges();
    expect(element.querySelector('aside')).toBeNull();
  });
  it('shows a nonmodal Plus card for confirmed free membership and clears on expiry', () => {
    enabled.set(true);
    const { fixture, element } = render();
    expect(element.querySelector('.toast')).toBeNull();
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/settings/mawkingbird-plus');
    expect(element.querySelector('app-plus-price')).not.toBeNull();
    expect(element.querySelector('dialog')).toBeNull();
    vi.advanceTimersByTime(10_000);
    fixture.detectChanges();
    expect(element.querySelector('aside')).toBeNull();
  });
  it.each(['plus', 'checking', 'unavailable'] as const)(
    'does not upsell %s membership',
    (state) => {
      enabled.set(true);
      tier.set(state);
      const { element } = render();
      expect(element.querySelector('.toast')).not.toBeNull();
      expect(element.querySelector('a')).toBeNull();
      expect(sessionStorage.getItem(PROXY_PROMPT_KEY)).toBeNull();
    },
  );
  it('waits for free membership and immediately removes the offer if Plus is disabled', () => {
    enabled.set(true);
    tier.set('checking');
    const { fixture, element } = render();
    tier.set('free');
    fixture.detectChanges();
    expect(element.querySelector('a')).not.toBeNull();
    enabled.set(false);
    fixture.detectChanges();
    expect(element.querySelector('a')).toBeNull();
    expect(element.querySelector('.toast')).not.toBeNull();
  });
  it('suppresses an existing offer when a service-capacity refusal arrives', () => {
    enabled.set(true);
    const { fixture, activity, element } = render();
    activity.exhausted('10', true, { cause: 'service_capacity', scope: 'all_routes' });
    fixture.detectChanges();
    expect(element.querySelector('a')).toBeNull();
    expect(element.querySelector('.toast')).not.toBeNull();
  });
});
