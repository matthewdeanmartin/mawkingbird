import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Auth } from './auth';
import { HomeDefaults } from './home-defaults';
import {
  HomeAlgoSettings,
  HOME_FACTORY,
  ALGO_FACTORY,
  normalizeHomeAlgo,
} from './home-algo-settings';
import { HomeSession } from './home-session';
import { ProfileSyncStarter } from './providers/account/profile-sync-starter';

describe('Home and Algo settings', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: ProfileSyncStarter, useValue: { noteLocalChange: vi.fn() } }],
    });
  });
  it('keeps factory behavior and bounds malformed numeric preferences', () => {
    expect(normalizeHomeAlgo({})).toEqual(HOME_FACTORY);
    const raw = {
      ...ALGO_FACTORY,
      maxCalls: 10000,
      replyWeight: NaN,
      homePages: -1,
      hashtagCount: 2.7,
    };
    expect(normalizeHomeAlgo({ algo: raw }).algo).toMatchObject({
      maxCalls: 100,
      replyWeight: 0.5,
      homePages: 0,
      hashtagCount: 3,
    });
  });
  it('retains the previous settings on failed storage writes', () => {
    const settings = TestBed.inject(HomeAlgoSettings);
    expect(settings.save({ mode: 'interests' })).toBe(true);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(settings.save({ mode: 'favorite' })).toBe(false);
    expect(settings.value().mode).toBe('interests');
    spy.mockRestore();
  });
  it('applies saved defaults once per app/login and keeps toolbar changes through navigation', () => {
    const scope = signal('account-a');
    const token = signal('a');
    const kind = signal('mastodon');
    const value = signal({ ...HOME_FACTORY, calm: true, boosts: false, replies: true });
    TestBed.overrideProvider(HomeAlgoSettings, { useValue: { scope, value } });
    TestBed.overrideProvider(Auth, { useValue: { token, kind } });
    const session = TestBed.inject(HomeSession);
    expect([session.calm(), session.boosts(), session.replies()]).toEqual([true, false, true]);
    session.calm.set(false);
    session.replies.set(false);
    session.ensure();
    TestBed.tick();
    expect([session.calm(), session.replies()]).toEqual([false, false]);
    value.set({ ...value(), calm: true });
    session.ensure();
    expect(session.calm()).toBe(false);
    token.set('new-login');
    session.ensure();
    expect([session.calm(), session.replies()]).toEqual([true, true]);
    value.set({ ...HOME_FACTORY });
    scope.set('account-b');
    session.ensure();
    expect([session.calm(), session.boosts(), session.replies()]).toEqual([false, true, false]);
  });
  it('keeps preferences isolated between account scopes', () => {
    const scope = signal('anonymous');
    TestBed.overrideProvider(HomeDefaults, { useValue: { scope } });
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    const settings = TestBed.inject(HomeAlgoSettings);
    settings.save({ mode: 'interests' });
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
    localStorage.setItem('mastodon_mock_token', 'other');
    scope.set('other');
    expect(settings.value().mode).toBe('friends');
    settings.save({ replies: true });
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    scope.set('anonymous');
    expect(settings.value()).toMatchObject({ mode: 'interests', replies: false });
  });
});
