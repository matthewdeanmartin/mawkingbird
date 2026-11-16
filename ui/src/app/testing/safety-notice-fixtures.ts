import { Account, MastodonNotification } from '../platform/api/models';

/**
 * Payload shapes Mastodon 4.3+ sends for the two account-safety notification
 * types (Notification entity, `moderation_warning` and `event`). Older servers
 * simply never send them.
 */
const self = {
  id: 'me',
  username: 'me',
  acct: 'me',
  display_name: 'Me',
  url: 'https://home.example/@me',
  avatar: '',
} as Account;

export function moderationWarningNotification(
  overrides: Partial<NonNullable<MastodonNotification['moderation_warning']>> = {},
): MastodonNotification {
  return {
    id: 'mw-1',
    type: 'moderation_warning',
    created_at: '2026-11-16T09:00:00.000Z',
    account: self,
    moderation_warning: {
      id: '42',
      action: 'delete_statuses',
      text: 'Please keep spoilers behind a content warning.',
      status_ids: ['111', '112'],
      target_account: self,
      appeal: null,
      created_at: '2026-11-16T09:00:00.000Z',
      ...overrides,
    },
  };
}

export function severedRelationshipsNotification(
  overrides: Partial<NonNullable<MastodonNotification['event']>> = {},
): MastodonNotification {
  return {
    id: 'sr-1',
    type: 'severed_relationships',
    created_at: '2026-11-16T08:00:00.000Z',
    account: self,
    event: {
      id: '7',
      type: 'domain_block',
      purged: false,
      target_name: 'bad.example',
      followers_count: 3,
      following_count: 2,
      created_at: '2026-11-16T08:00:00.000Z',
      ...overrides,
    },
  };
}
