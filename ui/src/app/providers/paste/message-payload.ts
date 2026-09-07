import { Account, Status } from '../../models';
import { PasteCreateInput } from './paste-provider';

/**
 * The shortener stores a redirect target, so a "paste" is really a message
 * encoded into a query-free mawkingbird.com/message/ route. These helpers are the single
 * encode/decode contract shared by the shortener provider (writes the target)
 * and the /message reader page (reads it back and rebuilds a Mastodon status).
 *
 * Legacy query params (all optional except `m`):
 *   m  - message body (plain text)
 *   cw - content warning / spoiler text (shown as the collapsible CW)
 *   l  - language code (default plaintext)
 */
export interface MessagePayload {
  content: string;
  spoiler: string;
  language: string;
}

const READER_ACCOUNT: Account = {
  id: 'paste:message',
  username: 'message',
  acct: 'message@tinyurl.com',
  display_name: 'Shared message',
  note: 'A message shared as a short link.',
  url: '',
  avatar: 'https://tinyurl.com/favicon.ico',
  avatar_static: 'https://tinyurl.com/favicon.ico',
  header: '',
  followers_count: 0,
  following_count: 0,
  statuses_count: 0,
  bot: false,
  locked: false,
  discoverable: false,
  fields: [],
};

/** Absolute base of the running deployment (origin + base href), ending in `/`. */
function deploymentBase(): string {
  // document.baseURI already folds in the <base href> (/, /canary/, …).
  return document.baseURI.endsWith('/') ? document.baseURI : `${document.baseURI}/`;
}

/**
 * Build the mawkingbird.com/message/ target URL that the shortener will wrap.
 * The compose flow puts any content-warning text in `input.title`, so that maps
 * to the reader's collapsible CW.
 *
 * The payload lives in a base64url route segment, not a nested query string.
 * TinyURL's legacy endpoint preserves percent escapes in its `url=` value
 * instead of decoding them like an ordinary form parser. A query target therefore
 * turned spaces into either literal `+` or visible `%20`, depending on which
 * writer produced it. The route alphabet has no `%`, `+`, `&`, `?`, or `=`, so
 * there is no second encoding layer for TinyURL to interpret differently.
 */
export function buildMessageUrl(
  input: Pick<PasteCreateInput, 'title' | 'content' | 'language'>,
  base: string = deploymentBase(),
): string {
  const payload: MessagePayload = {
    content: input.content,
    spoiler: input.title.trim(),
    language: input.language || 'plaintext',
  };
  return new URL(`message/${messageStatusRouteRef(payload)}`, base).toString();
}

/** Read message fields from the old query-string format. */
export function parseMessageParams(params: URLSearchParams): MessagePayload | null {
  const content = params.get('m');
  if (content === null) return null;
  return {
    content: decodeLegacyQueryValue(content),
    spoiler: decodeLegacyQueryValue(params.get('cw') ?? ''),
    language: decodeLegacyQueryValue(params.get('l') ?? 'plaintext'),
  };
}

/**
 * Repair the two broken query encodings already present in permanent TinyURLs.
 *
 * Newer query links expose one encoded layer (`%20`, `%0A`, …) after
 * URLSearchParams has decoded the redirect URL. Older links expose prose spaces
 * as literal plus signs. The latter is intrinsically ambiguous with an intended
 * plus, so only repair it when at least two pluses join word characters and the
 * value contains no real whitespace — the characteristic sentence-shaped case.
 */
function decodeLegacyQueryValue(value: string): string {
  if (/%[0-9a-f]{2}/i.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  const wordJoiners = value.match(/[\p{L}\p{N}]\+(?=[\p{L}\p{N}])/gu)?.length ?? 0;
  return wordJoiners >= 2 && !/\s/u.test(value) ? value.replaceAll('+', ' ') : value;
}

/**
 * Route-segment scheme for a self-contained message, mirroring the
 * `anonymous-status.` refs: the whole payload is base64url-encoded into a single
 * `/statuses/:id` segment so the native thread page can render it as a real post
 * with no network. This is what lets a shared message open in the same "show a
 * post" view a logged-in user sees for any other status.
 */
const MESSAGE_STATUS_PREFIX = 'message-status.';

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const encoded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode a message payload into a `/statuses/:id` route segment. */
export function messageStatusRouteRef(payload: MessagePayload): string {
  return `${MESSAGE_STATUS_PREFIX}${base64UrlEncode(JSON.stringify(payload))}`;
}

/** Decode a `/statuses/:id` segment back into a message payload, or null. */
export function parseMessageStatusRouteRef(id: string): MessagePayload | null {
  if (!id.startsWith(MESSAGE_STATUS_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      base64UrlDecode(id.slice(MESSAGE_STATUS_PREFIX.length)),
    ) as Partial<MessagePayload>;
    if (typeof parsed?.content !== 'string') return null;
    return {
      content: parsed.content,
      spoiler: typeof parsed.spoiler === 'string' ? parsed.spoiler : '',
      language: typeof parsed.language === 'string' ? parsed.language : 'plaintext',
    };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Render a decoded message as a Mastodon status for the existing status card. */
export function messageStatus(payload: MessagePayload, sourceUrl: string | null): Status {
  const content = escapeHtml(payload.content).replaceAll('\n', '<br>');
  return {
    provider: 'paste',
    id: 'paste:message:local',
    created_at: new Date().toISOString(),
    edited_at: null,
    content,
    spoiler_text: payload.spoiler,
    visibility: 'unlisted',
    url: sourceUrl,
    account: READER_ACCOUNT,
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
    sensitive: !!payload.spoiler,
    poll: null,
    quote_approval_policy: null,
    language: payload.language,
    media_attachments: [],
    application: { name: 'TinyURL link', website: 'https://tinyurl.com' },
  };
}
