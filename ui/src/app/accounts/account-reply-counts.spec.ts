import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBlueskyIdentity } from '../connections/bluesky/bluesky-identity-store';
import { BlueskyOAuth } from '../connections/bluesky/bluesky-oauth';
import { BlueskySession } from '../connections/bluesky/bluesky-session';
import { saveMisskeyIdentity } from '../connections/misskey/misskey-identity-store';
import { Auth, Session } from '../platform/session/auth';
import { AccountReplyCounts } from './account-reply-counts';

describe('AccountReplyCounts', () => {
  const sessions = signal<Session[]>([]);
  const blueskyAccounts = signal<any[]>([]);
  const misskeyAccounts = signal<any[]>([]);
  const kind = signal<'mastodon' | 'bluesky' | 'misskey'>('mastodon');
  const token = signal<string | null>('first-token');
  const account = signal<any>({ id: '1' });
  const activeMisskeyKey = signal<string | null>(null);
  const oauth = { fetch: vi.fn() };
  let requests: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    kind.set('mastodon');
    token.set('first-token');
    account.set({ id: '1' });
    activeMisskeyKey.set(null);
    blueskyAccounts.set([]);
    misskeyAccounts.set([]);
    sessions.set([
      {
        id: 'first',
        token: 'first-token',
        server: 'https://slow.example',
        account: { id: '1' } as never,
      },
      {
        id: 'second',
        token: 'second-token',
        server: 'https://fast.example',
        account: { id: '2' } as never,
      },
    ]);
    oauth.fetch.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Auth,
          useValue: {
            sessions,
            blueskyAccounts,
            misskeyAccounts,
            kind,
            token,
            account,
            activeMisskeyKey,
          },
        },
        { provide: BlueskyOAuth, useValue: oauth },
        { provide: BlueskySession, useValue: { session: () => null } },
      ],
    });
    requests = TestBed.inject(HttpTestingController);
  });

  it('checks saved Mastodon accounts independently and counts only recent mentions', async () => {
    const counts = TestBed.inject(AccountReplyCounts);
    const pending = counts.refresh();
    const slow = requests.expectOne((req) =>
      req.url.startsWith('https://slow.example/api/v1/notifications'),
    );
    const fast = requests.expectOne((req) =>
      req.url.startsWith('https://fast.example/api/v1/notifications'),
    );
    expect(slow.request.headers.get('Authorization')).toBe('Bearer first-token');
    expect(fast.request.headers.get('Authorization')).toBe('Bearer second-token');
    fast.flush([
      { type: 'mention', created_at: new Date().toISOString() },
      { type: 'follow', created_at: new Date().toISOString() },
      { type: 'mention', created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
    ]);
    slow.flush({}, { status: 503, statusText: 'Unavailable' });
    await pending;
    expect(counts.label('mastodon:second')).toBe('1');
    expect(counts.label('mastodon:first')).toBe('');
    requests.verify();
  });

  it('counts only unread Bluesky replies and mentions in the last day', async () => {
    sessions.set([]);
    saveBlueskyIdentity(
      { did: 'did:plc:one', handle: 'one.bsky.social', service: 'https://bsky.social' },
      { authMethod: 'oauth' },
    );
    blueskyAccounts.set([
      {
        key: 'bluesky:did:plc:one',
        kind: 'bluesky',
        token: null,
        did: 'did:plc:one',
        server: 'https://bsky.social',
        account: { id: 'bsky:did:plc:one' },
      },
    ]);
    oauth.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          notifications: [
            { reason: 'reply', isRead: false, indexedAt: new Date().toISOString() },
            { reason: 'mention', isRead: true, indexedAt: new Date().toISOString() },
            { reason: 'like', isRead: false, indexedAt: new Date().toISOString() },
          ],
        }),
        { status: 200 },
      ),
    );
    const counts = TestBed.inject(AccountReplyCounts);
    await counts.refresh();
    expect(counts.label('bluesky:did:plc:one')).toBe('1');
    expect(oauth.fetch).toHaveBeenCalledWith(
      'did:plc:one',
      expect.stringContaining('listNotifications'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    kind.set('bluesky');
    account.set({ id: 'bsky:did:plc:one' });
    counts.markCurrentRead('bluesky');
    expect(counts.label('bluesky:did:plc:one')).toBe('');
  });

  it('does not mark Misskey notifications read while checking the switcher', async () => {
    sessions.set([]);
    const key = saveMisskeyIdentity(
      {
        server: 'https://misskey.example',
        userId: 'u1',
        username: 'one',
        name: null,
        avatarUrl: null,
      },
      { token: 'misskey-token' },
    );
    misskeyAccounts.set([
      {
        key: `misskey:${key}`,
        kind: 'misskey',
        token: null,
        misskeyKey: key,
        server: 'https://misskey.example',
        account: { id: 'mk:u1' },
      },
    ]);
    kind.set('misskey');
    activeMisskeyKey.set(key);
    account.set({ id: 'mk:u1' });
    const counts = TestBed.inject(AccountReplyCounts);
    const pending = counts.refresh();
    const request = requests.expectOne('https://misskey.example/api/i/notifications');
    expect(request.request.body.markAsRead).toBe(false);
    request.flush([{ type: 'reply', createdAt: new Date().toISOString() }]);
    await pending;
    expect(counts.label(`misskey:${key}`)).toBe('1');
    counts.markCurrentRead('misskey');
    expect(counts.label(`misskey:${key}`)).toBe('');
    requests.verify();
  });
});
