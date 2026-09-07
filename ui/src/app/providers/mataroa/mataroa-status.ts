import { Account, Status } from '../../models';
import { MataroaCreatedPost } from './mataroa-api';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Immediate local representation of a post the Mataroa API just accepted. */
export function mataroaStatus(
  created: MataroaCreatedPost,
  title: string,
  body: string,
  account: Account,
): Status {
  return {
    provider: 'blog',
    providerRef: { providerId: 'mataroa', slug: created.slug },
    id: `blog:mataroa:${created.slug}`,
    created_at: new Date().toISOString(),
    edited_at: null,
    content: `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(body).replaceAll('\n', '<br>')}`,
    spoiler_text: '',
    visibility: 'public',
    url: created.url,
    account,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
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
    application: { name: 'Mataroa', website: 'https://mataroa.blog/' },
  };
}
