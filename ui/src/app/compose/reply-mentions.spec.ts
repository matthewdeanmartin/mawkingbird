import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialogs } from '../app-dialogs';
import { ReplyMentions, replyMentions } from './reply-mentions';

describe('inline reply mentions', () => {
  let http: HttpTestingController;
  let mentions: ReplyMentions;
  const confirm = vi.fn().mockResolvedValue(true);
  beforeEach(() => {
    localStorage.clear();
    confirm.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppDialogs, useValue: { confirm } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    mentions = TestBed.inject(ReplyMentions);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('extracts distinct handles including malformed ones but ignores email, URLs and code', () => {
    expect(
      replyMentions(
        'Hi @Alice, (@bob@remote.test)! @alice @bad@@host mail@host https://host/@ignore `@code`\n> @quoted',
      ),
    ).toEqual(['alice', 'bob@remote.test', 'bad@@host']);
  });
  it('rejects a malformed handle before making a request', async () => {
    await expect(mentions.review(['bad@@host'], 'mastodon', () => true)).rejects.toThrow(
      'not valid',
    );
    expect(confirm).not.toHaveBeenCalled();
  });
  it('does not accept a fuzzy search match as a valid recipient', async () => {
    const result = mentions.review(['alice'], 'mastodon', () => true);
    const assertion = expect(result).rejects.toThrow('No exact account');
    http
      .expectOne((req) => req.url === '/api/v2/search')
      .flush({
        accounts: [{ acct: 'alicia', username: 'alicia', url: 'https://home.test/@alicia' }],
      });
    await assertion;
    expect(confirm).not.toHaveBeenCalled();
  });
  it('resolves on the posting server and offers the full identity for review', async () => {
    const result = mentions.review(['alice@home.test'], 'mastodon', () => true);
    const req = http.expectOne((req) => req.url === '/api/v2/search');
    expect(req.request.params.get('resolve')).toBe('true');
    req.flush({
      accounts: [
        {
          acct: 'alice',
          username: 'alice',
          display_name: 'Alice Example',
          url: 'https://home.test/@alice',
        },
      ],
    });
    await expect(result).resolves.toBe(true);
    expect(confirm.mock.calls[0][0]).toContain('Alice Example (@alice@home.test)');
  });
  it('distinguishes a network failure and keeps it retryable', async () => {
    const result = mentions.review(['alice'], 'mastodon', () => true);
    const assertion = expect(result).rejects.toThrow('right now');
    http
      .expectOne((req) => req.url === '/api/v2/search')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await assertion;
  });
  it('does not offer stale identities after the reply or account changes', async () => {
    let current = true;
    const result = mentions.review(['alice'], 'mastodon', () => current);
    current = false;
    http
      .expectOne((req) => req.url === '/api/v2/search')
      .flush({ accounts: [{ acct: 'alice', username: 'alice' }] });
    await expect(result).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('requires a resolvable Bluesky handle rather than silently posting plain text', async () => {
    const result = mentions.review(['typo.bsky.social'], 'bluesky', () => true);
    const assertion = expect(result).rejects.toThrow();
    http
      .expectOne((req) => req.url.includes('app.bsky.actor.getProfile'))
      .flush({}, { status: 404, statusText: 'Not Found' });
    await assertion;
    expect(confirm).not.toHaveBeenCalled();
  });
});
