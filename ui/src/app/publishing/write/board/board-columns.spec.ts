import { describe, expect, it } from 'vitest';
import { DraftItem, DraftKind } from '../../drafts/draft-items';
import { WriteColumn } from '../write-workspace';
import { columnFor, groupByColumn, isDerivedColumn, movableColumns } from './board-columns';

function item(id: string, kind: DraftKind = 'local', at = '2026-08-08T12:00:00Z'): DraftItem {
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    at,
    preview: `draft ${id}`,
    visibility: 'public',
    badges: [],
    source: { kind: 'local', draft: { id } },
  } as unknown as DraftItem;
}

/** A stored-column lookup built from a plain map. */
function lookup(stored: Record<string, WriteColumn>) {
  return (key: string) => stored[key];
}

describe('columnFor', () => {
  it('defaults an untriaged draft to Ideas', () => {
    // Untouched work should be visible, not flattered.
    expect(columnFor(item('1'), undefined)).toBe('ideas');
  });

  it('honours a stored column', () => {
    expect(columnFor(item('1'), 'editing')).toBe('editing');
    expect(columnFor(item('1'), 'writing')).toBe('writing');
  });

  it('derives Scheduled from the draft kind, whatever is stored', () => {
    // A parked post *is* scheduled; that is a fact, not an opinion.
    expect(columnFor(item('1', 'scheduled'), undefined)).toBe('scheduled');
    expect(columnFor(item('1', 'scheduled'), 'ideas')).toBe('scheduled');
  });

  it('ignores a stored Scheduled on a draft that is not scheduled', () => {
    // Otherwise the card strands in a column it can never be dragged out of.
    expect(columnFor(item('1', 'local'), 'scheduled')).toBe('ideas');
  });

  it('puts self and paste drafts in the ordinary columns', () => {
    expect(columnFor(item('1', 'self'), 'writing')).toBe('writing');
    expect(columnFor(item('1', 'paste'), undefined)).toBe('ideas');
  });
});

describe('isDerivedColumn and movableColumns', () => {
  it('only Scheduled is derived', () => {
    expect(isDerivedColumn('scheduled')).toBe(true);
    expect(isDerivedColumn('ideas')).toBe(false);
  });

  it('offers the three hand-moved columns', () => {
    expect(movableColumns()).toEqual(['ideas', 'writing', 'editing']);
  });
});

describe('groupByColumn', () => {
  it('returns all four columns in order, even when empty', () => {
    expect(groupByColumn([], lookup({})).map((c) => c.id)).toEqual([
      'ideas',
      'writing',
      'editing',
      'scheduled',
    ]);
  });

  it('puts every item in exactly one column', () => {
    const items = [item('1'), item('2', 'scheduled'), item('3', 'self')];
    const grouped = groupByColumn(items, lookup({ 'self:3': 'editing' }));

    expect(grouped.flatMap((c) => c.items)).toHaveLength(3);
    expect(grouped.find((c) => c.id === 'ideas')!.items.map((i) => i.id)).toEqual(['1']);
    expect(grouped.find((c) => c.id === 'editing')!.items.map((i) => i.id)).toEqual(['3']);
    expect(grouped.find((c) => c.id === 'scheduled')!.items.map((i) => i.id)).toEqual(['2']);
  });

  it('sorts newest first within a column', () => {
    const older = item('old', 'local', '2026-08-01T00:00:00Z');
    const newer = item('new', 'local', '2026-08-07T00:00:00Z');
    const grouped = groupByColumn([older, newer], lookup({}));

    expect(grouped[0].items.map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('does not mutate the input array', () => {
    const items = [item('1'), item('2')];
    const before = [...items];
    groupByColumn(items, lookup({}));
    expect(items).toEqual(before);
  });
});
