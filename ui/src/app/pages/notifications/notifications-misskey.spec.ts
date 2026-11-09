import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { saveMisskeyIdentity } from '../../providers/misskey/misskey-identity-store';
import { MkNotification } from '../../providers/misskey/misskey-types';
import { Streaming } from '../../streaming';
import { FakeStreaming } from '../../testing/fake-streaming';
import { Notifications } from './notifications';
import { MISSKEY_PERMISSIONS } from '../../providers/misskey/misskey-auth';

const SERVER = 'https://misskey.design';
const URL = `${SERVER}/api/i/notifications`;
const ai = { id: 'u9', name: 'Ai', username: 'ai', host: null, avatarUrl: null };
const myNote = {
  id: 'n1',
  createdAt: '2026-11-09T09:00:00.000Z',
  text: '私のノート',
  user: { id: 'u1', name: null, username: 'me', host: null, avatarUrl: null },
  userId: 'u1',
  visibility: 'public' as const,
};

/** Notifications for a Misskey account (M1 follow-up): Misskey's own, never Mastodon's. */
describe('Notifications as a Misskey account', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: new FakeStreaming() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok' },
    );
    TestBed.inject(Auth).enterMisskey(key);
  });

  afterEach(() => {
    expect(http.match((r) => r.url.startsWith('/api/v1') || r.url.startsWith('/api/v2'))).toEqual(
      [],
    );
    localStorage.clear();
  });

  async function setUp(batch: MkNotification[]): Promise<ComponentFixture<Notifications>> {
    const fixture = TestBed.createComponent(Notifications);
    fixture.detectChanges();
    const req = await vi.waitFor(() => http.expectOne(URL));
    expect(req.request.body.includeTypes).toContain('reaction');
    expect(req.request.body.includeTypes).not.toContain('achievementEarned');
    req.flush(batch);
    return fixture;
  }

  it('lists reactions, follows and replies from the Misskey server', async () => {
    const fixture = await setUp([
      {
        id: 'x3',
        createdAt: '2026-11-09T12:00:00.000Z',
        type: 'reaction',
        user: ai,
        note: myNote,
        reaction: '👍',
      },
      { id: 'x2', createdAt: '2026-11-09T11:00:00.000Z', type: 'follow', user: ai },
      {
        id: 'x1',
        createdAt: '2026-11-09T10:00:00.000Z',
        type: 'reply',
        user: ai,
        note: { ...myNote, id: 'r1', text: 'お返事', user: ai, userId: 'u9', replyId: 'n1' },
      },
    ]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('Ai');
      expect(text).toContain('お返事');
    });
    const items = (fixture.componentInstance as unknown as { items(): { type: string }[] }).items();
    expect(items.map((n) => n.type)).toEqual(['favourite', 'follow', 'mention']);
  });

  it('does not offer Mastodon approve buttons for a Misskey follow request', async () => {
    const fixture = await setUp([
      { id: 'x1', createdAt: '2026-11-09T10:00:00.000Z', type: 'receiveFollowRequest', user: ai },
    ]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ai');
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // Approve/deny would call Mastodon; Hide would call Mastodon's dismiss.
    expect(text).not.toContain('Approve');
    expect(text).not.toContain('Hide');
  });

  it('opens a Misskey mention as its thread, not as a Mastodon chat', async () => {
    const fixture = await setUp([
      {
        id: 'x1',
        createdAt: '2026-11-09T10:00:00.000Z',
        type: 'mention',
        user: ai,
        note: { ...myNote, id: 'm1', text: '@me こんにちは', user: ai, userId: 'u9' },
      },
    ]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('こんにちは');
    });
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (a) => a.getAttribute('href') ?? '',
    );
    expect(hrefs.some((h) => h.startsWith('/conversations'))).toBe(false);
    expect(hrefs).toContain('/statuses/mk:m1');
  });

  it('pages with untilId', async () => {
    const fixture = await setUp(
      Array.from({ length: 30 }, (_, i) => ({
        id: `x${30 - i}`,
        createdAt: '2026-11-09T10:00:00.000Z',
        type: 'follow',
        user: ai,
      })),
    );
    await vi.waitFor(() =>
      expect((fixture.componentInstance as unknown as { items(): unknown[] }).items().length).toBe(
        30,
      ),
    );
    (fixture.componentInstance as unknown as { loadMore(): void }).loadMore();
    const next = await vi.waitFor(() => http.expectOne(URL));
    expect(next.request.body.untilId).toBe('x1');
    next.flush([]);
  });

  it('approves a Misskey follow request through Misskey once the token may write', async () => {
    saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok', permissions: [...MISSKEY_PERMISSIONS] },
    );
    const fixture = await setUp([
      { id: 'x1', createdAt: '2026-11-09T10:00:00.000Z', type: 'receiveFollowRequest', user: ai },
    ]);
    let approve: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      fixture.detectChanges();
      approve = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Approve',
      );
      expect(approve).toBeDefined();
    });
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[href="/settings/follows"]'),
    ).toBeNull();
    approve!.click();
    const req = await vi.waitFor(() => http.expectOne(`${SERVER}/api/following/requests/accept`));
    expect(req.request.body).toEqual({ userId: 'u9', i: 'tok' });
    req.flush(null);
    await vi.waitFor(() =>
      expect((fixture.componentInstance as unknown as { items(): unknown[] }).items()).toEqual([]),
    );
  });
});
