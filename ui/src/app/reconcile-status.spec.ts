import { describe, it, expect } from 'vitest';
import { Status } from './models';
import { reconcileStatus } from './reconcile-status';

const original = { id: 'post', reblog: null, reblogged: true } as Status;
const boost = (id: string, actor: string): Status =>
  ({ id, account: { id: actor }, reblog: original }) as Status;
describe('Timeline interaction reconciliation', () => {
  it('removes the viewer boost after undo while preserving the original and other boosters', () => {
    const mine = boost('mine', 'me');
    const theirs = boost('theirs', 'friend');
    const updated = { ...original, reblogged: false };
    expect(reconcileStatus([mine, theirs, original], updated, 'me')).toEqual([
      { ...theirs, reblog: updated },
      updated,
    ]);
  });
  it('updates a nested liked post without erasing its boost attribution', () => {
    const mine = boost('mine', 'me');
    const updated = { ...original, favourited: true };
    expect(reconcileStatus([mine], updated, 'me')).toEqual([{ ...mine, reblog: updated }]);
  });
  it('keeps other people boosts when signed out', () => {
    const theirs = boost('theirs', 'friend');
    const updated = { ...original, reblogged: false };
    expect(reconcileStatus([theirs], updated)).toEqual([{ ...theirs, reblog: updated }]);
  });
});
