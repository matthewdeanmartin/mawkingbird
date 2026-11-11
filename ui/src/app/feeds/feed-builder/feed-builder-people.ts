import { Account } from '../../platform/api/models';
import { AnonymousFollow } from '../../accounts/anonymous/anonymous-follows';
import { FeedPerson } from './feed-builder-data';

/** `user@host` split, for building records from an exported handle. */
function parts(acct: string): { username: string; host: string } {
  const [username, host] = acct.split('@');
  return { username, host };
}

/**
 * The person as an `Account` from their home server, for the follow button and
 * the importer: both resolve it on the reader's own server before following
 * (a home-server id means nothing elsewhere). Counts are unknown here and zero.
 */
export function personAccount(person: FeedPerson): Account {
  const { username } = parts(person.acct);
  return {
    id: person.id,
    username,
    acct: person.acct,
    display_name: person.displayName,
    note: person.bio,
    url: person.url,
    avatar: person.avatar,
    avatar_static: person.avatar,
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
  };
}

/**
 * The person as an anonymous follow that is never stored: the preview reads
 * their public posts the way anonymous Home reads a followed account.
 */
export function previewFollow(person: FeedPerson): AnonymousFollow {
  const { username, host } = parts(person.acct);
  const server = `https://${host}`;
  return {
    key: person.acct.toLowerCase(),
    handle: `${username}@${host}`,
    server,
    profileUrl: person.url,
    account: personAccount(person),
    followedAt: new Date(0).toISOString(),
    network: 'mastodon',
    readRef: { server, accountId: person.id },
    routeRetryAfter: { 'read-api': null, 'canonical-api': null, rss: null },
  };
}

/** Mawkingbird's own profile view for a person, signed in or anonymous. */
export function profileLink(person: FeedPerson): string {
  return `/accounts/@${person.acct}`;
}
