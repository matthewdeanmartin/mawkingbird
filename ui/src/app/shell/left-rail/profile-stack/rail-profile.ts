import { Account } from '../../../models';

/** One figure under a card's name, e.g. "Followers 1.2K". */
export interface RailProfileStat {
  label: string;
  value: number;
  /** In-app destination, when the figure has a page behind it. */
  link?: (string | number)[];
}

/**
 * One identity's card in the left-rail stack.
 *
 * Deliberately a plain view model rather than a per-network component: every
 * network the app grows describes itself in these terms, and the ones that
 * cannot fill a field (a Bluesky account has no "hashtags followed") simply
 * leave it out. Mastodon is the richest case, so it is the shape everything
 * else is a subset of — which is the same bargain the `Status` adapters make.
 */
export interface RailProfile {
  /** Stable across reloads: what the selected-card preference stores. */
  key: string;
  /** Emoji shown on the peeking tab, e.g. "🦋". */
  badge: string;
  /** Network name beside the badge, e.g. "Bluesky". */
  network: string;
  displayName: string;
  /** Rendered with a leading "@"; pass it without one. */
  handle: string;
  avatar?: string;
  header?: string;
  /** Server-rendered HTML bio (Mastodon `note`). */
  bioHtml?: string;
  /** Plain-text bio, for networks that don't send HTML. */
  bioText?: string;
  stats: RailProfileStat[];
  /** In-app profile page, when this build has one for the network. */
  link?: (string | number)[];
  /** External profile page, for networks with no in-app page yet. */
  href?: string;
  /** The Mastodon account behind the card, for the verified badge. */
  account?: Account;
  /** True for the identity the app is currently acting as. */
  active: boolean;
  /** Present when the card offers to make this identity the active one. */
  switchTo?: 'anonymous';
}
