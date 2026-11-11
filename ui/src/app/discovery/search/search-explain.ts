/**
 * Turns a `MawkingbirdSearch` into (a) the active-filter chips shown above
 * results (§10) and (b) the structured content of the Explain panel (§9).
 *
 * The central honesty rule (spec §23): every criterion is either sent to the
 * server (`origin: 'server'`) or applied to loaded results (`origin: 'loaded'`).
 * Which one a post criterion falls into depends on whether the viewer is
 * authenticated — anonymous post search can't send full-text operators, so
 * everything degrades to a loaded-result filter. This module is the single
 * place that classification lives, so the chips and the Explain panel never
 * disagree.
 *
 * Chip text is a translation key plus parameters rather than an assembled
 * English string ("Exact: " + phrase): English word order is not universal, and
 * a whole-string key with `{{value}}` lets every locale place the value where
 * its own grammar wants it. See the `migrate-i18n` skill's case (a).
 */
// i18n pages.search.chip.word: {{word}}
// i18n pages.search.chip.exactPhrase: Exact: {{phrase}}
// i18n pages.search.chip.excludeWord: Exclude: {{word}}
// i18n pages.search.chip.author: From {{author}}
// i18n pages.search.chip.after: After {{date}}
// i18n pages.search.chip.before: Before {{date}}
// i18n pages.search.chip.language: {{language}}
// i18n pages.search.chip.repliesOnly: Replies only
// i18n pages.search.chip.noReplies: Exclude replies
// i18n pages.search.chip.sensitiveOnly: Sensitive only
// i18n pages.search.chip.excludeSensitive: Exclude sensitive
// i18n pages.search.chip.scopePublic: Public
// i18n pages.search.chip.scopeLibrary: My library
// i18n pages.search.contentType.media: Has media
// i18n pages.search.contentType.image: Images only
// i18n pages.search.contentType.video: Video only
// i18n pages.search.contentType.audio: Audio only
// i18n pages.search.contentType.poll: Polls only
// i18n pages.search.contentType.link: Links only
// i18n pages.search.contentType.text: Text only
// i18n pages.search.contentType.any: Any

import { MawkingbirdSearch, PostSearchCriteria } from './mawkingbird-search';
import { serializeMastodonQuery } from './mastodon-query-serializer';

export type ChipOrigin = 'server' | 'loaded';

export interface Chip {
  /** Field this chip represents, so removal can clear the right criterion. */
  key: string;
  /** Translation key for the chip's text. */
  labelKey: string;
  /** Parameters for `labelKey`, when it takes any. */
  labelParams?: Record<string, string>;
  origin: ChipOrigin;
}

/** Which post criteria the serializer can push to the server (authenticated only). */
const SERVER_POST_KEYS = new Set([
  'words',
  'exactPhrase',
  'excludeWords',
  'author',
  'after',
  'before',
  'language',
  'media',
  'poll',
  'replies',
  'sensitive',
  'scope',
]);

/**
 * Build the active chips for a post search. When `authenticated`, criteria the
 * serializer emits are `origin: 'server'`; the rest (and everything when
 * anonymous) are `origin: 'loaded'`.
 */
export function postChips(post: PostSearchCriteria, authenticated: boolean): Chip[] {
  const chips: Chip[] = [];
  const push = (key: string, labelKey: string, labelParams?: Record<string, string>): void => {
    const isServerKey = authenticated && SERVER_POST_KEYS.has(key);
    chips.push({ key, labelKey, labelParams, origin: isServerKey ? 'server' : 'loaded' });
  };

  for (const w of (post.words ?? '').trim().split(/\s+/u).filter(Boolean)) {
    push('words', 'pages.search.chip.word', { word: w });
  }
  if (post.exactPhrase?.trim()) {
    push('exactPhrase', 'pages.search.chip.exactPhrase', { phrase: post.exactPhrase.trim() });
  }
  for (const w of (post.excludeWords ?? '').trim().split(/\s+/u).filter(Boolean)) {
    push('excludeWords', 'pages.search.chip.excludeWord', { word: w });
  }
  if (post.author?.trim()) {
    push('author', 'pages.search.chip.author', { author: post.author.trim() });
  }
  if (post.dates?.after) {
    push('after', 'pages.search.chip.after', { date: post.dates.after });
  }
  if (post.dates?.before) {
    push('before', 'pages.search.chip.before', { date: post.dates.before });
  }
  if (post.language) {
    push('language', 'pages.search.chip.language', { language: post.language.toUpperCase() });
  }
  if (post.contentType && post.contentType !== 'any') {
    // Only `media`/`poll` are server-side; image/video/audio/text/link are always loaded.
    const serverBacked = post.contentType === 'media' || post.contentType === 'poll';
    push(serverBacked ? post.contentType : 'contentType', contentTypeLabelKey(post.contentType));
  }
  if (post.replies && post.replies !== 'include') {
    push(
      'replies',
      post.replies === 'only' ? 'pages.search.chip.repliesOnly' : 'pages.search.chip.noReplies',
    );
  }
  if (post.sensitive && post.sensitive !== 'include') {
    push(
      'sensitive',
      post.sensitive === 'only'
        ? 'pages.search.chip.sensitiveOnly'
        : 'pages.search.chip.excludeSensitive',
    );
  }
  if (post.scope && post.scope !== 'all') {
    push(
      'scope',
      post.scope === 'public' ? 'pages.search.chip.scopePublic' : 'pages.search.chip.scopeLibrary',
    );
  }
  return chips;
}

function contentTypeLabelKey(t: NonNullable<PostSearchCriteria['contentType']>): string {
  switch (t) {
    case 'media':
      return 'pages.search.contentType.media';
    case 'image':
      return 'pages.search.contentType.image';
    case 'video':
      return 'pages.search.contentType.video';
    case 'audio':
      return 'pages.search.contentType.audio';
    case 'poll':
      return 'pages.search.contentType.poll';
    case 'link':
      return 'pages.search.contentType.link';
    case 'text':
      return 'pages.search.contentType.text';
    case 'any':
      return 'pages.search.contentType.any';
  }
}

export interface ExplainApiUsage {
  maximum: number;
  used: number;
  /** Statuses/tags the budget forced us to drop from an anonymous fan-out (§7). */
  tagsDropped: number;
}

/** A translatable line in the Explain panel's criteria lists. */
export interface ExplainLine {
  labelKey: string;
  labelParams?: Record<string, string>;
}

export interface ExplainPanel {
  endpoint: string;
  /** The serialized Mastodon query (authenticated only); empty string otherwise. */
  mastodonQuery: string;
  serverCriteria: ExplainLine[];
  loadedCriteria: ExplainLine[];
  /** Non-null only in anonymous post search: the hashtags the words became. */
  anonymousTags: string[] | null;
  apiUsage: ExplainApiUsage;
}

/**
 * Build the §9 Explain content for a post search. `anonymousTags` is the tag
 * list `searchPostsByHashtags` derived (surfaced via `SearchResults.hashtags`);
 * pass it for anonymous searches so the panel can show the transformation.
 */
export function explainPostSearch(
  search: MawkingbirdSearch,
  authenticated: boolean,
  anonymousTags: string[] | null,
  apiUsage: ExplainApiUsage = { maximum: search.apiCallBudget, used: 0, tagsDropped: 0 },
): ExplainPanel {
  const post = search.post ?? {};
  const chips = postChips(post, authenticated);
  const toLine = (c: Chip): ExplainLine => ({ labelKey: c.labelKey, labelParams: c.labelParams });
  const serverCriteria = chips.filter((c) => c.origin === 'server').map(toLine);
  const loadedCriteria = chips.filter((c) => c.origin === 'loaded').map(toLine);

  return {
    endpoint: authenticated
      ? 'GET /api/v2/search'
      : 'GET /api/v1/timelines/tag/{hashtag} (one per hashtag)',
    mastodonQuery: authenticated ? serializeMastodonQuery(post) : '',
    serverCriteria,
    loadedCriteria,
    anonymousTags: authenticated ? null : anonymousTags,
    apiUsage,
  };
}
