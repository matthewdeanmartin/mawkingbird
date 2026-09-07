// Adapts app.bsky feed views into Mastodon-shaped Status objects.

import { Account, MediaAttachment, Quote, Relationship, Status } from '../../models';
import {
  BskyAuthor,
  BskyEmbeddedRecord,
  BskyEmbedView,
  BskyFacet,
  BskyFeedItem,
  BskyPostView,
  BskyProfile,
  BskyRef,
} from './bluesky-types';

/** Butterfly-blue placeholder for authors without an avatar. */
export const BSKY_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="7" fill="#0085ff"/>' +
      '<path d="M9 8c3 1 6 4 7 7 1-3 4-6 7-7 2-1 3 0 3 2 0 4-2 9-5 10-2 1-4 0-5-2-1 2-3 3-5 2-3-1-5-6-5-10 0-2 1-3 3-2z" fill="#fff"/>' +
      '</svg>',
  );

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function facetHref(facet: BskyFacet): string | null {
  const feature = facet.features[0];
  if (!feature) {
    return null;
  }
  if (feature.$type.endsWith('#link') && feature.uri) {
    return feature.uri;
  }
  if (feature.$type.endsWith('#mention') && feature.did) {
    return `https://bsky.app/profile/${feature.did}`;
  }
  if (feature.$type.endsWith('#tag') && feature.tag) {
    return `https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`;
  }
  return null;
}

/**
 * Bluesky rich text → HTML. Facet indices are UTF-8 *byte* offsets, so the text
 * is walked as bytes and each range decoded back to a string. Plain segments are
 * escaped; facet segments become external links. Blank lines become paragraphs.
 */
export function renderRichText(text: string, facets: BskyFacet[] = []): string {
  const bytes = new TextEncoder().encode(text);
  const decoder = new TextDecoder();

  // Sort and drop overlaps so ranges can be consumed left to right.
  const sorted = [...facets]
    .filter((f) => f.index.byteStart < f.index.byteEnd && f.index.byteEnd <= bytes.length)
    .sort((a, b) => a.index.byteStart - b.index.byteStart);

  let html = '';
  let pos = 0;
  for (const facet of sorted) {
    if (facet.index.byteStart < pos) {
      continue; // overlapping facet: keep the earlier one
    }
    html += escapeHtml(decoder.decode(bytes.slice(pos, facet.index.byteStart)));
    const segment = escapeHtml(
      decoder.decode(bytes.slice(facet.index.byteStart, facet.index.byteEnd)),
    );
    const href = facetHref(facet);
    html += href ? `<a href="${escapeHtml(href)}">${segment}</a>` : segment;
    pos = facet.index.byteEnd;
  }
  html += escapeHtml(decoder.decode(bytes.slice(pos)));

  const paragraphs = html
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return paragraphs || '<p></p>';
}

export function adaptAuthor(author: BskyAuthor): Account {
  const avatar = author.avatar ?? BSKY_AVATAR;
  return {
    id: `bsky:${author.did}`,
    username: author.handle,
    acct: author.handle,
    display_name: author.displayName ?? author.handle,
    note: '',
    url: `https://bsky.app/profile/${author.handle}`,
    avatar,
    avatar_static: avatar,
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
 * Bluesky's plain-text bio → the HTML `Account.note` the profile header renders.
 *
 * Not rich text: `getProfile` returns `description` as a bare string with no
 * facets, so links in a bio arrive as text and stay text. Escaping is therefore
 * the whole job — the profile template binds this through `innerHTML`.
 */
function adaptDescription(description: string | undefined): string {
  if (!description?.trim()) {
    return '';
  }
  return escapeHtml(description)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * A detailed actor profile → a Mastodon `Account`.
 *
 * The richer sibling of {@link adaptAuthor}, which only ever sees the trimmed
 * `profileView` embedded in a post and so has to zero the counts. This one comes
 * from `app.bsky.actor.getProfile` and carries the bio, banner and all three
 * counts, which is what the profile page's header needs.
 */
export function adaptProfile(profile: BskyProfile): Account {
  const avatar = profile.avatar ?? BSKY_AVATAR;
  return {
    id: `bsky:${profile.did}`,
    username: profile.handle,
    acct: profile.handle,
    display_name: profile.displayName ?? profile.handle,
    note: adaptDescription(profile.description),
    url: `https://bsky.app/profile/${profile.handle}`,
    avatar,
    avatar_static: avatar,
    header: profile.banner ?? '',
    followers_count: profile.followersCount ?? 0,
    following_count: profile.followsCount ?? 0,
    statuses_count: profile.postsCount ?? 0,
    bot: false,
    locked: false,
    fields: [],
  };
}

/**
 * The viewer's relationship to an actor, in Mastodon's shape.
 *
 * `requested` is always false, and that is a protocol fact rather than a gap:
 * Bluesky has no locked accounts and no follow requests, so a follow either
 * exists or does not. `showing_reblogs` is left unset for the same reason — the
 * per-follow "hide boosts" toggle has no AT Protocol equivalent.
 */
export function adaptRelationship(profile: BskyProfile): Relationship {
  const viewer = profile.viewer;
  return {
    id: `bsky:${profile.did}`,
    following: !!viewer?.following,
    followed_by: !!viewer?.followedBy,
    requested: false,
    blocking: !!viewer?.blocking,
    muting: !!viewer?.muted,
  };
}

/** Public bsky.app URL for a post (at-uri rkey is the last path segment). */
export function postUrl(handle: string, uri: string): string {
  return `https://bsky.app/profile/${handle}/post/${uri.split('/').pop()}`;
}

function adaptImages(embed: BskyEmbedView | undefined, postUri: string): MediaAttachment[] {
  const images = embed?.images ?? embed?.media?.images ?? [];
  return images.map((img, i) => ({
    id: `bsky-media:${postUri}:${i}`,
    type: 'image',
    url: img.fullsize,
    preview_url: img.thumb,
    description: img.alt || null,
  }));
}

/** The external link card's target url, if this post has one. */
function externalUri(embed: BskyEmbedView | undefined): string | null {
  return (embed?.external ?? embed?.media?.external)?.uri ?? null;
}

function externalCard(embed: BskyEmbedView | undefined): string {
  const external = embed?.external ?? embed?.media?.external;
  if (!external) {
    return '';
  }
  const label = external.title || external.uri;
  return `<p>🔗 <a href="${escapeHtml(external.uri)}">${escapeHtml(label)}</a></p>`;
}

function embeddedRecord(embed: BskyEmbedView | undefined): BskyEmbeddedRecord | null {
  if (!embed?.record) {
    return null;
  }
  // record#view holds the ViewRecord directly; recordWithMedia nests it once more.
  const inner = embed.record;
  return 'record' in inner && inner.record ? inner.record : (inner as BskyEmbeddedRecord);
}

function adaptQuote(embed: BskyEmbedView | undefined): Quote | null {
  const record = embeddedRecord(embed);
  if (!record) {
    return null;
  }
  if (!record.uri || !record.author || !record.value) {
    // viewNotFound / viewBlocked / detached: show the "unavailable" quote card.
    return { state: 'deleted', quoted_status: null };
  }
  return {
    state: 'accepted',
    quoted_status: {
      provider: 'bluesky',
      id: `bsky:${record.uri}`,
      created_at: record.value.createdAt,
      edited_at: null,
      content: renderRichText(record.value.text, record.value.facets),
      spoiler_text: '',
      visibility: 'public',
      url: postUrl(record.author.handle, record.uri),
      account: adaptAuthor(record.author),
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
    },
  };
}

export function adaptPost(post: BskyPostView): Status {
  const ref: BskyRef = {
    uri: post.uri,
    cid: post.cid,
    likeUri: post.viewer?.like ?? null,
    repostUri: post.viewer?.repost ?? null,
    // Replying to this post keeps its thread root, or starts one at the post itself.
    replyRoot: post.record.reply?.root ?? { uri: post.uri, cid: post.cid },
    replyParentUri: post.record.reply?.parent.uri ?? null,
    externalUri: externalUri(post.embed),
  };
  return {
    provider: 'bluesky',
    providerRef: ref,
    id: `bsky:${post.uri}`,
    created_at: post.record.createdAt || post.indexedAt,
    edited_at: null,
    content: renderRichText(post.record.text, post.record.facets) + externalCard(post.embed),
    spoiler_text: '',
    visibility: 'public',
    url: postUrl(post.author.handle, post.uri),
    account: adaptAuthor(post.author),
    reblog: null,
    quote: adaptQuote(post.embed),
    in_reply_to_id: post.record.reply ? `bsky:${post.record.reply.parent.uri}` : null,
    replies_count: post.replyCount ?? 0,
    reblogs_count: post.repostCount ?? 0,
    favourites_count: post.likeCount ?? 0,
    favourited: !!post.viewer?.like,
    reblogged: !!post.viewer?.repost,
    bookmarked: !!post.viewer?.bookmarked,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    // First of the declared languages: the record carries an array, Mastodon's
    // shape carries one, and everything downstream (the Language facet, the
    // per-language filter) reads the single value. Absent on plenty of posts,
    // which is a real null rather than a default worth inventing.
    language: post.record.langs?.[0] ?? null,
    media_attachments: adaptImages(post.embed, post.uri),
  };
}

/** A timeline item: a plain post, or a repost wrapped Mastodon-boost style. */
export function adaptFeedItem(item: BskyFeedItem): Status {
  const post = adaptPost(item.post);
  if (item.reason?.$type.endsWith('#reasonRepost') && item.reason.by) {
    return {
      ...post,
      id: `bsky:repost:${item.reason.by.did}:${item.post.uri}`,
      created_at: item.reason.indexedAt ?? post.created_at,
      account: adaptAuthor(item.reason.by),
      content: '',
      reblog: post,
      providerRef: null,
    };
  }
  return post;
}
