import { describe, expect, it } from 'vitest';
import { PagedState, applyIncoming, mergeNewest } from './lite-store';

interface Item {
  id: string;
  v?: number;
}

function held(ids: string[], extra: Partial<PagedState<Item>> = {}): PagedState<Item> {
  return {
    items: ids.map((id) => ({ id })),
    cursor: ids.at(-1),
    loading: false,
    refreshing: true,
    failed: false,
    done: false,
    loadedAt: 1,
    fromSaved: false,
    incoming: [],
    gapAfter: null,
    anchorId: null,
    ...extra,
  };
}

describe('mergeNewest', () => {
  it('fills an empty list directly', () => {
    const merged = mergeNewest(held([]), { items: [{ id: '2' }, { id: '1' }], cursor: '1' }, 5);
    expect(merged.items.map((i) => i.id)).toEqual(['2', '1']);
    expect(merged.incoming).toEqual([]);
    expect(merged.loadedAt).toBe(5);
  });

  it('keeps held items and older pages, queues newer ones above, and updates changed copies', () => {
    const merged = mergeNewest(
      held(['3', '2', '1']),
      { items: [{ id: '5' }, { id: '4' }, { id: '3', v: 2 }] },
      9,
    );
    expect(merged.items).toEqual([{ id: '3', v: 2 }, { id: '2' }, { id: '1' }]);
    expect(merged.incoming.map((i) => i.id)).toEqual(['5', '4']);
    expect(merged.gapAfter).toBeNull();
    expect(merged.cursor).toBe('1');
  });

  it('marks a gap when the newest page does not reach the held posts', () => {
    const merged = mergeNewest(held(['2', '1']), { items: [{ id: '40' }, { id: '39' }] }, 9);
    expect(merged.incoming.map((i) => i.id)).toEqual(['40', '39']);
    expect(merged.gapAfter).toBe('39');
  });

  it('stacks a second refresh above posts still waiting, without duplicates', () => {
    const first = mergeNewest(held(['1']), { items: [{ id: '2' }, { id: '1' }] }, 9);
    const second = mergeNewest(
      { ...first, refreshing: true },
      { items: [{ id: '3' }, { id: '2' }, { id: '1' }] },
      10,
    );
    expect(second.incoming.map((i) => i.id)).toEqual(['3', '2']);
  });

  it('puts waiting posts on top when the reader asks', () => {
    const merged = mergeNewest(held(['1']), { items: [{ id: '2' }, { id: '1' }] }, 9);
    expect(applyIncoming(merged).items.map((i) => i.id)).toEqual(['2', '1']);
    expect(applyIncoming(merged).incoming).toEqual([]);
  });
});
