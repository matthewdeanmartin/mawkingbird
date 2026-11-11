import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DROPBOX_APP_KEY, DropboxSession } from './dropbox-session';

describe('DropboxSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: DROPBOX_APP_KEY, useValue: 'public-app-key' }],
    });
  });

  it('exchanges a valid PKCE callback without sending a client secret', async () => {
    sessionStorage.setItem('mockingbird_dropbox_pkce_verifier', 'verifier');
    sessionStorage.setItem('mockingbird_dropbox_oauth_state', 'expected-state');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'short-lived-token',
          expires_in: 14400,
          account_id: 'dbid:1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = TestBed.inject(DropboxSession);
    await session.finishAuthorization(
      new URLSearchParams({ code: 'authorization-code', state: 'expected-state' }),
    );

    expect(session.connected()).toBe(true);
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('client_id')).toBe('public-app-key');
    expect(body.get('code_verifier')).toBe('verifier');
    expect(body.has('client_secret')).toBe(false);
    expect(sessionStorage.getItem('mockingbird_dropbox_pkce_verifier')).toBeNull();
  });

  it('rejects a callback whose state does not match', async () => {
    sessionStorage.setItem('mockingbird_dropbox_pkce_verifier', 'verifier');
    sessionStorage.setItem('mockingbird_dropbox_oauth_state', 'expected-state');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      TestBed.inject(DropboxSession).finishAuthorization(
        new URLSearchParams({ code: 'authorization-code', state: 'wrong-state' }),
      ),
    ).rejects.toThrow('invalid or expired');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists the root folder with the short-lived bearer token', async () => {
    sessionStorage.setItem(
      'mockingbird_dropbox_token',
      JSON.stringify({ accessToken: 'token', expiresAt: Date.now() + 3_600_000 }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ entries: [{ '.tag': 'folder', id: 'id:1', name: 'Photos' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const entries = await TestBed.inject(DropboxSession).listRoot();

    expect(entries).toEqual([{ '.tag': 'folder', id: 'id:1', name: 'Photos' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dropboxapi.com/2/files/list_folder',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });

  it('explains how to recover when the token lacks the metadata scope', async () => {
    sessionStorage.setItem(
      'mockingbird_dropbox_token',
      JSON.stringify({ accessToken: 'token', expiresAt: Date.now() + 3_600_000 }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error_summary: 'missing_scope/' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(TestBed.inject(DropboxSession).listRoot()).rejects.toThrow(
      'Enable that permission in the Dropbox App Console',
    );
  });
});
