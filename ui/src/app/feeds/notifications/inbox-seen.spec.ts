import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadMarkers } from '../home/read-markers';
import { InboxSeen } from './inbox-seen';

describe('InboxSeen', () => {
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    refresh = vi.fn(async () => null);
    TestBed.configureTestingModule({
      providers: [{ provide: ReadMarkers, useValue: { refresh } }],
    });
  });

  it('knows nothing on a first visit, then remembers this one', async () => {
    const seen = TestBed.inject(InboxSeen);
    expect(await seen.previousVisit()).toBeNull();
    const second = await seen.previousVisit();
    expect(second).not.toBeNull();
    expect(Date.now() - second!).toBeLessThan(5000);
  });

  it('prefers the server’s notifications marker, which follows the reader across devices', async () => {
    refresh.mockResolvedValue({
      notifications: { last_read_id: '9', version: 1, updated_at: '2026-11-20T08:00:00Z' },
    });
    expect(await TestBed.inject(InboxSeen).previousVisit()).toBe(
      Date.parse('2026-11-20T08:00:00Z'),
    );
  });
});
