import { describe, expect, it } from 'vitest';
import { DISCOVERY_WAYS } from './discovery-ways';
import { FEED_CTA_INTERVAL, FEATURE_CTAS, PLUS_CTAS } from './feed-ctas';
import { shuffleCtas } from './feed-cta-store';

describe('Home discovery card schedule', () => {
  it('uses fifteen-post spacing and mixes twenty features with ten Plus pitches', () => {
    expect(Number.isInteger(FEED_CTA_INTERVAL) && FEED_CTA_INTERVAL > 0).toBe(true);
    expect(FEATURE_CTAS).toHaveLength(20);
    expect(PLUS_CTAS).toHaveLength(10);
    expect(FEATURE_CTAS.slice(0, DISCOVERY_WAYS.length)).toEqual(DISCOVERY_WAYS);
    const all = [...FEATURE_CTAS, ...PLUS_CTAS];
    expect(new Set(all.map((card) => card.id)).size).toBe(30);
    const shuffled = shuffleCtas(all, () => 0.25);
    expect(shuffled).not.toEqual(all);
    expect(new Set(shuffled.map((card) => card.id))).toEqual(new Set(all.map((card) => card.id)));
  });
});
