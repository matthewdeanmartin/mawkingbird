import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { scopedKey } from '../../account-scope';
import { WriteWorkspace } from './write-workspace';

const KEY = 'mockingbird_write_workspace';

/** A fresh instance, so the constructor re-reads whatever localStorage holds. */
function workspace(): WriteWorkspace {
  TestBed.resetTestingModule();
  return TestBed.inject(WriteWorkspace);
}

describe('WriteWorkspace', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to the rule split mode for a draft it has never seen', () => {
    expect(workspace().splitMode('local:1')).toBe('rule');
  });

  it('round-trips a split mode through storage', () => {
    workspace().setSplitMode('local:1', 'auto');
    expect(workspace().splitMode('local:1')).toBe('auto');
  });

  it('keeps modes for different drafts apart', () => {
    const store = workspace();
    store.setSplitMode('local:1', 'auto');
    store.setSplitMode('self:2', 'demand');
    expect(store.splitMode('local:1')).toBe('auto');
    expect(store.splitMode('self:2')).toBe('demand');
  });

  it('stores under an account-scoped key', () => {
    workspace().setSplitMode('local:1', 'auto');
    expect(localStorage.getItem(scopedKey(KEY))).toContain('auto');
  });

  it('carries a column written by a later sprint without losing the split mode', () => {
    const store = workspace();
    store.setSplitMode('local:1', 'demand');
    store.setColumn('local:1', 'editing');
    const reloaded = workspace();
    expect(reloaded.splitMode('local:1')).toBe('demand');
    expect(reloaded.column('local:1')).toBe('editing');
  });

  it('prunes entries whose draft is gone and keeps the ones that remain', () => {
    const store = workspace();
    store.setSplitMode('local:1', 'auto');
    store.setSplitMode('local:2', 'demand');
    store.prune(['local:2']);
    const reloaded = workspace();
    expect(reloaded.splitMode('local:2')).toBe('demand');
    // Back to the default, because the entry is gone.
    expect(reloaded.splitMode('local:1')).toBe('rule');
  });

  it('forgets one draft without touching the others', () => {
    const store = workspace();
    store.setSplitMode('local:1', 'auto');
    store.setSplitMode('local:2', 'auto');
    store.forget('local:1');
    expect(workspace().splitMode('local:1')).toBe('rule');
    expect(workspace().splitMode('local:2')).toBe('auto');
  });

  it('survives a malformed record rather than throwing', () => {
    localStorage.setItem(scopedKey(KEY), 'not json at all');
    expect(workspace().splitMode('local:1')).toBe('rule');
  });

  it('ignores entries that are not objects', () => {
    localStorage.setItem(scopedKey(KEY), JSON.stringify({ 'local:1': 'auto', 'local:2': null }));
    expect(workspace().splitMode('local:1')).toBe('rule');
  });

  it('falls back on an unknown split mode but keeps the column', () => {
    // An older or newer build, or a hand-edited value. Dropping the whole entry
    // would lose a column this build does understand.
    localStorage.setItem(
      scopedKey(KEY),
      JSON.stringify({ 'local:1': { splitMode: 'telepathy', column: 'ideas' } }),
    );
    const store = workspace();
    expect(store.splitMode('local:1')).toBe('rule');
    expect(store.column('local:1')).toBe('ideas');
  });

  it('drops an unrecognized column', () => {
    localStorage.setItem(
      scopedKey(KEY),
      JSON.stringify({ 'local:1': { splitMode: 'auto', column: 'someday' } }),
    );
    expect(workspace().column('local:1')).toBeUndefined();
  });
});
