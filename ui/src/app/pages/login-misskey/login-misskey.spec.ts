import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { MisskeyAuth, MisskeySignInError } from '../../providers/misskey/misskey-auth';
import { saveMisskeyIdentity } from '../../providers/misskey/misskey-identity-store';
import { Server } from '../../server';
import { LoginMisskey } from './login-misskey';

function withQuery(params: Record<string, string>): void {
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: {
      snapshot: {
        queryParams: params,
        queryParamMap: {
          get: (key: string) => params[key] ?? null,
          has: (key: string) => Object.hasOwn(params, key),
        },
      },
    },
  });
}

describe('LoginMisskey', () => {
  let misskey: {
    checkServer: ReturnType<typeof vi.fn>;
    begin: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    misskey = { checkServer: vi.fn(), begin: vi.fn(), complete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        Auth,
        Server,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MisskeyAuth, useValue: misskey },
      ],
    });
  });

  it('shows the server form to a signed-out visitor', () => {
    withQuery({});
    const fixture = TestBed.createComponent(LoginMisskey);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[name="misskeyServer"]')).not.toBeNull();
  });

  it('explains why a server is refused, naming its software', async () => {
    withQuery({});
    misskey.checkServer.mockRejectedValue(new MisskeySignInError('mastodon', 'mastodon'));
    const fixture = TestBed.createComponent(LoginMisskey);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      server: { set(v: string): void };
      submit(): Promise<void>;
    };
    page.server.set('mastodon.social');
    await page.submit();
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toBeTruthy();
    expect(misskey.begin).not.toHaveBeenCalled();
  });

  it('completes a MiAuth callback into a signed-in Misskey account', async () => {
    const key = saveMisskeyIdentity(
      {
        server: 'https://misskey.io',
        userId: 'u1',
        username: 'alice',
        name: null,
        avatarUrl: null,
      },
      { token: 'tok' },
    );
    misskey.complete.mockResolvedValue({ key, adding: false });
    withQuery({ session: 'abc' });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LoginMisskey);
    fixture.detectChanges();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true }));
    expect(misskey.complete).toHaveBeenCalledWith('abc');
    expect(TestBed.inject(Auth).kind()).toBe('misskey');
  });

  it('shows an error and stays signed out when the callback fails', async () => {
    misskey.complete.mockRejectedValue(new MisskeySignInError('session-rejected'));
    withQuery({ session: 'abc' });
    const fixture = TestBed.createComponent(LoginMisskey);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(TestBed.inject(Auth).kind()).toBeNull();
  });
});
