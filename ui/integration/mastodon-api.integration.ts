import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Api } from '../src/app/api';
import { Auth } from '../src/app/auth';
import { authInterceptor } from '../src/app/auth.interceptor';
import { Server } from '../src/app/server';
import { serverInterceptor } from '../src/app/server.interceptor';
import { environment } from '../src/environments/environment';

describe('Mawkingbird client against the PyPI Mastodon mock', () => {
  let api: Api;
  let auth: Auth;

  beforeEach(async () => {
    const base = process.env['MASTODON_MOCK_URL'];
    if (!base || new URL(base).hostname !== '127.0.0.1') {
      throw new Error('Use npm run test:integration to start an isolated local PyPI server');
    }
    const reset = await fetch(`${base}/api/v1/_mock/reset`, { method: 'POST' });
    expect(reset.ok).toBe(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([serverInterceptor, authInterceptor])),
      ],
    });
    TestBed.inject(Server).setBaseUrl(base);
    auth = TestBed.inject(Auth);
    auth.setToken('alice_token');
    api = TestBed.inject(Api);
  });

  it('authenticates through the standalone client interceptors', async () => {
    expect(environment.mockTooling).toBe(false);
    expect(environment.allowThisServer).toBe(false);
    const account = await firstValueFrom(api.verifyCredentials());
    expect(account.username).toBe('alice');
    expect(account.id).toBeTruthy();
  });

  it('persists a post, reads it in the timeline, edits it, and deletes it', async () => {
    const post = await firstValueFrom(api.postStatus('Integration post from Mawkingbird'));
    expect(post.content).toContain('Integration post from Mawkingbird');
    expect(post.account.username).toBe('alice');
    const timeline = await firstValueFrom(api.homeTimeline());
    expect(timeline.some((item) => item.id === post.id)).toBe(true);
    await firstValueFrom(api.editStatus(post.id, 'Edited integration post'));
    expect((await firstValueFrom(api.getStatus(post.id))).content).toContain(
      'Edited integration post',
    );
    await firstValueFrom(api.deleteStatus(post.id));
    await expect(firstValueFrom(api.getStatus(post.id))).rejects.toMatchObject({ status: 404 });
  });

  it('keeps favourites and bookmarks stateful across separate client requests', async () => {
    const post = await firstValueFrom(api.postStatus('Save this integration post'));
    expect((await firstValueFrom(api.favourite(post.id))).favourited).toBe(true);
    expect((await firstValueFrom(api.favourites())).map((item) => item.id)).toContain(post.id);
    expect((await firstValueFrom(api.bookmark(post.id))).bookmarked).toBe(true);
    expect((await firstValueFrom(api.bookmarks())).map((item) => item.id)).toContain(post.id);
    await firstValueFrom(api.unfavourite(post.id));
    await firstValueFrom(api.unbookmark(post.id));
    expect((await firstValueFrom(api.favourites())).map((item) => item.id)).not.toContain(post.id);
    expect((await firstValueFrom(api.bookmarks())).map((item) => item.id)).not.toContain(post.id);
  });

  it('surfaces invalid credentials from the server', async () => {
    auth.setToken('not-a-valid-token');
    await expect(firstValueFrom(api.verifyCredentials())).rejects.toMatchObject({ status: 401 });
  });
});
