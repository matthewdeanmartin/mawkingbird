import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { saveMisskeyIdentity } from '../../providers/misskey/misskey-identity-store';
import { MisskeyTag } from './misskey-tag';

const SERVER = 'https://misskey.design';

describe('MisskeyTag', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'tags/:tag', component: MisskeyTag }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok' },
    );
    TestBed.inject(Auth).enterMisskey(key);
  });

  it('shows notes with the hashtag and pages with untilId', async () => {
    const harness = await RouterTestingHarness.create('/tags/%E7%B5%B5');
    const first = await vi.waitFor(() => http.expectOne(`${SERVER}/api/notes/search-by-tag`));
    expect(first.request.body).toEqual({ tag: '絵', limit: 20, i: 'tok' });
    first.flush([
      {
        id: 'n1',
        createdAt: '2026-11-10T10:00:00.000Z',
        text: '新しい絵 #絵',
        user: { id: 'u9', name: 'Ai', username: 'ai', host: null, avatarUrl: null },
        userId: 'u9',
        visibility: 'public',
      },
    ]);
    await vi.waitFor(() => {
      harness.detectChanges();
      expect((harness.routeNativeElement as HTMLElement).textContent).toContain('新しい絵');
    });
    const more = Array.from(
      (harness.routeNativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Load more')) as HTMLButtonElement;
    more.click();
    const next = await vi.waitFor(() => http.expectOne(`${SERVER}/api/notes/search-by-tag`));
    expect(next.request.body.untilId).toBe('n1');
    next.flush([]);
  });
});
