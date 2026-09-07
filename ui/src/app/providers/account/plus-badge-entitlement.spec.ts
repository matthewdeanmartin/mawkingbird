import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MawkingbirdSession } from './mawkingbird-session';
import { PlusSession } from './plus-session';
import { SupporterStatus } from './supporter-status';
import { PlusBadgeEntitlement, plusBadgeState } from './plus-badge-entitlement';

describe('plusBadgeState', () => {
  it('does not call an unsettled account free', () => {
    expect(plusBadgeState(false, true, false)).toBe('checking');
  });

  it('gives confirmed Plus precedence over transient check state', () => {
    expect(plusBadgeState(true, true, false)).toBe('plus');
  });

  it('distinguishes a settled free plan from an unavailable check', () => {
    expect(plusBadgeState(false, false, false)).toBe('free');
    expect(plusBadgeState(false, false, true)).toBe('unavailable');
  });
});

describe('PlusBadgeEntitlement', () => {
  let supporter: SupporterStatus;
  let session: { ensureReady: ReturnType<typeof vi.fn>; user: ReturnType<typeof vi.fn> };
  let plus: { token: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    session = {
      ensureReady: vi.fn().mockResolvedValue(undefined),
      user: vi.fn().mockReturnValue({ auth: 'email', tier: 'free' }),
    };
    plus = { token: vi.fn().mockResolvedValue('free-token') };
    TestBed.configureTestingModule({
      providers: [
        PlusBadgeEntitlement,
        SupporterStatus,
        { provide: MawkingbirdSession, useValue: session },
        { provide: PlusSession, useValue: plus },
      ],
    });
    supporter = TestBed.inject(SupporterStatus);
  });

  it('shows Checking until the authoritative account lookup settles', async () => {
    let finish!: () => void;
    session.ensureReady.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const badge = TestBed.inject(PlusBadgeEntitlement);

    const checking = badge.check();
    expect(badge.state()).toBe('checking');

    finish();
    await checking;
    expect(badge.state()).toBe('free');
  });

  it('publishes Plus when token minting confirms the subscription', async () => {
    plus.token.mockImplementation(async () => {
      supporter.isSupporter.set(true);
      return 'plus-token';
    });
    const badge = TestBed.inject(PlusBadgeEntitlement);

    await badge.check();

    expect(session.ensureReady).toHaveBeenCalledOnce();
    expect(plus.token).toHaveBeenCalledOnce();
    expect(badge.state()).toBe('plus');
  });

  it('settles anonymous visitors to Free without asking for a Plus token', async () => {
    session.user.mockReturnValue(null);
    const badge = TestBed.inject(PlusBadgeEntitlement);

    await badge.check();

    expect(plus.token).not.toHaveBeenCalled();
    expect(badge.state()).toBe('free');
  });

  it('does not mislabel a failed signed-in lookup as Free', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    plus.token.mockResolvedValue(null);
    const badge = TestBed.inject(PlusBadgeEntitlement);

    await badge.check();

    expect(badge.state()).toBe('unavailable');
    expect(info).toHaveBeenCalledWith('[Mockingbird PlusBadge] entitlement:account', {
      account: 'signed-in',
      tokenAvailable: false,
      supporter: false,
    });
    expect(info).toHaveBeenCalledWith('[Mockingbird PlusBadge] entitlement:settled', {
      state: 'unavailable',
    });
  });
});
