import { HttpTestingController } from '@angular/common/http/testing';
import { TranslocoService } from '@jsverse/transloco';
import { provideI18n, translationUrl } from '../i18n/i18n.config';
import { FEATURE_CTAS, PLUS_CTAS } from '../feed-ctas';
import { PlusCatalogue } from '../providers/account/plus-catalogue';
import { fakePlusCatalogue } from '../testing/plus-catalogue';
import en from '../../../public/i18n/en.json';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientPrefs } from '../client-prefs';
import { DISCOVERY_WAYS } from '../discovery-ways';
import { DiscoveryCard } from './discovery-card';

describe('DiscoveryCard branding', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    ['/', 'mockingbird_hand_104.png', 'mockigbird_logo_104.png'],
    ['/canary/', 'canary_hand_104.png', 'canary_logo_104.png'],
    ['/test/', 'canary_hand_104.png', 'canary_logo_104.png'],
  ])('uses the %s bird and reacts to art preference changes', (base, hand, ai) => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue(`https://mawkingbird.com${base}`);
    const fixture = TestBed.createComponent(DiscoveryCard);
    fixture.componentRef.setInput('way', DISCOVERY_WAYS[0]);
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setArtStyle('hand');
    fixture.detectChanges();
    const avatar = (fixture.nativeElement as HTMLElement).querySelector('img')!;
    expect(avatar.getAttribute('src')).toBe(hand);
    prefs.setArtStyle('ai');
    fixture.detectChanges();
    expect(avatar.getAttribute('src')).toBe(ai);
    prefs.setArtStyle('hand');
    fixture.detectChanges();
    expect(avatar.getAttribute('src')).toBe(hand);
  });
});

describe('Discovery cards inserted after runtime translation loading', () => {
  beforeEach(() => {
    // The normal suite preloads English. Use the production HTTP loader here
    // so this catches problems that only appear in a deployed app.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideI18n(),
        { provide: PlusCatalogue, useValue: fakePlusCatalogue() },
      ],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
  });
  it('renders the complete inventory with a visible heading when Load More inserts cards', async () => {
    const http = TestBed.inject(HttpTestingController);
    const first = TestBed.createComponent(DiscoveryCard);
    first.componentRef.setInput('way', DISCOVERY_WAYS[0]);
    first.detectChanges();
    http.expectOne(translationUrl('en', document.baseURI)).flush(en);
    await first.whenStable();
    first.detectChanges();
    expect(first.nativeElement.querySelector('.card-heading').textContent).toContain(
      "Explore Mawkingbird's Features",
    );
    first.destroy();

    for (const card of [...FEATURE_CTAS, ...PLUS_CTAS]) {
      const fixture = TestBed.createComponent(DiscoveryCard);
      fixture.componentRef.setInput('way', card);
      fixture.componentRef.setInput('plus', !!card.plus);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const translate = TestBed.inject(TranslocoService);
      expect(root.querySelector('.card-heading')?.textContent).toContain(
        card.plus ? 'Mawkingbird Plus' : "Explore Mawkingbird's Features",
      );
      expect(root.querySelector('.content strong')?.textContent).toBe(
        translate.translate(card.title) + ':',
      );
      expect(root.querySelector('.content')?.textContent).toContain(
        translate.translate(card.description),
      );
      expect(root.textContent).not.toMatch(/cta\.|discovery\.|pages\.findFriends/);
      fixture.destroy();
    }
    http.expectNone(translationUrl('en', document.baseURI));
  });
  it('uses English for new feature keys missing from the selected language on later cards', async () => {
    const http = TestBed.inject(HttpTestingController);
    const first = TestBed.createComponent(DiscoveryCard);
    first.componentRef.setInput('way', DISCOVERY_WAYS[0]);
    first.detectChanges();
    http.expectOne(translationUrl('en', document.baseURI)).flush(en);
    await first.whenStable();
    TestBed.inject(TranslocoService).setActiveLang('es');
    first.detectChanges();
    http.expectOne(translationUrl('es', document.baseURI)).flush({
      discovery: { 'card.featureHeading': 'Explora Mawkingbird' },
    });
    await first.whenStable();
    first.destroy();
    for (const id of ['rss', 'drafts', 'analytics']) {
      const fixture = TestBed.createComponent(DiscoveryCard);
      fixture.componentRef.setInput(
        'way',
        FEATURE_CTAS.find((card) => card.id === id)!,
      );
      fixture.detectChanges();
      // Partial locales request English as their fallback on first use.
      for (const request of http.match(translationUrl('en', document.baseURI))) request.flush(en);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.card-heading').textContent).toContain(
        'Explora Mawkingbird',
      );
      expect(fixture.nativeElement.textContent).not.toContain('cta.');
      expect(
        fixture.nativeElement.querySelector('.content').textContent.trim().length,
      ).toBeGreaterThan(30);
      fixture.destroy();
    }
  });
});
