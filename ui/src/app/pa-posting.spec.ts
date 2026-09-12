import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Api } from './api';
import { accountScopeSuffix } from './account-scope';
import { Pseudonymity } from './pseudonymity';
import { BlueskyApi } from './providers/bluesky/bluesky-api';
import { seedBskySession } from './testing/seed-storage';

describe('PA outgoing posts', () => {
  let http: HttpTestingController;
  const text = 'Pizza https://example.org/?id=42&utm_source=alice';
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('cleans Mastodon posts and edits in PA, preserving visibility and idempotency', () => {
    TestBed.inject(Pseudonymity).setEnabled(true);
    const api = TestBed.inject(Api);
    api.postStatus(text, { visibility: 'unlisted' }, 'stable-key').subscribe();
    const post = http.expectOne('/api/v1/statuses');
    expect(post.request.body).toEqual({
      status: 'Pizza https://example.org/?id=42',
      visibility: 'unlisted',
    });
    expect(post.request.headers.get('Idempotency-Key')).toBe('stable-key');
    post.flush({});
    api.editStatus('1', text).subscribe();
    const edit = http.expectOne('/api/v1/statuses/1');
    expect(edit.request.body.status).toBe('Pizza https://example.org/?id=42');
    edit.flush({});
  });

  it('preserves ordinary posts and respects the PA link-cleaning opt-out', () => {
    const pa = TestBed.inject(Pseudonymity);
    const api = TestBed.inject(Api);
    for (const enabled of [false, true]) {
      pa.setEnabled(enabled);
      pa.setCleanLinks(false);
      api.postStatus(text).subscribe();
      const request = http.expectOne('/api/v1/statuses');
      expect(request.request.body.status).toBe(text);
      request.flush({});
    }
  });

  it('cleans Bluesky posts through the shared endpoint without changing reply refs or record identity', () => {
    seedBskySession(
      {
        service: 'https://bsky.social',
        handle: 'me.bsky.social',
        did: 'did:plc:me',
        accessJwt: 'access',
        refreshJwt: 'refresh',
      },
      accountScopeSuffix(),
    );
    TestBed.inject(Pseudonymity).setEnabled(true);
    const reply = {
      root: { uri: 'at://root', cid: 'r' },
      parent: { uri: 'at://parent', cid: 'p' },
    };
    TestBed.inject(BlueskyApi)
      .post({ text, reply }, { rkey: 'stable', createdAt: '2026-09-12T00:00:00Z' })
      .subscribe();
    const request = http.expectOne('https://bsky.social/xrpc/com.atproto.repo.createRecord');
    expect(request.request.body.record.text).toBe('Pizza https://example.org/?id=42');
    expect(request.request.body.record.reply).toEqual(reply);
    expect(request.request.body.rkey).toBe('stable');
    expect(request.request.body.record.createdAt).toBe('2026-09-12T00:00:00Z');
    request.flush({ uri: 'at://new', cid: 'new' });
  });
});
