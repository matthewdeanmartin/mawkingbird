import { signal } from '@angular/core';
import { vi } from 'vitest';
import { formatOffer, PlusOffer } from '../providers/account/plus-catalogue';

export const catalogueOffer: PlusOffer = {
  offer: 'plus',
  available: true,
  version: 'fixture-v1',
  priceId: 'price_fixture',
  amount: 4200,
  currency: 'usd',
  interval: 'year',
  intervalCount: 1,
};
export function fakePlusCatalogue() {
  return {
    offer: signal(catalogueOffer),
    label: signal(formatOffer(catalogueOffer)),
    loading: signal(false),
    unavailable: signal(false),
    load: vi.fn().mockResolvedValue(undefined),
  };
}
