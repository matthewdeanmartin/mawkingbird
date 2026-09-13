import { inject, Injectable, signal } from '@angular/core';
import { FeatureFlags } from './feature-flags';
import { FeatureUseHistory } from './feature-use-history';
import { FEED_CTA_INTERVAL, FEATURE_CTAS, PLUS_CTAS, FeedCta } from './feed-ctas';
import { PlusPromotions } from './providers/account/plus-promotion';
import { VAULT_TEST_ROLLOUT } from './providers/vault/vault-preference';

/** Fisher-Yates: stable for this app session, mixed again on the next load. */
export function shuffleCtas(cards: readonly FeedCta[], random = Math.random): FeedCta[] {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

@Injectable({ providedIn: 'root' })
export class FeedCtaStore {
  private history = inject(FeatureUseHistory);
  private flags = inject(FeatureFlags);
  private plus = inject(PlusPromotions);
  private vaultAvailable = inject(VAULT_TEST_ROLLOUT);
  private deck = shuffleCtas([...FEATURE_CTAS, ...PLUS_CTAS]);
  private slots = new Map<number, FeedCta>();
  private dismissed = signal<ReadonlySet<string>>(new Set());
  after(index: number): FeedCta | null {
    if (!Number.isInteger(index) || index < 0 || (index + 1) % FEED_CTA_INTERVAL !== 0) return null;
    let card = this.slots.get(index);
    if (!card) {
      const assigned = new Set([...this.slots.values()].map((value) => value.id));
      card = this.deck.find((value) => !assigned.has(value.id) && this.eligible(value));
      if (card) this.slots.set(index, card);
    }
    return card && this.eligible(card) ? card : null;
  }
  opened(card: FeedCta): void {
    this.history.mark(card.id);
  }
  dismiss(card: FeedCta): void {
    this.dismissed.update((ids) => new Set([...ids, card.id]));
  }
  private eligible(card: FeedCta): boolean {
    return (
      !this.history.has(card.id) &&
      !this.dismissed().has(card.id) &&
      (!card.flag || this.flags.enabled(card.flag)) &&
      (!card.vault || this.vaultAvailable) &&
      (!card.plus || this.plus.visible())
    );
  }
}
