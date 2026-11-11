import { describe, expect, it } from 'vitest';
import { needsAdoptionChoice, planAdoption } from './collection-adoption';

/**
 * The reconciliation rules, tested without a network or a TestBed.
 *
 * This is the file with the data-loss risk in it. The property that matters
 * most is negative: **no plan ever uploads an item that would overwrite a
 * stored one.** A browser the user is not looking at must not lose data because
 * of a choice made in front of them.
 */

interface Item {
  id: string;
  from: 'local' | 'remote';
}

const identity = (item: Item) => item.id;

function local(...ids: string[]): Item[] {
  return ids.map((id) => ({ id, from: 'local' as const }));
}
function remote(...ids: string[]): Item[] {
  return ids.map((id) => ({ id, from: 'remote' as const }));
}

describe('needsAdoptionChoice', () => {
  it('asks only when both sides hold something', () => {
    expect(needsAdoptionChoice(3, 2)).toBe(true);
  });

  it('does not ask when there is only one possible answer', () => {
    // Asking a question with one answer trains people to click through the ones
    // that matter.
    expect(needsAdoptionChoice(0, 5)).toBe(false);
    expect(needsAdoptionChoice(5, 0)).toBe(false);
    expect(needsAdoptionChoice(0, 0)).toBe(false);
  });
});

describe('planAdoption', () => {
  it('uploads everything to an account that holds nothing', () => {
    const plan = planAdoption(local('a', 'b'), [], 'merge', identity);

    expect(plan.remoteEmpty).toBe(true);
    expect(plan.upload.map(identity)).toEqual(['a', 'b']);
    expect(plan.local.map(identity)).toEqual(['a', 'b']);
  });

  it('uploads everything to an empty account even when replace was chosen', () => {
    // There is no conflict to resolve, so the choice is moot: replacing local
    // with an empty remote would delete the user's data to no purpose.
    const plan = planAdoption(local('a'), [], 'replace', identity);

    expect(plan.local.map(identity)).toEqual(['a']);
  });

  describe('replace', () => {
    it('takes the stored copy and uploads nothing', () => {
      const plan = planAdoption(local('a', 'b'), remote('c'), 'replace', identity);

      expect(plan.local.map(identity)).toEqual(['c']);
      // Replace means this browser's version was the one being discarded, so
      // there is nothing to send.
      expect(plan.upload).toEqual([]);
    });
  });

  describe('merge', () => {
    it('keeps both sides', () => {
      const plan = planAdoption(local('a'), remote('b'), 'merge', identity);

      expect(plan.local.map(identity).sort()).toEqual(['a', 'b']);
      expect(plan.upload.map(identity)).toEqual(['a']);
    });

    it('lets the stored copy win an item held on both sides', () => {
      const plan = planAdoption(local('shared'), remote('shared'), 'merge', identity);

      expect(plan.local).toHaveLength(1);
      expect(plan.local[0].from).toBe('remote');
    });

    it('never uploads an item the account already holds', () => {
      // The property that keeps another browser's edit safe: an upload can only
      // ever contain items the account has never seen.
      const plan = planAdoption(
        local('shared', 'mine'),
        remote('shared', 'theirs'),
        'merge',
        identity,
      );

      expect(plan.upload.map(identity)).toEqual(['mine']);
      expect(plan.local.map(identity).sort()).toEqual(['mine', 'shared', 'theirs']);
    });

    it('uploads nothing when this browser has nothing new', () => {
      const plan = planAdoption(local('a'), remote('a', 'b'), 'merge', identity);

      expect(plan.upload).toEqual([]);
    });
  });

  describe('combine, for items that are the same thing with different contents', () => {
    interface List {
      title: string;
      members: string[];
    }
    const byTitle = (list: List) => list.title;
    const union = (a: List, b: List): List => ({
      title: b.title,
      members: [...new Set([...b.members, ...a.members])],
    });

    it('unions the two sides rather than letting remote win outright', () => {
      // Two lists with the same name are the same list, but their memberships
      // are not necessarily the same — taking remote wholesale would silently
      // drop members added on this browser.
      const plan = planAdoption(
        [{ title: 'Friends', members: ['a'] }],
        [{ title: 'Friends', members: ['b'] }],
        'merge',
        byTitle,
        union,
      );

      expect(plan.local).toHaveLength(1);
      expect([...plan.local[0].members].sort()).toEqual(['a', 'b']);
    });

    it('uploads the combined item, because it differs from what is stored', () => {
      const plan = planAdoption(
        [{ title: 'Friends', members: ['a'] }],
        [{ title: 'Friends', members: ['b'] }],
        'merge',
        byTitle,
        union,
      );

      expect(plan.upload).toHaveLength(1);
      expect([...plan.upload[0].members].sort()).toEqual(['a', 'b']);
    });

    it('uploads nothing when combining changes nothing', () => {
      // `union` returns the remote object itself when there is nothing to add,
      // which is how a no-op is detected without comparing contents.
      const remoteList = { title: 'Friends', members: ['a'] };
      const plan = planAdoption(
        [{ title: 'Friends', members: ['a'] }],
        [remoteList],
        'merge',
        byTitle,
        (a, b) => (a.members.every((m) => b.members.includes(m)) ? b : union(a, b)),
      );

      expect(plan.upload).toEqual([]);
    });

    it('still carries across lists the account has never seen', () => {
      const plan = planAdoption(
        [
          { title: 'Friends', members: ['a'] },
          { title: 'Mine only', members: ['c'] },
        ],
        [{ title: 'Friends', members: ['b'] }],
        'merge',
        byTitle,
        union,
      );

      expect(plan.local.map(byTitle).sort()).toEqual(['Friends', 'Mine only']);
      expect(plan.upload.map(byTitle).sort()).toEqual(['Friends', 'Mine only']);
    });

    it('drops nothing the account holds', () => {
      // The invariant that survives `combine`: a list on the account is never
      // lost, whatever this browser has.
      const plan = planAdoption(
        [{ title: 'Friends', members: ['a'] }],
        [
          { title: 'Friends', members: ['b'] },
          { title: 'Theirs only', members: ['d'] },
        ],
        'merge',
        byTitle,
        union,
      );

      expect(plan.local.map(byTitle).sort()).toEqual(['Friends', 'Theirs only']);
    });
  });

  it('never plans an upload that overwrites a stored item, whatever the choice', () => {
    // Stated as a property over both answers, because it is the one rule that
    // must hold no matter which button was pressed. Applies to the no-`combine`
    // form; the `combine` case has its own weaker guarantee, tested above.
    const remoteItems = remote('x', 'y');
    const stored = new Set(remoteItems.map(identity));

    for (const choice of ['merge', 'replace'] as const) {
      const plan = planAdoption(local('x', 'z'), remoteItems, choice, identity);
      expect(
        plan.upload.some((item) => stored.has(identity(item))),
        choice,
      ).toBe(false);
    }
  });
});
