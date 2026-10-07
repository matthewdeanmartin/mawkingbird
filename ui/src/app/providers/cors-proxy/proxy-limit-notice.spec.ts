import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlags } from '../../feature-flags';
import { PlusBadgeEntitlement, PlusBadgeState } from '../account/plus-badge-entitlement';
import { PlusCatalogue } from '../account/plus-catalogue';
import { fakePlusCatalogue } from '../../testing/plus-catalogue';
import { ProxyActivity, PROXY_PAUSED_KEY, PROXY_PROMPT_KEY } from './proxy-activity';
import { ProxyAccountSignup, ProxyLimitNotice } from './proxy-limit-notice';

describe('Proxy limit notice', () => {
  const dialogDescriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );
  it('allows account creation while billing is unavailable', async () => {
    const fixture = TestBed.createComponent(ProxyLimitNotice);
    const activity = TestBed.inject(ProxyActivity);
    activity.exhausted('86400', true, {
      cause: 'caller_allowance',
      scope: 'all_routes',
      tier: 'free',
      identity: 'ip',
      allowance: 'daily',
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('dialog')?.open).toBe(true);
    expect(element.querySelector('dialog a')).toBeNull();
    element.querySelector<HTMLButtonElement>('dialog button')!.click();
    fixture.detectChanges();
    const input = element.querySelector<HTMLInputElement>('input')!;
    input.value = 'reader@example.org';
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    fixture.detectChanges();
    expect(TestBed.inject(ProxyAccountSignup).send).toHaveBeenCalledWith('reader@example.org');
    expect(fixture.componentInstance.signupStatus()).toBe('proxy.limit.linkSent');
    expect(activity.paused()).toBe(false);
  });
  const enabled = signal(false);
  const tier = signal<PlusBadgeState>('free');
  const check = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    for (const [name] of dialogDescriptors)
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
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
        { provide: ProxyAccountSignup, useValue: { send: vi.fn().mockResolvedValue(true) } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    sessionStorage.removeItem(PROXY_PROMPT_KEY);
    localStorage.removeItem(PROXY_PAUSED_KEY);
    for (const [name, descriptor] of dialogDescriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
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
    expect(element.querySelector('dialog')?.open).toBe(false);
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
    expect(element.querySelector('dialog')?.open).toBe(false);
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
  it.each(['ip', 'account'] as const)(
    'opens a daily allowance dialog for %s callers with the appropriate choices',
    (identity) => {
      enabled.set(true);
      const fixture = TestBed.createComponent(ProxyLimitNotice);
      const activity = TestBed.inject(ProxyActivity);
      activity.exhausted('86400', true, {
        cause: 'caller_allowance',
        scope: 'all_routes',
        tier: 'free',
        identity,
        allowance: 'daily',
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('dialog')?.open).toBe(true);
      expect(element.querySelectorAll('dialog a')).toHaveLength(1);
      expect(element.querySelector('aside')).toBeNull();
      const buttons = element.querySelectorAll<HTMLButtonElement>('dialog button');
      buttons[identity === 'ip' ? 1 : 0]!.click();
      fixture.detectChanges();
      expect(activity.paused()).toBe(true);
      expect(localStorage.getItem(PROXY_PAUSED_KEY)).toBe('true');
      expect(element.querySelector('dialog')?.open).toBe(false);
      expect(() => activity.assertAllowed()).toThrow('disabled');
    },
  );
  it('opens the destination dialog without blocking requests to free domains', () => {
    enabled.set(true);
    const fixture = TestBed.createComponent(ProxyLimitNotice);
    const activity = TestBed.inject(ProxyActivity);
    activity.exhausted(null, true, {
      cause: 'destination_policy',
      scope: 'route',
      route: 'feeds',
      tier: 'free',
      identity: 'ip',
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('dialog')?.open).toBe(true);
    expect(() => activity.assertAllowed('feeds')).not.toThrow();
    activity.dismissNotice();
    fixture.detectChanges();
    expect(element.querySelector('dialog')?.open).toBe(false);
    activity.exhausted('60', true, { cause: 'destination_policy', scope: 'route', route: 'feeds' });
    fixture.detectChanges();
    expect(element.querySelector('dialog')?.open).toBe(false);
  });
});
