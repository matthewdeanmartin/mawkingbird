import { computed, Injectable, signal } from '@angular/core';
import type { Status } from '../../platform/api/models';
import type { BskyRef } from './bluesky-types';
import {
  BskyLabelDecision,
  BskyLabelDefinition,
  BskyLabelInputs,
  BskyLabelVisibility,
  decideLabels,
} from './bluesky-labels';
import {
  BskyHomeFeedPrefs,
  BskyThreadSort,
  DEFAULT_HOME_FEED_PREFS,
} from './bluesky-reading-prefs';
import type { BskyPostControlsValue } from './bluesky-post-controls';

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
  /** `adultContentPref.enabled`: off until the account says otherwise, as bsky.app. */
  readonly adultContent = signal(false);
  /** `contentLabelPref` entries, keyed by `labelPrefKey`. */
  readonly labelPrefs = signal<ReadonlyMap<string, BskyLabelVisibility>>(new Map());
  /** Subscribed labelers' own label definitions, keyed by `labelDefKey`. */
  readonly labelDefs = signal<ReadonlyMap<string, BskyLabelDefinition>>(new Map());
  /** The reading preferences below came from the account, not defaults. */
  readonly readingPrefsLoaded = signal(false);
  /** The Following feed's preferences (`feedViewPref` for `home`). */
  readonly homeFeedPrefs = signal<BskyHomeFeedPrefs>(DEFAULT_HOME_FEED_PREFS);
  /** How thread replies are ordered (`threadViewPref.sort`). */
  readonly threadSort = signal<BskyThreadSort>('hotness');
  /** Reply and quote controls a new post starts with (`postInteractionSettingsPref`). */
  readonly postDefaults = signal<BskyPostControlsValue>({ replies: 'everyone', quotes: true });

  private readonly labelInputs = computed<BskyLabelInputs>(() => ({
    adultContent: this.adultContent(),
    prefs: this.labelPrefs(),
    defs: this.labelDefs(),
    labelers: this.labelers(),
  }));

  /**
   * What the reader's label settings make of a Bluesky post: its own labels
   * and its author's account labels together. Null for other networks. The
   * reader's own posts are never hidden or collapsed, as on bsky.app.
   */
  labelDecision(status: Status): BskyLabelDecision | null {
    if (status.provider !== 'bluesky') return null;
    const ref = status.providerRef as BskyRef | null | undefined;
    const authorDid = status.account.id.replace(/^bsky:/, '');
    const inputs = this.labelInputs();
    if (!ref?.labels?.length && !ref?.authorLabels?.length) return null;
    // A label on the profile *record* covers only the avatar and banner; one on
    // the account (its uri is the DID) covers everything the account posts.
    const account = (ref.authorLabels ?? []).filter((l) => !l.uri || l.uri.startsWith('did:'));
    const decision = decideLabels([...(ref.labels ?? []), ...account], authorDid, inputs);
    if (authorDid === this.viewerDid()) return { ...decision, hide: false, warn: [] };
    return decision;
  }
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
