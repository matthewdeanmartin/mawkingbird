import {
  NATIVE_FOLLOW_COLLECT,
  NATIVE_MASTODON_LOGIN,
} from '../../../platform/session/platform-login';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { beforeEach, expect, it, vi } from 'vitest';
import { Login } from './login';

const nativeLogin = vi.fn();
const nativeCollect = vi.fn();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  nativeLogin.mockReset();
  nativeCollect.mockReset();
  nativeCollect.mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [
      { provide: NATIVE_MASTODON_LOGIN, useValue: nativeLogin },
      { provide: NATIVE_FOLLOW_COLLECT, useValue: nativeCollect },
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
    ],
  });
});

it('starts native following inventory after account verification without waiting for it', () => {
  vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const component = TestBed.createComponent(Login).componentInstance as any;
  component.token.set('native-mastodon:opaque-reference');
  component.submit();
  expect(nativeCollect).not.toHaveBeenCalled();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/accounts/verify_credentials')
    .flush({ id: '42', username: 'reader', acct: 'reader' } as never);
  expect(nativeCollect).toHaveBeenCalledWith('native-mastodon:opaque-reference');
});

it('uses the system-browser bridge without registering or storing OAuth secrets in the renderer', async () => {
  nativeLogin.mockResolvedValue('native-mastodon:opaque-reference');
  const component = TestBed.createComponent(Login).componentInstance;
  const submit = vi.spyOn(component, 'submit').mockImplementation(() => undefined);
  component.startOAuth();
  await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(nativeLogin).toHaveBeenCalledWith(expect.any(String), 'full');
  expect(sessionStorage.getItem('mastodon_mock_oauth_app')).toBeNull();
  TestBed.inject(HttpTestingController).expectNone('/api/v1/apps');
  TestBed.inject(HttpTestingController).expectNone('/oauth/token');
});

it('shows the native failure and log entry point, allowing another attempt', async () => {
  nativeLogin.mockRejectedValue({ message: 'Registration refused. See Help > Open logs.' });
  const component = TestBed.createComponent(Login).componentInstance as any;
  component.startOAuth();
  await vi.waitFor(() => expect(component.oauthWorking()).toBe(false));
  expect(component.oauthError()).toContain('Help > Open logs');
  expect(component.accessChoices.map((c: { value: string }) => c.value)).toEqual(['full', 'read']);
});

it('does not persist a pasted raw token into browser storage', () => {
  const component = TestBed.createComponent(Login).componentInstance as any;
  component.token.set('provider-secret');
  component.submit();
  expect(component.error()).toContain('OS credential storage');
  expect(JSON.stringify(localStorage)).not.toContain('provider-secret');
  TestBed.inject(HttpTestingController).expectNone('/api/v1/accounts/verify_credentials');
});

it('preserves an explicit read-only native authorization choice', async () => {
  nativeLogin.mockResolvedValue('native-mastodon:opaque-reference');
  const component = TestBed.createComponent(Login).componentInstance as any;
  component.oauthAccess.set('read');
  vi.spyOn(component, 'submit').mockImplementation(() => undefined);
  component.startOAuth();
  await vi.waitFor(() => expect(nativeLogin).toHaveBeenCalledWith(expect.any(String), 'read'));
});
