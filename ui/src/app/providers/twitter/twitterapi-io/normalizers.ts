import { Account, MediaAttachment, Mention, Status } from '../../../models';
import { WireEntities, WireMedia, WireTweet, WireUrlEntity, WireUser } from './wire-types';

/**
 * Turns TwitterAPI.io wire objects into the Mastodon shapes the whole app
 * already renders.
 *
 * Pure functions, no injection, no HTTP — so every branch is unit-testable
 * against the captured fixtures, which is where the real value is. These are
 * the functions most likely to break when the provider changes, and the only
 * ones that can be tested without spending money.
 *
 * ## Ids are namespaced, and always strings
 *
 * `twitter:<postId>` and `twitter:@<handle>`, matching the existing convention
 * (`rss:…`, `bsky:…`). Two reasons, both load-bearing: it keeps id-based dedupe
 * and delete in the timeline from colliding with real Mastodon ids, and it lets
 * `StatusCard` route an interaction back to the right provider.
 *
 * Twitter ids exceed `Number.MAX_SAFE_INTEGER` (spec §8.1), so they are never parsed
 * as numbers anywhere in this file — not even transiently.
 */

/** Namespaced status id. */
export function statusId(tweetId: string): string {
  return `twitter:${tweetId}`;
}

/** Namespaced account id. Handle-based: it is what a URL needs and what a user types. */
export function accountId(username: string): string {
  return `twitter:@${username}`;
}

/**
 * The canonical permalink for a post, built from parts we always have.
 *
 * Used when the provider omits `url` and `twitterUrl`. Returns null only when
 * the pieces genuinely are not there, which the guards should already have
 * prevented.
 */
export function permalink(username: string, tweetId: string | undefined): string | null {
  return username && tweetId ? `https://x.com/${username}/status/${tweetId}` : null;
}

/**
 * Convert a provider timestamp to ISO-8601, or null.
 *
 * Two formats appear in one API, which is exactly the trap §9 warns about:
 *
 * - Posts use Twitter's legacy format: `Fri Jul 31 22:22:43 +0000 2026`
 * - Profiles use ISO-8601 with microseconds: `2006-03-21T20:50:14.000000Z`
 *
 * Both were observed on 2026-07-31. `Date.parse` handles both, but a failure
 * must yield null rather than the current time: a post stamped "now" because
 * its date was unparseable would leap to the top of a reverse-chronological
 * timeline, which is the most visible possible corruption of a feed.
 */
export function normalizeTimestamp(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** HTML-escape. Post text is arbitrary user input and goes into `content`. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** An `<a>` with the attributes the rest of the app's post CSS expects. */
function link(href: string, text: string, className?: string): string {
  const cls = className ? ` class="${className}"` : '';
  return `<a href="${escapeHtml(href)}"${cls} target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(text)}</a>`;
}

/**
 * Render post text as Mastodon-style HTML.
 *
 * X sends plain text plus entity offsets; Mastodon sends HTML. Rather than
 * splice by the `indices` X provides, this rewrites by token. The offsets are
 * UTF-16-hostile — they are code *point* indices into a string containing
 * emoji and astral characters, so slicing a JavaScript string with them
 * misaligns the moment a post contains an emoji, which for tweets is most of
 * them. Matching `@handle`, `#tag` and `t.co` links textually is immune to that
 * entire class of bug, and produces the same result.
 *
 * The `t.co` shortener is undone where the entity list gives us the real
 * destination: readers should see where a link goes. Per §8.4 this uses only
 * the provider-supplied `expanded_url` — never a HEAD request per link.
 */
export function renderContent(tweet: WireTweet): string {
  const raw = tweet.text ?? '';
  if (!raw) {
    return '';
  }

  const expansions = new Map<string, WireUrlEntity>();
  for (const url of tweet.entities?.urls ?? []) {
    if (url.url) {
      expansions.set(url.url, url);
    }
  }
  // Media links are decoration: the image is rendered as an attachment, so the
  // trailing `https://t.co/…` that points at it is noise in the text.
  const mediaLinks = new Set(
    (tweet.extendedEntities?.media ?? []).map((m) => m.url).filter((u): u is string => !!u),
  );

  const paragraphs = raw.split(/\n{2,}/);
  const rendered = paragraphs.map((paragraph) => {
    const lines = paragraph.split('\n').map((line) => renderLine(line, expansions, mediaLinks));
    return `<p>${lines.join('<br />')}</p>`;
  });
  return rendered.join('');
}

/** One line of post text, with mentions, hashtags, cashtags and URLs linked. */
function renderLine(
  line: string,
  expansions: Map<string, WireUrlEntity>,
  mediaLinks: Set<string>,
): string {
  // One pass, alternation ordered so URLs win over the `#`/`@` inside them.
  const TOKEN = /(https?:\/\/[^\s]+)|(^|[^\w])@([A-Za-z0-9_]{1,15})|(^|[^\w])([#$])([A-Za-z]\w*)/g;

  let out = '';
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const index = match.index;
    out += escapeHtml(line.slice(last, index));
    last = index + match[0].length;

    if (match[1]) {
      const url = match[1];
      if (mediaLinks.has(url)) {
        // Drop it: the media is already attached. Also trim the space we just
        // emitted before it, so the text does not end with a dangling gap.
        out = out.replace(/\s+$/, '');
        continue;
      }
      const entity = expansions.get(url);
      const href = entity?.expanded_url ?? url;
      const text = entity?.display_url ?? url;
      out += link(href, text);
    } else if (match[3]) {
      const handle = match[3];
      out += match[2] ?? '';
      out += link(`https://x.com/${handle}`, `@${handle}`, 'mention');
    } else if (match[6]) {
      const sigil = match[5];
      const tag = match[6];
      out += match[4] ?? '';
      const path = sigil === '#' ? 'hashtag' : 'search?q=%24';
      const href = sigil === '#' ? `https://x.com/hashtag/${tag}` : `https://x.com/${path}${tag}`;
      out += link(href, `${sigil}${tag}`, 'hashtag');
    }
  }
  out += escapeHtml(line.slice(last));
  return out;
}

/** Profile note (bio), with any URLs in it expanded. */
function renderNote(user: WireUser): string {
  const description = user.description ?? '';
  if (!description) {
    return '';
  }
  const expansions = new Map<string, WireUrlEntity>();
  for (const url of user.entities?.description?.urls ?? []) {
    if (url.url) {
      expansions.set(url.url, url);
    }
  }
  return `<p>${renderLine(description, expansions, new Set())}</p>`;
}

/** The profile's website, expanded out of its `t.co` wrapper. */
function websiteUrl(user: WireUser): string {
  const entity = user.entities?.url?.urls?.[0];
  return entity?.expanded_url ?? user.url ?? '';
}

/** A wire profile as a Mastodon `Account`. */
export function toAccount(user: WireUser): Account {
  const username = user.userName ?? user.id ?? 'unknown';
  const website = websiteUrl(user);
  return {
    id: accountId(username),
    username,
    // `acct` carries the domain so the UI renders `@handle@x.com` and nobody
    // mistakes a Twitter account for a local one.
    acct: `${username}@x.com`,
    display_name: user.name ?? username,
    note: renderNote(user),
    url: `https://x.com/${username}`,
    avatar: user.profilePicture ?? '',
    avatar_static: user.profilePicture ?? '',
    header: user.coverPicture ?? '',
    header_static: user.coverPicture ?? '',
    followers_count: user.followers ?? 0,
    following_count: user.following ?? 0,
    statuses_count: user.statusesCount ?? 0,
    bot: user.isAutomated === true,
    locked: user.protected === true,
    fields: [
      ...(user.location ? [{ name: 'Location', value: escapeHtml(user.location) }] : []),
      ...(website ? [{ name: 'Website', value: link(website, website) }] : []),
      // Both verification signals are preserved rather than collapsed into one
      // boolean: §8.2 is explicit that a blue check is not legacy verification,
      // and "Government" is a materially different claim from "paid for a tick".
      ...(user.verifiedType ? [{ name: 'Verified', value: escapeHtml(user.verifiedType) }] : []),
    ],
  };
}

/** Media attachments. Images and video/GIF, with the best usable URL. */
function toMedia(media: WireMedia[]): MediaAttachment[] {
  return media.map((item, index) => {
    const type = item.type === 'animated_gif' ? 'gifv' : (item.type ?? 'image');
    return {
      id: `${item.media_url_https ?? item.url ?? 'media'}#${index}`,
      type: type === 'photo' ? 'image' : type,
      url: bestMediaUrl(item),
      preview_url: item.media_url_https ?? '',
      description: item.ext_alt_text ?? null,
    };
  });
}

/**
 * The URL to actually play or show.
 *
 * For video, the highest-bitrate MP4 — deliberately not the HLS playlist, which
 * has no `bitrate` and which a plain `<video>` element cannot play in every
 * browser. §8.5 warns these URLs can expire, which is why nothing caches them
 * beyond the post itself.
 */
function bestMediaUrl(item: WireMedia): string {
  const variants = item.video_info?.variants ?? [];
  const mp4s = variants
    .filter((v) => v.content_type === 'video/mp4' && typeof v.url === 'string')
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return mp4s[0]?.url ?? item.media_url_https ?? '';
}

/** Resolved @-mentions, so the UI can render them as real links. */
function toMentions(entities: WireEntities | undefined): Mention[] {
  return (entities?.user_mentions ?? [])
    .filter((mention) => !!mention.screen_name)
    .map((mention) => ({
      id: mention.id_str ?? '',
      username: mention.screen_name!,
      acct: `${mention.screen_name}@x.com`,
      url: `https://x.com/${mention.screen_name}`,
    }));
}

/**
 * A wire post as a Mastodon `Status`.
 *
 * @param depth Guards against unbounded recursion through quote/retweet chains.
 * §8.3 recommends a maximum embedded depth of 2; beyond that the nested post is
 * dropped rather than expanded. A cycle here would hang the renderer, and these
 * are objects from an unofficial source that nobody promises are acyclic.
 */
export function toStatus(tweet: WireTweet, depth = 0): Status {
  const author = toAccount(tweet.author ?? {});
  const media = tweet.extendedEntities?.media ?? [];

  // A retweet is Mastodon's `reblog`: the outer status is the boost, the inner
  // one is the post. Twitter's "RT @user: …" text is a rendering of the same thing,
  // so it is replaced by the real nested post rather than shown twice.
  const reblog =
    depth < 2 && tweet.retweeted_tweet ? toStatus(tweet.retweeted_tweet, depth + 1) : null;

  const quoted = depth < 2 && tweet.quoted_tweet ? toStatus(tweet.quoted_tweet, depth + 1) : null;

  return {
    provider: 'twitter',
    // What a later interaction needs to find this post again without reparsing.
    providerRef: { tweetId: tweet.id, authorId: tweet.author?.id },
    id: statusId(tweet.id ?? ''),
    // An unreadable date stays unreadable rather than being forged into epoch.
    //
    // This used to be `new Date(0)`, chosen so such a post "sorts last rather
    // than jumping to the top". The bottom turned out to be the worse end: epoch
    // is older than every real post, so the status stuck to the end of Home and
    // every later page merged above it — one permanently pinned post per
    // session. `byNewestFirst` in status-sort.ts now treats an unparseable date
    // as *unknown* and holds the post where it arrived, so passing the bad value
    // through is both honest and correctly ordered.
    created_at: normalizeTimestamp(tweet.createdAt) ?? tweet.createdAt ?? '',
    edited_at: null,
    content: reblog ? '' : renderContent(tweet),
    spoiler_text: '',
    visibility: 'public',
    // Falls back to a URL built from the handle and post id rather than null.
    // Both are required fields the guards already enforce, so the canonical
    // permalink is always derivable — and returning null here silently costs
    // the post its "↗ Nitter" link, which is the only way out of the app for an
    // tweet. Observed with a response that carried neither `url` nor
    // `twitterUrl`.
    url: tweet.url ?? tweet.twitterUrl ?? permalink(author.username, tweet.id),
    account: author,
    reblog,
    quote: quoted ? { state: 'accepted', quoted_status: quoted } : null,
    in_reply_to_id: tweet.inReplyToId ? statusId(tweet.inReplyToId) : null,
    replies_count: tweet.replyCount ?? 0,
    reblogs_count: tweet.retweetCount ?? 0,
    favourites_count: tweet.likeCount ?? 0,
    // No signed-in X user exists, so these are all false by construction —
    // never "unknown". Reading public data cannot tell us what someone liked.
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: tweet.possiblySensitive === true,
    poll: null,
    quote_approval_policy: null,
    language: tweet.lang ?? null,
    media_attachments: reblog ? [] : toMedia(media),
    application: tweet.source ? { name: tweet.source } : null,
    mentions: toMentions(tweet.entities),
  };
}
