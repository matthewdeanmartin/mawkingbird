import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeedCtaStore } from './feed-cta-store';
import { FEATURE_CTAS, FEED_CTA_INTERVAL, PLUS_CTAS } from './feed-ctas';
import { FeatureUseHistory } from './feature-use-history';
import { FeatureFlags } from './feature-flags';
import { PlusPromotions } from './providers/account/plus-promotion';
import { VAULT_TEST_ROLLOUT } from './providers/vault/vault-preference';

describe('Mixed feed CTA cards', () => {
  const showPlus = signal(true);
  const used = signal<ReadonlySet<string>>(new Set());
  const disabled = signal<ReadonlySet<string>>(new Set());
  beforeEach(() => {
    showPlus.set(true);
    used.set(new Set());
    disabled.set(new Set());
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FeatureUseHistory,
          useValue: {
            has: (id: string) => used().has(id),
            mark: (id: string) => used.update((ids) => new Set([...ids, id])),
          },
        },
        { provide: FeatureFlags, useValue: { enabled: (id: string) => !disabled().has(id) } },
        { provide: PlusPromotions, useValue: { visible: showPlus } },
        { provide: VAULT_TEST_ROLLOUT, useValue: true },
      ],
    });
  });
  const slot = (n: number) => (n + 1) * FEED_CTA_INTERVAL - 1;
  it('places at most one card every fifteen posts without duplicates or refresh reshuffling', () => {
    const store = TestBed.inject(FeedCtaStore);
    const cards = Array.from({ length: FEED_CTA_INTERVAL * 30 }, (_, i) => store.after(i)).filter(
      (card) => card !== null,
    );
    expect(cards).toHaveLength(30);
    expect(new Set(cards.map((card) => card.id)).size).toBe(30);
    expect(store.after(slot(0))).toBe(cards[0]);
    expect(store.after(FEED_CTA_INTERVAL - 2)).toBeNull();
    expect(store.after(-1)).toBeNull();
    expect(store.after(slot(30))).toBeNull();
  });
  it('omits used features and hides an opened or dismissed card without moving its neighbors', () => {
    used.set(new Set(['bookmarks', 'analytics']));
    const store = TestBed.inject(FeedCtaStore);
    const first = store.after(slot(0))!;
    const second = store.after(slot(1))!;
    store.opened(first);
    expect(store.after(slot(0))).toBeNull();
    expect(store.after(slot(1))).toBe(second);
    store.dismiss(second);
    expect(store.after(slot(1))).toBeNull();
    const rest = Array.from({ length: 30 }, (_, i) => store.after(slot(i))).filter(
      (card) => card !== null,
    );
    expect(
      rest.some((card) => ['bookmarks', 'analytics', first.id, second.id].includes(card.id)),
    ).toBe(false);
  });
  it('respects Plus visibility and individual capability rollout gates', () => {
    showPlus.set(false);
    disabled.set(new Set(['write']));
    const store = TestBed.inject(FeedCtaStore);
    const cards = Array.from({ length: 30 }, (_, i) => store.after(slot(i))).filter(
      (card) => card !== null,
    );
    expect(cards).toHaveLength(FEATURE_CTAS.length - 1);
    expect(cards.some((card) => card.plus || card.id === 'write')).toBe(false);
    showPlus.set(true);
    const next = store.after(slot(30));
    expect(PLUS_CTAS.some((card) => card.id === next?.id)).toBe(true);
    showPlus.set(false);
    expect(store.after(slot(30))).toBeNull();
  });
  it('never offers the credential vault outside its rollout', () => {
    TestBed.overrideProvider(VAULT_TEST_ROLLOUT, { useValue: false });
    disabled.set(new Set(['proxy-mawkingbird-plus']));
    const store = TestBed.inject(FeedCtaStore);
    const cards = Array.from({ length: 30 }, (_, i) => store.after(slot(i))).filter(
      (card) => card !== null,
    );
    expect(cards).toHaveLength(28);
    expect(cards.some((card) => card.id === 'plus-connections' || card.id === 'plus-proxy')).toBe(
      false,
    );
  });
});
