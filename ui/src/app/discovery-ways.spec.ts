import { describe, expect, it } from 'vitest';
import { DISCOVERY_WAYS, discoveryCardAfter } from './discovery-ways';

describe('Home discovery card schedule', () => {
  it('places one card after each twenty posts and cycles through every discovery method', () => {
    const cards = Array.from({ length: 400 }, (_, index) => ({
      index,
      way: discoveryCardAfter(index),
    })).filter((item) => item.way);
    expect(cards).toHaveLength(20);
    expect(cards.map((card) => card.index)).toEqual(
      Array.from({ length: 20 }, (_, index) => (index + 1) * 20 - 1),
    );
    expect(cards.slice(0, DISCOVERY_WAYS.length).map((card) => card.way!.id)).toEqual(
      DISCOVERY_WAYS.map((way) => way.id),
    );
    expect(cards[DISCOVERY_WAYS.length].way).toEqual(cards[0].way);
  });
});
