/**
 * The pure half of the bridge finder: turning two follow graphs into matches.
 *
 * Kept separate from `bridge-finder.ts` (which owns the API budget, the walk and
 * the signals) because every interesting decision here is a string-comparison
 * judgement call, and those want tests that never touch HTTP.
 *
 * ## The two passes, and why the first one is free
 *
 * Bluesky has no "search these 500 handles" endpoint, so the naive correlation
 * is one `searchActors` per person — 500 calls to answer one question. That is
 * the waste the sprint exists to avoid.
 *
 * The saving grace is that **follow-list responses already carry bios**.
 * `app.bsky.graph.getFollows` returns `profileView` including `description`
 * (verified live, 2026-08-13), and Mastodon's `/following` returns `note` plus
 * `fields`. People routinely write their other handle right there. Extracting it
 * costs nothing, and confirming it costs a single lookup rather than a search —
 * so the highest-confidence matches arrive before the user spends anything.
 *
 * Pass 2 searches only whoever pass 1 missed, under an explicit budget.
 */

import { Account } from '../../../models';

/** Which network a handle belongs to. The engine is symmetric over this. */
export type BridgeNetwork = 'mastodon' | 'bluesky';

/**
 * How sure we are, as a *kind* rather than a score.
 *
 * The distinction the roadmap asked for: `exact` is not "a high score", it is a
 * categorically different thing — the person published the link themselves, so
 * there is nothing to guess. `strong` and `weak` are inference, and only they
 * are ever wrong.
 */
export type BridgeConfidence = 'exact' | 'strong' | 'weak';

/** A handle found written inside someone's bio on the *other* network. */
export interface BridgeHandleClue {
  /** Normalised handle: `user@host` for Mastodon, `name.bsky.social` for Bluesky. */
  handle: string;
  /** Human-readable reason, shown on the row. */
  evidence: string;
}

/** One candidate account on the target network, with the reasons it matched. */
export interface BridgeMatch {
  account: Account;
  signals: string[];
  confidence: BridgeConfidence;
}

/**
 * A Bluesky handle written in text.
 *
 * Deliberately narrow. A bare `.com` domain in a bio is far more often the
 * person's website than their Bluesky handle, so only two forms are accepted:
 * an explicit `bsky.app/profile/...` URL, or a handle carrying a known Bluesky
 * suffix (`*.bsky.social`). Custom-domain handles (`hboon.com`) are real and
 * common, but they are indistinguishable from a website link in free text and
 * guessing produces a lookup per website in every bio — precisely the API waste
 * this pass exists to avoid. Those people are found by pass 2 instead.
 */
export function blueskyHandleInText(text: string): BridgeHandleClue | null {
  const plain = plainText(text);

  const url = plain.match(/bsky\.app\/profile\/([a-z0-9][a-z0-9.-]*[a-z0-9])/i);
  if (url) {
    return { handle: url[1].toLowerCase(), evidence: 'Bluesky profile linked in bio' };
  }

  const suffixed = plain.match(/(?:^|[\s(@])@?([a-z0-9][a-z0-9-]*\.bsky\.social)(?=$|[\s),;])/i);
  if (suffixed) {
    return { handle: suffixed[1].toLowerCase(), evidence: 'Bluesky handle written in bio' };
  }

  return null;
}

/**
 * A Mastodon handle written in text.
 *
 * The mirror of {@link blueskyHandleInText}, and able to be more permissive:
 * `@user@host` is unambiguous in a way that a bare domain is not. A
 * `https://host/@user` profile URL is accepted for the same reason.
 *
 * `*.bsky.social` is explicitly rejected — `@someone@bsky.social` parses as a
 * fediverse handle by shape, and treating it as one would send a Mastodon
 * lookup after a Bluesky account on every bridged bio.
 */
export function mastodonHandleInText(text: string): BridgeHandleClue | null {
  const plain = plainText(text);

  const url = plain.match(/https?:\/\/([\w.-]+)\/@([\w.-]+)/i);
  if (url && !isBlueskyHost(url[1])) {
    return {
      handle: `${url[2]}@${url[1]}`.toLowerCase(),
      evidence: 'Mastodon profile linked in bio',
    };
  }

  const handle = plain.match(/(?:^|[\s(])@([\w.-]+)@([\w-]+(?:\.[\w-]+)+)(?=$|[\s),;])/i);
  if (handle && !isBlueskyHost(handle[2])) {
    return {
      handle: `${handle[1]}@${handle[2]}`.toLowerCase(),
      evidence: 'Mastodon address written in bio',
    };
  }

  return null;
}

/** Find a handle for `target` written in `text`. */
export function handleInText(text: string, target: BridgeNetwork): BridgeHandleClue | null {
  return target === 'bluesky' ? blueskyHandleInText(text) : mastodonHandleInText(text);
}

/**
 * Everything on an account that a bio scan should read.
 *
 * `fields` matters as much as `note` on the Mastodon side: the link table is
 * where people put their other profiles, and a `verified_at` row is a rel=me
 * proof the server itself checked.
 */
export function searchableProfileText(account: Account): string {
  return [account.note, ...account.fields.map((field) => `${field.name} ${field.value}`)].join(' ');
}

/**
 * True when a *verified* profile field points at this handle.
 *
 * Mastodon verifies a field by fetching the linked page and looking for a rel=me
 * link back. That is a real proof of control, not a claim, so it is the one
 * signal that survives on its own.
 */
export function verifiedLinkTo(account: Account, handle: string): boolean {
  const needle = handle.toLowerCase();
  return account.fields.some(
    (field) => !!field.verified_at && plainText(field.value).toLowerCase().includes(needle),
  );
}

/**
 * Rank a candidate from the *paid* pass against the person being looked for.
 *
 * Pass 1 does not come through here — a self-published handle is `exact` by
 * construction and needs no scoring. This is inference over search results, so
 * everything it produces is `strong` or `weak`.
 *
 * The rule: a handle match is `strong` on its own, because handles are chosen
 * and rarely collide. A display-name match is `weak` on its own — the world has
 * many people called "Alex" — but corroborated by anything else it becomes
 * `strong`.
 */
export function rankBridgeCandidate(person: Account, candidate: Account): BridgeMatch {
  const signals: string[] = [];

  const personHandle = localHandle(person.acct);
  const candidateHandle = localHandle(candidate.acct);
  const personName = normalizeName(person.display_name || person.username);
  const candidateName = normalizeName(candidate.display_name || candidate.username);

  const handleMatch = !!personHandle && personHandle === candidateHandle;
  if (handleMatch) {
    signals.push('Handle is the same on both networks');
  }

  const nameMatch = !!personName && personName === candidateName;
  if (nameMatch) {
    signals.push('Display name is identical');
  }

  // A bio that names the other account is the strongest inferred signal there
  // is: it is the same evidence pass 1 reads, just found from the far side.
  const candidateText = searchableProfileText(candidate);
  if (personHandle && mentionsHandle(candidateText, personHandle)) {
    signals.push('Their bio mentions this handle');
  }

  const sharedLink = sharedExternalLink(person, candidate);
  if (sharedLink) {
    signals.push(`Both profiles link to ${sharedLink}`);
  }

  if (signals.length === 0) {
    return { account: candidate, signals, confidence: 'weak' };
  }

  const confidence: BridgeConfidence =
    handleMatch || signals.length >= 2 ? 'strong' : nameMatch ? 'weak' : 'strong';

  return { account: candidate, signals, confidence };
}

/**
 * Order matches best-first: kind, then corroboration, then handle for stability.
 *
 * The last tiebreak keeps the list from reshuffling between runs, which matters
 * when the user is working down it with checkboxes.
 */
export function compareMatches(left: BridgeMatch, right: BridgeMatch): number {
  return (
    confidenceRank(right.confidence) - confidenceRank(left.confidence) ||
    right.signals.length - left.signals.length ||
    left.account.acct.localeCompare(right.account.acct)
  );
}

function confidenceRank(confidence: BridgeConfidence): number {
  return confidence === 'exact' ? 2 : confidence === 'strong' ? 1 : 0;
}

/** A shared non-social link (a homepage on both profiles) is corroboration. */
function sharedExternalLink(person: Account, candidate: Account): string | null {
  const theirs = new Set(externalHosts(candidate));
  for (const host of externalHosts(person)) {
    if (theirs.has(host)) return host;
  }
  return null;
}

function externalHosts(account: Account): string[] {
  const hosts: string[] = [];
  const text = searchableProfileText(account);
  for (const match of text.matchAll(/https?:\/\/([\w.-]+)/gi)) {
    const host = match[1].toLowerCase().replace(/^www\./, '');
    // Social hosts are where everyone already is; they corroborate nothing.
    if (!isBlueskyHost(host) && !GENERIC_HOSTS.has(host)) hosts.push(host);
  }
  return hosts;
}

const GENERIC_HOSTS = new Set([
  'github.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'linkedin.com',
  'instagram.com',
  'mastodon.social',
  'linktr.ee',
]);

function isBlueskyHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === 'bsky.app' || lower === 'bsky.social' || lower.endsWith('.bsky.social');
}

/** `user@host` and `user` both reduce to `user`; handles are compared bare. */
function localHandle(acct: string): string {
  return acct.replace(/^@/, '').split('@')[0].split('.')[0].toLowerCase();
}

function mentionsHandle(text: string, handle: string): boolean {
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s(@/])@?${escaped}(?=$|[\\s),;@.])`, 'i').test(plainText(text));
}

/**
 * Names are compared with accents folded and punctuation dropped, so
 * "José Ruiz" matches "Jose Ruiz" and "Alex (they/them)" matches "Alex".
 */
function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Bios arrive as HTML on the Mastodon side and plain text on the Bluesky side.
 *
 * `href` values are pulled out before tags are stripped, because that is exactly
 * where the handle lives: Mastodon renders a bio link as
 * `<a href="https://bsky.app/profile/alex.bsky.social">alex</a>`, whose *text* is
 * usually a truncated label. Stripping tags first would throw away the only copy
 * of the URL and make the free pass miss every linked profile.
 */
function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>/gi, ' $1 ')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/\s+/g, ' ');
}
