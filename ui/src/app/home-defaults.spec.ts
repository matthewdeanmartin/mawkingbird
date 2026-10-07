import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from './auth';
import { Server } from './server';
import { HomeDefaults } from './home-defaults';
import { ProfileSyncStarter } from './providers/account/profile-sync-starter';

describe('Home defaults per account', () => {
  const token = signal('a-token');
  const account = signal({ id: 'a' });
  const server = signal('https://one.test');
  let defaults: HomeDefaults;
  const sync = { noteLocalChange: vi.fn() };
  function login(id: string, origin: string, value: string): void {
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
    localStorage.setItem('mastodon_mock_token', value);
    localStorage.setItem(
      'mastodon_mock_sessions',
      JSON.stringify([{ id: 'session', server: origin, account: { id } }]),
    );
    localStorage.setItem('mastodon_mock_session_tokens', JSON.stringify({ session: value }));
    account.set({ id });
    token.set(value);
    server.set(origin);
  }
  beforeEach(() => {
    localStorage.clear();
    login('a', 'https://one.test', 'a-token');
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { kind: signal('mastodon'), token, account } },
        { provide: Server, useValue: { baseUrl: server } },
        { provide: ProfileSyncStarter, useValue: sync },
      ],
    });
    defaults = TestBed.inject(HomeDefaults);
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it('keeps account and server defaults separate, and survives a token refresh', () => {
    expect(defaults.value()).toBeNull();
    defaults.set('media');
    const key = defaults.scope();
    login('a', 'https://one.test', 'refreshed-token');
    expect(defaults.scope()).toBe(key);
    expect(defaults.value()).toBe('media');
    login('a', 'https://two.test', 'second-token');
    expect(defaults.value()).toBeNull();
    defaults.set('text');
    login('b', 'https://one.test', 'b-token');
    expect(defaults.value()).toBeNull();
    defaults.set('video');
    login('a', 'https://one.test', 'third-token');
    expect(defaults.value()).toBe('media');
    expect(localStorage.getItem('mockingbird_client_prefs')).toBeNull();
    expect(sync.noteLocalChange).toHaveBeenCalled();
  });
  it('rejects corrupt values and retains an in-memory choice when writes are denied', () => {
    localStorage.setItem(defaults.scope(), 'invalid');
    expect(defaults.value()).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => defaults.set('video')).not.toThrow();
    expect(defaults.value()).toBe('video');
  });
  it('persists Articles as a starting view', () => {
    defaults.set('articles');
    expect(defaults.value()).toBe('articles');
    expect(localStorage.getItem(defaults.scope())).toBe('articles');
  });
});
