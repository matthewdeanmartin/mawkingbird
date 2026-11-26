import { parseAnonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';
import { UrlSegment } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Account, Status } from '../../platform/api/models';
import {
  accountDeepLink,
  accountHandleLinkMatcher,
  foreignAddressMatcher,
  mastodonPostLinkMatcher,
  postAcctParam,
  postLoadTarget,
  postDeepLink,
  profileDeepLink,
  qualifiedAcct,
  serverHost,
} from './deep-links';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'alice',
    acct: 'alice',
    display_name: 'Alice',
    url: 'https://home.example/@alice',
    ...overrides,
  } as Account;
}

function status(overrides: Partial<Status> = {}): Status {
  return { id: '111', account: account(), url: null, ...overrides } as Status;
}

function segments(path: string): UrlSegment[] {
  return path.split('/').map((part) => new UrlSegment(part, {}));
}

describe('deep links', () => {
  describe('Mastodon posts', () => {
    it("names the viewer's server as the issuer of the id, Elk-style", () => {
      expect(postDeepLink(status(), 'https://home.example')).toBe(
        'https://mawkingbird.com/home.example/@alice@home.example/111',
      );
    });

    it('keeps a remote author handle as it is', () => {
      const remote = status({ account: account({ acct: 'berna@sharkey.pimi.es' }) });
      expect(postDeepLink(remote, 'https://mastodon.art')).toBe(
        'https://mawkingbird.com/mastodon.art/@berna@sharkey.pimi.es/111',
      );
    });

    it('uses the public server an anonymous post was read from, and its id there', () => {
      const anon = status({
        id: 'anon:xyz',
        provider: 'anonymous-mastodon',
        providerRef: { server: 'https://far.example', statusId: '42', accountId: '9' },
      });
      expect(postDeepLink(anon, 'https://mastodon.social')).toBe(
        'https://mawkingbird.com/far.example/@alice@far.example/42',
      );
    });

    it('gives up rather than build a link from an unusable server', () => {
      expect(postDeepLink(status(), '')).toBeNull();
    });
  });

  it('mirrors bsky.app for Bluesky posts and profiles', () => {
    const post = status({
      provider: 'bluesky',
      id: 'bsky:at://did:plc:abc123/app.bsky.feed.post/3kxyz',
      account: account({ id: 'bsky:did:plc:abc123', acct: 'alice.bsky.social' }),
    });
    expect(postDeepLink(post, 'https://home.example')).toBe(
      'https://mawkingbird.com/bsky/profile/did:plc:abc123/post/3kxyz',
    );
    expect(accountDeepLink(post.account, 'bluesky', null)).toBe(
      'https://mawkingbird.com/bsky/profile/did:plc:abc123',
    );
  });

  it('mirrors twitter.com for tweets and accounts', () => {
    const tweet = status({
      provider: 'twitter',
      id: 'twitter:1234567890',
      account: account({ id: 'twitter:@jack', acct: 'jack' }),
    });
    expect(postDeepLink(tweet, '')).toBe('https://mawkingbird.com/twitter/jack/status/1234567890');
    expect(accountDeepLink(tweet.account, 'twitter', null)).toBe(
      'https://mawkingbird.com/twitter/jack',
    );
  });

  it('offers no post link for posts nobody else could resolve', () => {
    expect(
      postDeepLink(status({ provider: 'rss', id: 'rss:abc' }), 'https://a.example'),
    ).toBeNull();
    expect(
      postDeepLink(status({ provider: 'misskey', id: 'mk:abc' }), 'https://a.example'),
    ).toBeNull();
  });

  it('links accounts by their full handle, which resolves on any server', () => {
    expect(accountDeepLink(account(), undefined, 'home.example')).toBe(
      'https://mawkingbird.com/@alice@home.example',
    );
    expect(profileDeepLink(account())).toBe('https://mawkingbird.com/@alice@home.example');
    expect(profileDeepLink(account({ id: 'bsky:did:plc:abc123' }))).toBe(
      'https://mawkingbird.com/bsky/profile/did:plc:abc123',
    );
  });

  it('normalises hosts and handles', () => {
    expect(serverHost('https://Home.Example/')).toBe('home.example');
    expect(serverHost('not a url')).toBeNull();
    expect(qualifiedAcct('@bob@far.example', null)).toBe('bob@far.example');
    expect(qualifiedAcct('bob', null)).toBeNull();
  });

  describe('query-string post addresses', () => {
    const here = 'https://home.example';

    it('uses the id as is on the server that issued it', () => {
      expect(postLoadTarget({ post: '42', server: here }, here)).toBe('42');
    });

    it('becomes a public ref anywhere else, with the page address when the author is known', () => {
      const ref = (params: Record<string, string>) =>
        parseAnonymousStatusRouteRef(
          postLoadTarget({ post: '42', server: 'https://far.example', ...params }, here)!,
        );
      expect(ref({ acct: 'alice@far.example' })).toEqual({
        server: 'https://far.example',
        id: '42',
        originalUrl: 'https://far.example/@alice@far.example/42',
      });
      expect(ref({})).toEqual({ server: 'https://far.example', id: '42' });
      expect(ref({ acct: 'a/../b' })).toEqual({ server: 'https://far.example', id: '42' });
    });

    it('leaves ids that mean the same everywhere alone', () => {
      const bsky = 'bsky:at://did:plc:a/app.bsky.feed.post/1';
      expect(postLoadTarget({ post: bsky, server: 'https://far.example' }, here)).toBe(bsky);
    });

    it.each([
      { post: '42' },
      { post: '42', server: 'nope' },
      { post: '42', server: 'http://far.example' },
      { post: '42', server: 'https://u:p@far.example' },
      { post: 'a/b', server: 'https://far.example' },
      { post: 'x'.repeat(4001), server: here },
    ])('refuses an address that names no post (%#)', (params) => {
      expect(postLoadTarget(params, here)).toBeNull();
    });

    it('names the author only for server-local Mastodon posts', () => {
      expect(postAcctParam(status({ id: '42' }), here)).toEqual({ acct: 'alice@home.example' });
      expect(postAcctParam(status({ id: 'bsky:x', provider: 'bluesky' }), here)).toEqual({});
    });
  });

  describe('route matchers', () => {
    it('matches /<server>/@<acct>/<id> and hands the handle over without its @', () => {
      const match = mastodonPostLinkMatcher(segments('mastodon.art/@berna@sharkey.pimi.es/116987'));
      expect(match?.posParams?.['server'].path).toBe('mastodon.art');
      expect(match?.posParams?.['acct'].path).toBe('berna@sharkey.pimi.es');
      expect(match?.posParams?.['id'].path).toBe('116987');
    });

    it('never matches app routes, whose first segment is not a hostname', () => {
      expect(mastodonPostLinkMatcher(segments('accounts/@a@b.example/1'))).toBeNull();
      expect(mastodonPostLinkMatcher(segments('accounts/123/@a@b.example'))).toBeNull();
    });

    it('also takes a bare @user, as in a Mastodon URL with mawkingbird.com in front', () => {
      // Owner, 2026-11-26: such links used to bounce to Home.
      const match = mastodonPostLinkMatcher(segments('hachyderm.io/@fantinel/115649871234'));
      expect(match?.posParams?.['server'].path).toBe('hachyderm.io');
      expect(match?.posParams?.['acct'].path).toBe('fantinel');
      expect(mastodonPostLinkMatcher(segments('hachyderm.io/@/1'))).toBeNull();
      expect(mastodonPostLinkMatcher(segments('hachyderm.io/@a b/1'))).toBeNull();
    });

    it('matches any other address that starts with a server name, and nothing else', () => {
      expect(
        foreignAddressMatcher(segments('hachyderm.io/tags/phanpy'))?.posParams?.['address'].path,
      ).toBe('hachyderm.io/tags/phanpy');
      expect(foreignAddressMatcher(segments('home'))).toBeNull();
      expect(foreignAddressMatcher(segments('accounts/1'))).toBeNull();
    });

    it('matches only a fully qualified /@user@host', () => {
      expect(
        accountHandleLinkMatcher(segments('@alice@home.example'))?.posParams?.['acct'].path,
      ).toBe('alice@home.example');
      expect(accountHandleLinkMatcher(segments('@alice'))).toBeNull();
      expect(accountHandleLinkMatcher(segments('home'))).toBeNull();
    });
  });
});
