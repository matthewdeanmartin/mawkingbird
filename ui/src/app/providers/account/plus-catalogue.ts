import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { corsProxyOrigin } from '../../build-flavor';
import { externalFetch } from '../external-fetch';

export interface PlusOffer {
  offer: 'plus';
  version: string;
  priceId: string;
  amount: number;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  available: true;
}

// Interim public offer while catalogue access is unavailable. Checkout validates
// these terms against the server's configured price whenever Stripe can read it.
export const FALLBACK_OFFER: PlusOffer = {
  offer: 'plus',
  available: true,
  version: 'plus-fallback-usd-3000-year-1',
  priceId: '',
  amount: 3000,
  currency: 'usd',
  interval: 'year',
  intervalCount: 1,
};

export function parseOffer(value: unknown): PlusOffer | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<PlusOffer>;
  return v.offer === 'plus' &&
    v.available === true &&
    typeof v.version === 'string' &&
    typeof v.priceId === 'string' &&
    typeof v.currency === 'string' &&
    /^[a-z]{3}$/.test(v.currency) &&
    Number.isSafeInteger(v.amount) &&
    Number(v.amount) > 0 &&
    Number.isSafeInteger(v.intervalCount) &&
    Number(v.intervalCount) > 0 &&
    ['day', 'week', 'month', 'year'].includes(v.interval ?? '')
    ? (v as PlusOffer)
    : null;
}

export function formatOffer(offer: PlusOffer, locale = 'en'): string {
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: offer.currency });
  const digits = money.resolvedOptions().maximumFractionDigits ?? 2;
  const period = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: offer.interval,
    unitDisplay: 'long',
  });
  return `${money.format(offer.amount / 10 ** digits)} / ${period.format(offer.intervalCount)}`;
}

@Injectable({ providedIn: 'root' })
export class PlusCatalogue {
  private http = inject(HttpClient);
  readonly offer = signal<PlusOffer | null>(FALLBACK_OFFER);
  readonly loading = signal(false);
  readonly unavailable = signal(false);
  readonly label = computed(() => {
    const offer = this.offer();
    return offer ? formatOffer(offer, document.documentElement.lang || 'en') : null;
  });
  private pending: Promise<void> | null = null;
  private expires = 0;

  load(force = false): Promise<void> {
    if (this.pending) return this.pending;
    if (!force && this.offer() && Date.now() < this.expires) return Promise.resolve();
    this.loading.set(true);
    this.pending = firstValueFrom(
      this.http.get<unknown>(`${corsProxyOrigin()}/plus/catalogue`, { context: externalFetch() }),
    )
      .then((value) => {
        const offer = parseOffer(value);
        this.offer.set(offer ?? FALLBACK_OFFER);
        this.unavailable.set(!offer);
        this.expires = Date.now() + 300_000;
      })
      .catch(() => {
        this.offer.set(FALLBACK_OFFER);
        this.unavailable.set(true);
      })
      .finally(() => {
        this.loading.set(false);
        this.pending = null;
      });
    return this.pending;
  }
}
