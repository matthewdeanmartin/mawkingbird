import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { AnonymousEntry } from './anonymous-entry';

describe('AnonymousEntry', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('activates Anonymous and replaces the share URL with Home when the default is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ title: 'Mastodon' }) }),
    );
    const auth = TestBed.inject(Auth);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    TestBed.createComponent(AnonymousEntry).detectChanges();

    await vi.waitFor(() => expect(auth.isAnonymous).toBe(true));
    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  // Previously this redirected to `/`, which probes three hard-coded servers and,
  // if all are blocked, enters against an unreachable one — a fail whale by a
  // longer road. A network that blocks mastodon.social usually blocks the other
  // candidates too, so the dead end became a directory-wide search instead.
  it('offers a server search instead of entering when the default server is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')));
    const auth = TestBed.inject(Auth);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(AnonymousEntry);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-unreachable-server-dialog')).not.toBeNull();
    });
    // Nothing was entered and nowhere was navigated: the dialog owns what happens next.
    expect(navigate).not.toHaveBeenCalled();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('uses a bare query key as the first anonymous server', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: { keys: ['hachyderm.io'] } } },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ title: 'Hachyderm' }) });
    vi.stubGlobal('fetch', fetchSpy);
    const auth = TestBed.inject(Auth);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    TestBed.createComponent(AnonymousEntry).detectChanges();

    await vi.waitFor(() => expect(auth.isAnonymous).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hachyderm.io/api/v1/instance',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
