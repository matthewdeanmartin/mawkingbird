import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BulkFollowConfirmation } from './bulk-follow-confirmation';

describe('BulkFollowConfirmation', () => {
  afterEach(() => vi.restoreAllMocks());
  it('confirms the actual count and honors cancellation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const guard = TestBed.inject(BulkFollowConfirmation);
    expect(guard.allow(7)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('7'));
    confirm.mockReturnValue(true);
    expect(guard.allow(7)).toBe(true);
  });
  it('leaves anonymous follows immediate and ignores empty batches', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const guard = TestBed.inject(BulkFollowConfirmation);
    expect(guard.allow(7, true)).toBe(true);
    expect(guard.allow(0)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
});
