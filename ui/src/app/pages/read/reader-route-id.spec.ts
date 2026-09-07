import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { readerRouteId } from './reader-route-id';
import { parseAnonymousStatusRouteRef } from '../../providers/anonymous/anonymous-route-ref';
import { adaptAnonymousStatus } from '../../providers/anonymous/anonymous-mastodon-provider';

function remoteStatus(over: Partial<Status> = {}): Status {
  return {
    id: '117170026233980502',
    in_reply_to_id: null,
    url: 'https://graz.social/@publicvoit/117170026233980502',
    content: '<p>A post</p>',
    account: { id: '42', username: 'publicvoit', acct: 'publicvoit', display_name: 'V' },
    ...over,
  } as unknown as Status;
}

describe('readerRouteId', () => {
  it('leaves an ordinary id alone', () => {
    const status = { id: '109384', provider: undefined } as unknown as Status;
    expect(readerRouteId(status)).toBe('109384');
  });

  it('leaves an already-namespaced provider id alone', () => {
    const status = { id: 'rss:https://b.example/feed::g1', provider: 'rss' } as unknown as Status;
    expect(readerRouteId(status)).toBe('rss:https://b.example/feed::g1');
  });

  /**
   * The bug this exists for: the feed id and the route id are different
   * strings, and the library stored the feed one. Its rows linked to
   * `/read/anonymous-mastodon:graz.social:…`, which nothing could resolve.
   */
  it('turns a remotely-read post into the id its route actually understands', () => {
    const adapted = adaptAnonymousStatus(remoteStatus(), 'https://graz.social');
    expect(adapted.id).toBe('anonymous-mastodon:graz.social:117170026233980502');

    const routeId = readerRouteId(adapted);
    const decoded = parseAnonymousStatusRouteRef(routeId);

    expect(decoded).toEqual({
      server: 'https://graz.social',
      id: '117170026233980502',
      originalUrl: 'https://graz.social/@publicvoit/117170026233980502',
    });
  });

  it('falls back to the feed id when the reference is unusable', () => {
    // No worse than no entry at all, and it still identifies the post in-session.
    const status = {
      id: 'anonymous-mastodon:graz.social:1',
      provider: 'anonymous-mastodon',
      providerRef: undefined,
    } as unknown as Status;
    expect(readerRouteId(status)).toBe('anonymous-mastodon:graz.social:1');
  });
});

describe('adaptAnonymousStatus reply threading', () => {
  /**
   * The bug this covers: `id` was namespaced and `in_reply_to_id` was not, so
   * no post in a remotely-read thread could be matched to its parent. It
   * surfaced as a two-post storm rendering as one post in reader mode, but it
   * broke reply threading everywhere those posts appear.
   */
  it('namespaces in_reply_to_id the same way it namespaces id', () => {
    const reply = adaptAnonymousStatus(
      remoteStatus({ id: '2', in_reply_to_id: '1' }),
      'https://graz.social',
    );
    const parent = adaptAnonymousStatus(remoteStatus({ id: '1' }), 'https://graz.social');

    expect(reply.in_reply_to_id).toBe(parent.id);
  });

  it('leaves a post that replies to nothing with a null parent', () => {
    const root = adaptAnonymousStatus(remoteStatus({ in_reply_to_id: null }), 'https://a.example');
    expect(root.in_reply_to_id).toBeNull();
  });
});
