import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FALLBACK_OFFER,
  PlusCatalogue,
  formatOffer,
  parseOffer,
  PlusOffer,
} from './plus-catalogue';

export const TEST_OFFER: PlusOffer = {
  offer: 'plus',
  available: true,
  version: 'price-fixture-v1',
  priceId: 'price_fixture',
  amount: 4200,
  currency: 'usd',
  interval: 'year',
  intervalCount: 1,
};
describe('PlusCatalogue', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('shares a request and renders the actual amount and recurring period', async () => {
    const catalogue = TestBed.inject(PlusCatalogue);
    expect(catalogue.offer()).toEqual(FALLBACK_OFFER);
    expect(catalogue.label()).toContain('30');
    const first = catalogue.load();
    const second = catalogue.load();
    http.expectOne('https://cors.mawkingbird.com/plus/catalogue').flush(TEST_OFFER);
    await Promise.all([first, second]);
    expect(catalogue.label()).toContain('42');
    expect(catalogue.label()).toContain('year');
    await catalogue.load();
    http.expectNone('https://cors.mawkingbird.com/plus/catalogue');
  });
  it('uses the annual fallback when revalidation fails and restores live pricing on retry', async () => {
    const catalogue = TestBed.inject(PlusCatalogue);
    catalogue.offer.set(TEST_OFFER);
    const pending = catalogue.load(true);
    http
      .expectOne('https://cors.mawkingbird.com/plus/catalogue')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await pending;
    expect(catalogue.offer()).toEqual(FALLBACK_OFFER);
    expect(catalogue.unavailable()).toBe(true);
    const retry = catalogue.load(true);
    http
      .expectOne('https://cors.mawkingbird.com/plus/catalogue')
      .flush({ ...TEST_OFFER, amount: 5000 });
    await retry;
    expect(catalogue.label()).toContain('50');
  });
  it('rejects missing or invalid commercial terms', () => {
    expect(parseOffer({ ...TEST_OFFER, amount: null })).toBeNull();
    expect(parseOffer({ ...TEST_OFFER, interval: 'forever' })).toBeNull();
    expect(parseOffer({ ...TEST_OFFER, available: false })).toBeNull();
  });
  it('formats zero-decimal currencies and multiple billing periods', () => {
    expect(
      formatOffer({ ...TEST_OFFER, currency: 'jpy', interval: 'month', intervalCount: 3 }, 'en'),
    ).toContain('4,200');
    expect(formatOffer({ ...TEST_OFFER, interval: 'month', intervalCount: 3 }, 'en')).toContain(
      '3 months',
    );
  });
});
