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
