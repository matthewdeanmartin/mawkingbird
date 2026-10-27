import { Account, Status } from '../models';

/** Posts and accounts for Forum specs: one id per minute, so order is by id. */
export function account(id: string, acct = `u${id}`): Account {
  return {
    id,
    username: `u${id}`,
    acct,
    display_name: `User ${id}`,
    url: `https://home.example/@u${id}`,
    avatar: `https://home.example/${id}.png`,
  } as Account;
}

export function post(id: string, author: string, overrides: Partial<Status> = {}): Status {
  return {
    id,
    uri: `https://origin.example/statuses/${id}`,
    created_at: `2026-10-27T10:${id.padStart(2, '0').slice(-2)}:00.000Z`,
    edited_at: null,
    content: `<p>post ${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: account(author),
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    ...overrides,
  };
}

/** A reply by `author` to `parent`. */
export function reply(id: string, author: string, parent: Status, overrides: Partial<Status> = {}) {
  return post(id, author, {
    in_reply_to_id: parent.id,
    in_reply_to_account_id: parent.account.id,
    ...overrides,
  });
}

/** A fixture account's person key (its profile URL), as Forum matches people. */
export function who(id: string): string {
  return account(id).url;
}

/**
 * The copy of `local` that its own server serves anonymously: the same post
 * (same uri), under that server's namespaced ids, as `adaptAnonymousStatus`
 * produces. `parent` is the origin copy it replies to, if any.
 */
export function originCopy(local: Status, parent?: Status): Status {
  const raw = local.id.replace(/^anonymous-mastodon:[^:]+:/, '');
  return {
    ...local,
    id: `anonymous-mastodon:origin.example:${raw}`,
    in_reply_to_id: parent ? parent.id : local.in_reply_to_id,
    provider: 'anonymous-mastodon',
    providerRef: { server: 'https://origin.example', statusId: raw, accountId: 'o' },
    account: { ...local.account, id: `o-${local.account.id}` },
  };
}
