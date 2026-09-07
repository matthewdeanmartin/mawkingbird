import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { inviteAccessGuard } from './invite-access.guard';

function snapshot(keys: string[] = []): ActivatedRouteSnapshot {
  return { queryParamMap: { keys } } as unknown as ActivatedRouteSnapshot;
}

describe('inviteAccessGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('enters Anonymous on mastodon.social for a fresh direct visitor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const auth = TestBed.inject(Auth);

    const allowed = await TestBed.runInInjectionContext(() =>
      inviteAccessGuard(snapshot(), {} as RouterStateSnapshot),
    );

    expect(allowed).toBe(true);
    expect(auth.isAnonymous).toBe(true);
    expect(auth.account()?.acct).toBe('mastodon.social');
  });

  it('uses the bare query key as the Anonymous API server', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchSpy);

    const allowed = await TestBed.runInInjectionContext(() =>
      inviteAccessGuard(snapshot(['hachyderm.io']), {} as RouterStateSnapshot),
    );

    expect(allowed).toBe(true);
    expect(TestBed.inject(Auth).account()?.acct).toBe('hachyderm.io');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hachyderm.io/api/v1/instance',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('does not switch a real signed-in account or probe the suggested server', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const auth = TestBed.inject(Auth);
    auth.setToken('real-token');

    const allowed = await TestBed.runInInjectionContext(() =>
      inviteAccessGuard(snapshot(['elsewhere.social']), {} as RouterStateSnapshot),
    );

    expect(allowed).toBe(true);
    expect(auth.isAnonymous).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
