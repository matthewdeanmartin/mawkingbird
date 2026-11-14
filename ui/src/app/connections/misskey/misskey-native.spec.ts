import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NATIVE_SOCIAL } from '../../platform/session/platform-login';
import { MisskeyAuth } from './misskey-auth';
import { misskeyIdentity } from './misskey-identity-store';

const native = { misskeyLogin: vi.fn() };
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NATIVE_SOCIAL, useValue: native },
    ],
  });
});
afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  localStorage.clear();
  sessionStorage.clear();
});
it('stores only the native reference and profile after browser MiAuth completes', async () => {
  native.misskeyLogin.mockResolvedValue({
    token: 'native-misskey:opaque',
    permissions: ['read:account', 'write:reactions'],
    user: { id: 'user1', username: 'reader', name: 'Reader', avatarUrl: null },
  });
  const key = await TestBed.inject(MisskeyAuth).nativeLogin('https://misskey.io');
  expect(native.misskeyLogin).toHaveBeenCalledExactlyOnceWith('https://misskey.io');
  expect(misskeyIdentity(key)?.credentials).toMatchObject({
    token: 'native-misskey:opaque',
    permissions: ['read:account', 'write:reactions'],
  });
  expect(sessionStorage.length).toBe(0);
});
it('does not save an account when MiAuth is denied or times out', async () => {
  native.misskeyLogin.mockRejectedValue({ kind: 'cancelled', message: 'Declined' });
  await expect(TestBed.inject(MisskeyAuth).nativeLogin('https://misskey.io')).rejects.toMatchObject(
    { kind: 'cancelled' },
  );
  expect(misskeyIdentity()).toBeNull();
});
