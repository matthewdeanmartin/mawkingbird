import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlags } from '../../feature-flags';
import { HouseAdStore } from '../../house-ad-store';
import { PlusBadgeEntitlement, PlusBadgeState } from './plus-badge-entitlement';
import { PlusCatalogue } from './plus-catalogue';
import { fakePlusCatalogue } from '../../testing/plus-catalogue';
import { PlusPromotion } from './plus-promotion';

describe('Plus promotions', () => {
  const enabled = signal(false);
  const tier = signal<PlusBadgeState>('free');
  const ads = signal(true);
  const check = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    enabled.set(false);
    tier.set('free');
    ads.set(true);
    check.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: FeatureFlags,
          useValue: { enabled: (flag: string) => flag === 'mawkingbird-plus' && enabled() },
        },
        { provide: PlusBadgeEntitlement, useValue: { state: tier, check } },
        { provide: HouseAdStore, useValue: { enabled: ads } },
        { provide: PlusCatalogue, useValue: fakePlusCatalogue() },
      ],
    });
  });
  it('hides both placements and avoids entitlement checks until the Plus flag is enabled', () => {
    const feed = TestBed.createComponent(PlusPromotion);
    const rail = TestBed.createComponent(PlusPromotion);
    rail.componentRef.setInput('placement', 'rail');
    feed.detectChanges();
    rail.detectChanges();
    expect(feed.nativeElement.querySelector('aside')).toBeNull();
    expect(rail.nativeElement.querySelector('aside')).toBeNull();
    expect(check).not.toHaveBeenCalled();
    enabled.set(true);
    feed.detectChanges();
    rail.detectChanges();
    expect(feed.nativeElement.querySelector('aside')).not.toBeNull();
    expect(rail.nativeElement.querySelector('aside.rail')).not.toBeNull();
    expect(check).toHaveBeenCalledOnce();
    expect(feed.nativeElement.querySelector('a').getAttribute('href')).toBe(
      '/settings/mawkingbird-plus',
    );
    enabled.set(false);
    feed.detectChanges();
    rail.detectChanges();
    expect(feed.nativeElement.querySelector('aside')).toBeNull();
    expect(rail.nativeElement.querySelector('aside')).toBeNull();
  });
  it.each(['plus', 'checking', 'unavailable'] as const)(
    'does not pitch an account in the %s state',
    (state) => {
      enabled.set(true);
      tier.set(state);
      const fixture = TestBed.createComponent(PlusPromotion);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('aside')).toBeNull();
      tier.set('free');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('aside')).not.toBeNull();
      tier.set(state);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('aside')).toBeNull();
    },
  );
  it('honors ads-off and shares dismissal across placements and route recreation', () => {
    enabled.set(true);
    ads.set(false);
    const feed = TestBed.createComponent(PlusPromotion);
    feed.detectChanges();
    expect(feed.nativeElement.querySelector('aside')).toBeNull();
    ads.set(true);
    feed.detectChanges();
    feed.nativeElement.querySelector('button').click();
    feed.detectChanges();
    expect(feed.nativeElement.querySelector('aside')).toBeNull();
    feed.destroy();
    const rail = TestBed.createComponent(PlusPromotion);
    rail.componentRef.setInput('placement', 'rail');
    rail.detectChanges();
    expect(rail.nativeElement.querySelector('aside')).toBeNull();
  });
});
