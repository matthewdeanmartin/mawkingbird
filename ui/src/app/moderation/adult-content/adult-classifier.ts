import { stripHtml } from '../../../lib/sentiment';
import { Account, Status } from '../../platform/api/models';
import adultServers from './adult-servers.json';
import {
  classifyContentWarning,
  postTextMarker,
  selfDeclaredMarker,
  SEXUAL_BSKY_LABELS,
  SEXUAL_HASHTAGS,
} from './adult-lexicon';

/**
 * Is this post, or this person, about sexual content? (spec/moderation-facets.md §2)
 *
 * Mastodon labels posts, never people, and its "sensitive" flag covers food,
 * politics and spoilers as readily as nudity. So adult is *inferred*, and
 * every verdict carries the evidence that produced it: the search page shows
 * that evidence behind an (i) instead of asking anyone to trust a score.
 *
 * Pure: no Angular, no network. Web feeds it the one or two pages a search
 * loaded; Native feeds it the local archive. Same rules, more evidence.
 */

export type AdultReasonKind =
  /** The account's name, bio or profile fields say so ("18+", "MDNI", "open BO"). */
  | 'declared'
  /** A Bluesky self-label (porn / sexual / nudity) from the author. */
  | 'bsky-self-label'
  /** The same labels, applied by a Bluesky moderation service. */
  | 'bsky-labeler'
  /** A content warning that names sexual content. */
  | 'cw'
  /** A hashtag such as #nsfw or #onlyfans. */
  | 'hashtag'
  /** Sex-work advertising or an adult-platform link in the post text. */
  | 'text'
  /** The author's home server describes itself as for adult content. */
  | 'server'
  /** Enough of the author's loaded posts are adult (account verdicts only). */
  | 'posts'
  /** Marked sensitive with no CW saying why. Weak evidence only, never decisive. */
  | 'sensitive';

export interface AdultReason {
  kind: AdultReasonKind;
  /** What matched: the marker, the CW text, the label, the host. */
  evidence: string;
  /** For `posts`: how many loaded posts were adult, out of how many. */
  count?: number;
  of?: number;
}

export interface AdultVerdict {
  adult: boolean;
  /** Evidence that decided the verdict. Empty when not adult. */
  reasons: AdultReason[];
  /**
   * Evidence too thin to decide alone: one adult post among a person's loaded
   * posts, or sensitive media with no CW that says why. Shown, never decisive.
   */
  weak: AdultReason[];
}

const NOT_ADULT: AdultVerdict = { adult: false, reasons: [], weak: [] };

interface BskyLabelLike {
  val: string;
  src?: string;
  neg?: boolean;
}

interface BskyRefLike {
  labels?: BskyLabelLike[];
  authorLabels?: BskyLabelLike[];
}

function bskyRef(status: Status): BskyRefLike | null {
  return status.provider === 'bluesky' && status.providerRef
    ? (status.providerRef as BskyRefLike)
    : null;
}

function accountDid(account: Account): string {
  return account.id.replace(/^bsky:/, '');
}

function labelReasons(labels: readonly BskyLabelLike[] | undefined, did: string): AdultReason[] {
  const out: AdultReason[] = [];
  for (const label of labels ?? []) {
    if (label.neg || !SEXUAL_BSKY_LABELS.has(label.val)) continue;
    const self = !label.src || label.src === did;
    out.push({ kind: self ? 'bsky-self-label' : 'bsky-labeler', evidence: label.val });
  }
  return out;
}

/** Hosts from the hand-reviewed adult-server list. */
const ADULT_SERVERS: ReadonlySet<string> = new Set(
  ((adultServers as { servers: { host: string }[] }).servers ?? []).map((s) =>
    s.host.toLowerCase(),
  ),
);

/** The account's home server: the part after the second @, or empty for local. */
export function accountHost(account: Account): string {
  const at = account.acct.indexOf('@', 1);
  return at > 0 ? account.acct.slice(at + 1).toLowerCase() : '';
}

export function isAdultServer(host: string, list: ReadonlySet<string> = ADULT_SERVERS): boolean {
  return !!host && list.has(host.toLowerCase());
}

/** One post. The post's own evidence only; who wrote it is {@link classifyAccount}. */
export function classifyStatus(input: Status): AdultVerdict {
  const status = input.reblog ?? input;
  const reasons: AdultReason[] = [];
  const ref = bskyRef(status);
  if (ref) reasons.push(...labelReasons(ref.labels, accountDid(status.account)));

  const cw = classifyContentWarning(status.spoiler_text ?? '');
  if (cw.kind === 'sexual') reasons.push({ kind: 'cw', evidence: status.spoiler_text.trim() });

  const tag = (status.tags ?? []).find((t) => SEXUAL_HASHTAGS.has(t.name.toLowerCase()));
  if (tag) reasons.push({ kind: 'hashtag', evidence: `#${tag.name}` });

  const marker = postTextMarker(stripHtml(status.content ?? ''));
  if (marker) reasons.push({ kind: 'text', evidence: marker });

  if (reasons.length) return { adult: true, reasons, weak: [] };
  // Sensitive with no CW at all: we cannot tell nudity from a spoiler.
  const unexplained = status.sensitive && cw.kind === 'none';
  return unexplained
    ? { adult: false, reasons: [], weak: [{ kind: 'sensitive', evidence: '' }] }
    : NOT_ADULT;
}

/** Profile text a person wrote about themselves: name, bio, field names and values. */
function profileText(account: Account): string {
  return [
    account.display_name ?? '',
    stripHtml(account.note ?? ''),
    ...(account.fields ?? []).flatMap((f) => [f.name ?? '', stripHtml(f.value ?? '')]),
  ].join(' \n ');
}

/** At least this many adult posts... */
export const MIN_ADULT_POSTS = 2;
/** ...making up at least this share of the posts loaded for the person. */
export const MIN_ADULT_SHARE = 1 / 3;

/**
 * A person, from their profile and whichever of their posts are loaded.
 *
 * Adult when they say so, when Bluesky labels them, when their server is on
 * the reviewed list, or when at least {@link MIN_ADULT_POSTS} of their loaded
 * posts, and at least a third of them, are adult. A single adult post is
 * recorded as weak evidence: one post can be wrong, and one CW'd selfie does
 * not make someone a porn account.
 */
export function classifyAccount(
  account: Account,
  posts: readonly Status[] = [],
  adultServerList?: ReadonlySet<string>,
): AdultVerdict {
  const reasons: AdultReason[] = [];
  const declared = selfDeclaredMarker(profileText(account));
  if (declared) reasons.push({ kind: 'declared', evidence: declared });

  const did = accountDid(account);
  const seenLabels = new Set<string>();
  for (const post of posts) {
    const ref = bskyRef(post.reblog ?? post);
    if (!ref || (post.reblog ?? post).account.id !== account.id) continue;
    for (const reason of labelReasons(ref.authorLabels, did)) {
      const key = `${reason.kind}:${reason.evidence}`;
      if (!seenLabels.has(key)) {
        seenLabels.add(key);
        reasons.push(reason);
      }
    }
  }

  const host = accountHost(account);
  if (isAdultServer(host, adultServerList)) reasons.push({ kind: 'server', evidence: host });

  const own = posts.filter((p) => (p.reblog ?? p).account.id === account.id);
  const adultPosts = own.filter((p) => classifyStatus(p).adult).length;
  const weak: AdultReason[] = [];
  if (adultPosts > 0) {
    const share: AdultReason = { kind: 'posts', evidence: '', count: adultPosts, of: own.length };
    if (adultPosts >= MIN_ADULT_POSTS && adultPosts / own.length >= MIN_ADULT_SHARE)
      reasons.push(share);
    else weak.push(share);
  }
  return { adult: reasons.length > 0, reasons, weak };
}

/**
 * A post in a result list: adult on its own evidence, or because its author
 * is. Author evidence uses every loaded post, so a sex-work account's
 * un-CW'd post is still caught while a one-off CW'd post does not taint the
 * rest of someone's timeline.
 */
export function classifyResult(
  status: Status,
  authorVerdict: AdultVerdict | undefined,
): AdultVerdict {
  const own = classifyStatus(status);
  if (own.adult || !authorVerdict?.adult) return own;
  return { adult: true, reasons: authorVerdict.reasons, weak: own.weak };
}

/** Verdicts for every author in a loaded page of posts, keyed by account id. */
export function classifyAuthors(statuses: readonly Status[]): Map<string, AdultVerdict> {
  const byAuthor = new Map<string, { account: Account; posts: Status[] }>();
  for (const s of statuses) {
    const post = s.reblog ?? s;
    const entry = byAuthor.get(post.account.id) ?? { account: post.account, posts: [] };
    entry.posts.push(post);
    byAuthor.set(post.account.id, entry);
  }
  const out = new Map<string, AdultVerdict>();
  for (const [id, { account, posts }] of byAuthor) out.set(id, classifyAccount(account, posts));
  return out;
}
