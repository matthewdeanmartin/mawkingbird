import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialogs } from './app-dialogs';
import { BulkFollowConfirmation } from './bulk-follow-confirmation';

describe('BulkFollowConfirmation', () => {
  afterEach(() => vi.restoreAllMocks());
  it('confirms the actual count and honors cancellation', async () => {
    const confirm = vi.spyOn(AppDialogs.prototype, 'confirm').mockResolvedValue(false);
    const guard = TestBed.inject(BulkFollowConfirmation);
    expect(await guard.allow(7)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('notifications'),
      expect.objectContaining({ title: 'Follow 7 accounts or topics?', confirmLabel: 'Follow 7' }),
    );
    confirm.mockResolvedValue(true);
    expect(await guard.allow(7)).toBe(true);
  });
  it('leaves anonymous follows immediate and ignores empty batches', async () => {
    const confirm = vi.spyOn(AppDialogs.prototype, 'confirm');
    const guard = TestBed.inject(BulkFollowConfirmation);
    expect(await guard.allow(7, true)).toBe(true);
    expect(await guard.allow(0)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('does not allow a second batch while confirmation is pending', async () => {
    let finish!: (value: boolean) => void;
    vi.spyOn(AppDialogs.prototype, 'confirm').mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const guard = TestBed.inject(BulkFollowConfirmation);
    const first = guard.allow(30);
    expect(await guard.allow(30)).toBe(false);
    finish(false);
    expect(await first).toBe(false);
  });
});
