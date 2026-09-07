import { Account, Status } from '../../models';
import { BloggerPost } from './blogger-api';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Immediate local representation of a post Blogger just accepted.
 *
 * The body is re-escaped from the *source* text rather than reusing the HTML
 * that was sent. Blogger stores real markup, but this Status is rendered in the
 * timeline where the content is treated as trusted server HTML — piping our own
 * generated markup back through that path is how a formatting feature turns
 * into an injection bug. The timeline gets a plain, escaped preview; the blog
 * gets the rich version.
 *
 * A draft has no public URL yet, so the card links to the blog's post editor
 * instead of nowhere.
 */
export function bloggerStatus(
  created: BloggerPost,
  title: string,
  body: string,
  account: Account,
  options: { isDraft: boolean; blogName: string | null },
): Status {
  const draftNote = options.isDraft
    ? '<br><em>Saved as a draft — not visible on your blog yet.</em>'
    : '';
  return {
    provider: 'blog',
    providerRef: { providerId: 'blogger', slug: created.id },
    id: `blog:blogger:${created.id}`,
    created_at: created.published ?? new Date().toISOString(),
    edited_at: null,
    content: `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(body).replaceAll(
      '\n',
      '<br>',
    )}${draftNote}`,
    spoiler_text: '',
    visibility: 'public',
    url: created.url ?? '',
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
    application: {
      name: options.blogName ? `Blogger — ${options.blogName}` : 'Blogger',
      website: 'https://www.blogger.com/',
    },
  };
}
