import { languageName } from '../../language/language-catalog';
import { Status } from '../../platform/api/models';

// i18n postAnalytics.details.heading: Details
// i18n postAnalytics.details.posted: Posted
// i18n postAnalytics.details.edited: Last edited
// i18n postAnalytics.details.edits: Edits
// i18n postAnalytics.details.notEdited: Never
// i18n postAnalytics.details.language: Language
// i18n postAnalytics.details.languageUnknown: Not set
// i18n postAnalytics.details.client: Posted with
// i18n postAnalytics.details.clientHidden: Not shared. Mastodon shows the app only on your own posts.
// i18n postAnalytics.details.visibility: Visibility
// i18n postAnalytics.details.visibility.public: Public
// i18n postAnalytics.details.visibility.unlisted: Quiet public
// i18n postAnalytics.details.visibility.private: Followers only
// i18n postAnalytics.details.visibility.direct: Private mention
// i18n postAnalytics.details.quotes: Who may quote
// i18n postAnalytics.details.quotes.public: Anyone
// i18n postAnalytics.details.quotes.followers: Followers
// i18n postAnalytics.details.quotes.manual: Anyone, with the author's approval
// i18n postAnalytics.details.quotes.nobody: Only the author
// i18n postAnalytics.details.quotes.unknown: Not shared by the server
// i18n postAnalytics.details.warning: Content warning
// i18n postAnalytics.details.none: None
// i18n postAnalytics.details.sensitive: Media marked sensitive
// i18n postAnalytics.details.yes: Yes
// i18n postAnalytics.details.no: No
// i18n postAnalytics.details.media: Attachments
// i18n postAnalytics.details.mediaCount: {{count}}, {{described}} with a description
// i18n postAnalytics.details.server: Original server
// i18n postAnalytics.details.id: Post number on your server
// i18n postAnalytics.details.uri: Permanent address

/**
 * One row of the analytics page's Details list. `label` and a non-literal
 * `value` are i18n keys; a `literal` value is shown as is.
 */
export interface PostDetail {
  label: string;
  value: string;
  literal?: boolean;
  params?: Record<string, number | string>;
  href?: string;
}

type QuoteRule = 'public' | 'followers' | 'manual' | 'nobody' | 'unknown';

/** Who may quote, from Mastodon 4.5's `quote_approval`, else the older policy string. */
export function quoteRule(status: Status): QuoteRule {
  const approval = status.quote_approval;
  if (approval) {
    const auto = approval.automatic ?? [];
    if (auto.includes('public')) return 'public';
    if (auto.includes('followers')) return 'followers';
    if ((approval.manual ?? []).length) return 'manual';
    return 'nobody';
  }
  switch (status.quote_approval_policy) {
    case 'public':
      return 'public';
    case 'followers':
      return 'followers';
    case 'nobody':
      return 'nobody';
    default:
      return 'unknown';
  }
}

function host(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    return new URL(address).host || null;
  } catch {
    return null;
  }
}

function when(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

/**
 * The facts about a post that the card does not show: when and with what app
 * it was made, its language, audience and quote rule, and where it lives.
 * `edits` is the number of edits when known (from the post's history);
 * `homeId` is false for a post read anonymously, whose id is not the reader's.
 */
export function postDetails(
  status: Status,
  locale: string,
  edits: number | null,
  homeId = true,
): PostDetail[] {
  const rows: PostDetail[] = [
    { label: 'posted', value: when(status.created_at, locale), literal: true },
    status.edited_at
      ? { label: 'edited', value: when(status.edited_at, locale), literal: true }
      : { label: 'edited', value: 'notEdited' },
  ];
  if (status.edited_at && edits !== null) {
    rows.push({ label: 'edits', value: String(edits), literal: true });
  }
  rows.push(
    status.language
      ? {
          label: 'language',
          value: `${languageName(status.language, locale)} (${status.language})`,
          literal: true,
        }
      : { label: 'language', value: 'languageUnknown' },
  );
  const app = status.application?.name?.trim();
  rows.push(
    app
      ? {
          label: 'client',
          value: app,
          literal: true,
          href: /^https?:\/\//.test(status.application?.website ?? '')
            ? status.application!.website!
            : undefined,
        }
      : { label: 'client', value: 'clientHidden' },
  );
  const warning = (status.spoiler_text ?? '').trim();
  const visibility = ['public', 'unlisted', 'private', 'direct'].includes(status.visibility)
    ? `visibility.${status.visibility}`
    : null;
  rows.push(
    visibility
      ? { label: 'visibility', value: visibility }
      : { label: 'visibility', value: status.visibility, literal: true },
    { label: 'quotes', value: `quotes.${quoteRule(status)}` },
    warning
      ? { label: 'warning', value: warning, literal: true }
      : { label: 'warning', value: 'none' },
  );
  const media = status.media_attachments ?? [];
  if (media.length) {
    rows.push(
      { label: 'sensitive', value: status.sensitive ? 'yes' : 'no' },
      {
        label: 'media',
        value: 'mediaCount',
        params: {
          count: media.length,
          described: media.filter((m) => !!m.description?.trim()).length,
        },
      },
    );
  }
  const origin = host(status.uri) ?? host(status.url);
  if (origin) rows.push({ label: 'server', value: origin, literal: true });
  if (homeId && status.id) rows.push({ label: 'id', value: status.id, literal: true });
  const uri = status.uri ?? status.url;
  if (uri && /^https?:\/\//.test(uri)) {
    rows.push({ label: 'uri', value: uri, literal: true, href: uri });
  }
  return rows;
}
