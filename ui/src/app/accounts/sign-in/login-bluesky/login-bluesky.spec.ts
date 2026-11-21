import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../platform/session/auth';
import { Server } from '../../../platform/http/server';
import { LoginBluesky } from './login-bluesky';
import { BlueskySession } from '../../../connections/bluesky/bluesky-session';

const CREATE_SESSION = 'https://bsky.social/xrpc/com.atproto.server.createSession';

describe('LoginBluesky', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [Auth, Server, provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  it('uses the Bluesky entryway as the primary sign-in action', () => {
    const begin = vi
      .spyOn(TestBed.inject(BlueskySession), 'beginOAuthIdentity')
      .mockReturnValue(new Promise<never>(() => undefined));
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;

    cmp.submitBluesky();

    expect(begin).toHaveBeenCalledWith('https://bsky.social', false);
    httpMock.expectNone(CREATE_SESSION);
  });

  it('creates a Bluesky account through the sign-up intent', () => {
    const begin = vi
      .spyOn(TestBed.inject(BlueskySession), 'beginOAuthSignup')
      .mockReturnValue(new Promise<never>(() => undefined));
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLElement) =>
      b.textContent?.includes('Create a Bluesky account'),
    ) as HTMLButtonElement;

    button.click();

    expect(begin).toHaveBeenCalledWith(false);
    httpMock.expectNone(CREATE_SESSION);
  });

  it('starts the sign-up at once when the public page sent the visitor', () => {
    const begin = vi
      .spyOn(TestBed.inject(BlueskySession), 'beginOAuthSignup')
      .mockReturnValue(new Promise<never>(() => undefined));
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get').mockImplementation(
      (key: string) => (key === 'create' ? '1' : null),
    );
    TestBed.createComponent(LoginBluesky).detectChanges();
    expect(begin).toHaveBeenCalledWith(false);
  });

  it('uses targeted OAuth for a specific handle', () => {
    const begin = vi
      .spyOn(TestBed.inject(BlueskySession), 'beginOAuthIdentity')
      .mockReturnValue(new Promise<never>(() => undefined));
    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    cmp.handle.set('  @someone.bsky.social  ');

    cmp.submit();

    expect(begin).toHaveBeenCalledWith('someone.bsky.social', false);
    httpMock.expectNone(CREATE_SESSION);
  });

  it('sends an already signed-in visitor to Home', () => {
    TestBed.inject(Auth).setToken('mastodon-token');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    TestBed.createComponent(LoginBluesky).detectChanges();

    expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  it('allows an already signed-in visitor to add a Bluesky alt', () => {
    TestBed.inject(Auth).setToken('mastodon-token');
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'has').mockImplementation(
      (name) => name === 'add',
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(LoginBluesky);
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });
});
