import { Injectable, signal } from '@angular/core';
import type { Status } from '../../platform/api/models';

/** Bluesky's own moderation service; its labels are always requested. */
export const BSKY_MODERATION_DID = 'did:plc:ar7c4by46qjdydhdevvrndac';

/** One entry of `app.bsky.actor.defs#mutedWordsPref`. */
export interface BskyMutedWord {
  id?: string;
  value: string;
  targets: ('content' | 'tag')[];
  actorTarget?: 'all' | 'exclude-following';
  expiresAt?: string;
}

/**
 * The Bluesky moderation preferences the app applies while reading.
 *
 * Deliberately free of API dependencies: StatusVisibility reads it on every
 * card, and it must not pull the Bluesky client into the root bundle.
 * BlueskyModeration fills it from the account's preferences.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyModerationState {
  /** Muted words and tags. Bluesky leaves applying them to the client. */
  readonly mutedWords = signal<BskyMutedWord[]>([]);
  /** Subscribed moderation services, whose labels the AppView is asked for. */
  readonly labelers = signal<string[]>([]);
  /** The linked Bluesky account, whose own posts muted words never hide. */
  readonly viewerDid = signal<string | undefined>(undefined);
}

/** Plain text of a post's HTML, lower-cased, for word matching. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The first muted word a Bluesky post matches, or null.
 *
 * Follows bsky.app's rules: a tag target matches the hashtag; a content target
 * matches a whole word (or a phrase anywhere, when it has spaces), ignoring
 * case. Expired entries do not match, and "exclude people I follow" skips
 * authors the viewer follows. The viewer's own posts never match.
 */
export function matchMutedWord(
  status: Status,
  words: BskyMutedWord[],
  viewerDid: string | undefined,
  now = Date.now(),
): BskyMutedWord | null {
  if (status.provider !== 'bluesky' || !words.length) return null;
  if (viewerDid && status.account.id === `bsky:${viewerDid}`) return null;
  const followed = !!(status.providerRef as { authorFollowed?: boolean } | undefined)
    ?.authorFollowed;
  const text = plainText(status.content);
  for (const word of words) {
    if (word.expiresAt && Date.parse(word.expiresAt) <= now) continue;
    if (word.actorTarget === 'exclude-following' && followed) continue;
    const value = word.value.trim().replace(/^#/, '').toLowerCase();
    if (!value) continue;
    const tag = new RegExp(`(^|\\s)#${escapeRegExp(value)}(?=$|[\\s.,;:!?)])`, 'u');
    if (word.targets.includes('tag') && tag.test(text)) return word;
    if (word.targets.includes('content')) {
      const content = value.includes(' ')
        ? text.includes(value)
        : new RegExp(`(^|[^\\p{L}\\p{N}_])#?${escapeRegExp(value)}($|[^\\p{L}\\p{N}_])`, 'u').test(
            text,
          );
      if (content) return word;
    }
  }
  return null;
}
