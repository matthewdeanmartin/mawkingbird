import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { Auth } from '../platform/session/auth';
import { ConversationOrigins } from './conversation-origins';

function post(id: string, author: string, extra: Partial<Status> = {}): Status {
  return {
    id,
    account: { id: author, acct: author } as Account,
    content: `<p>${id}</p>`,
    in_reply_to_id: null,
    ...extra,
  } as Status;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

describe('ConversationOrigins', () => {
  let origins: ConversationOrigins;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    const auth = TestBed.inject(Auth);
    auth.setToken('token');
    auth.setAccount({ id: 'me' } as Account);
    origins = TestBed.inject(ConversationOrigins);
    http = TestBed.inject(HttpTestingController);
  });

  it('a fresh mention or quote is a stranger starting something', () => {
    expect(origins.unsolicited(post('m', 'guy'))).toBe(true);
    const quote = post('q', 'guy', {
      quote: { state: 'accepted', quoted_status: post('mine', 'me') },
    } as Partial<Status>);
    expect(origins.unsolicited(quote)).toBe(true);
    http.expectNone(() => true);
  });

  it('quoting a post I tagged was invited', () => {
    const quote = post('q', 'guy', {
      quote: {
        state: 'accepted',
        quoted_status: post('mine', 'me', { tags: [{ name: 'pizza', url: '' }] }),
      },
    } as Partial<Status>);
    expect(origins.unsolicited(quote)).toBe(false);
  });

  it('a reply in a conversation I started, untagged, is uninvited', async () => {
    const reply = post('r', 'guy', { in_reply_to_id: 'root' });
    expect(origins.unsolicited(reply)).toBeNull();
    http
      .expectOne('/api/v1/statuses/r/context')
      .flush({ ancestors: [post('root', 'me')], descendants: [] });
    await settle();
    expect(origins.unsolicited(reply)).toBe(true);
    // Asked once.
    origins.unsolicited(reply);
    http.expectNone('/api/v1/statuses/r/context');
  });

  it('a reply in a thread I joined is the mosh pit', async () => {
    const reply = post('r', 'guy', { in_reply_to_id: 'mine' });
    origins.unsolicited(reply);
    http.expectOne('/api/v1/statuses/r/context').flush({
      ancestors: [post('root', 'alice'), post('mine', 'me', { in_reply_to_id: 'root' })],
      descendants: [],
    });
    await settle();
    expect(origins.unsolicited(reply)).toBe(false);
  });

  it('a reply under my tagged post is the mosh pit too', async () => {
    const reply = post('r', 'guy', { in_reply_to_id: 'root' });
    origins.unsolicited(reply);
    http.expectOne('/api/v1/statuses/r/context').flush({
      ancestors: [post('root', 'me', { tags: [{ name: 'pizza', url: '' }] })],
      descendants: [],
    });
    await settle();
    expect(origins.unsolicited(reply)).toBe(false);
  });

  it('a failed lookup leaves the reply unguarded', async () => {
    const reply = post('r', 'guy', { in_reply_to_id: 'root' });
    origins.unsolicited(reply);
    http
      .expectOne('/api/v1/statuses/r/context')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();
    expect(origins.unsolicited(reply)).toBe(false);
  });

  it('a Bluesky reply in someone else’s thread needs no request', () => {
    const reply = post('bsky:r', 'bsky:did:plc:guy', {
      provider: 'bluesky',
      in_reply_to_id: 'bsky:x',
      providerRef: { replyRoot: { uri: 'at://did:plc:alice/app.bsky.feed.post/1', cid: 'c' } },
    } as Partial<Status>);
    expect(origins.unsolicited(reply)).toBe(false);
    http.expectNone(() => true);
  });
});
