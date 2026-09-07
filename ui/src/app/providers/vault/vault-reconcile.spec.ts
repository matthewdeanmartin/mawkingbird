import { describe, expect, it, vi } from 'vitest';
import { reconcileScalar } from './vault-reconcile';

describe('scalar vault reconciliation', () => {
  it('restores remote something into local nothing', async () => {
    const restore = vi.fn(() => true);
    const store = vi.fn();

    await expect(
      reconcileScalar({
        local: null,
        remote: 'remote',
        restore,
        store,
        conflictMessage: 'conflict',
      }),
    ).resolves.toEqual({ kind: 'restored' });
    expect(restore).toHaveBeenCalledWith('remote');
    expect(store).not.toHaveBeenCalled();
  });

  it('stores local something into remote nothing', async () => {
    const store = vi.fn(async () => ({ kind: 'stored' as const, overwritten: [] }));

    await expect(
      reconcileScalar({
        local: 'local',
        remote: null,
        restore: vi.fn(),
        store,
        conflictMessage: 'conflict',
      }),
    ).resolves.toEqual({ kind: 'stored' });
    expect(store).toHaveBeenCalledOnce();
  });

  it('does not clobber two different non-empty values', async () => {
    const restore = vi.fn();
    const store = vi.fn();

    await expect(
      reconcileScalar({
        local: 'local',
        remote: 'remote',
        restore,
        store,
        conflictMessage: 'kept both',
      }),
    ).resolves.toEqual({ kind: 'conflict', message: 'kept both' });
    expect(restore).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it('leaves equal and doubly-empty values alone', async () => {
    const base = { restore: vi.fn(), store: vi.fn(), conflictMessage: 'conflict' };
    await expect(reconcileScalar({ ...base, local: 'same', remote: 'same' })).resolves.toEqual({
      kind: 'unchanged',
    });
    await expect(reconcileScalar({ ...base, local: null, remote: null })).resolves.toEqual({
      kind: 'skipped',
    });
  });
});
