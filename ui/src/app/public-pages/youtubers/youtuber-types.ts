/**
 * YouTubers on Mastodon: reviewed creator kits by language and category, built
 * in `mawkingbird_starters` (spec/youtubers/ there) and bundled here by
 * `npm run youtubers:update`. One data file per language feeds both the public,
 * prerendered kit pages and the in-app kits page (spec/youtube-client.md, S5–S6).
 */
export interface YoutuberVideo {
  id: string;
  title: string;
}

export interface YoutuberMember {
  acct: string;
  url: string | null;
  displayName: string;
  avatar: string | null;
  /** A labelled account that reposts the channel's videos (a place to comment). */
  bot: boolean;
  languages: string[];
  lastPost: string | null;
  /** Plain text, at most 200 characters. */
  bio: string;
  /** The channel's newest videos, at most three. */
  videos: YoutuberVideo[];
  channel: { id: string; title: string; lastUpload: string | null };
}

export interface YoutuberPack {
  category: string;
  /** The category's name by language (`en` always present). */
  title: Record<string, string>;
  icon: string | null;
  members: YoutuberMember[];
  /** The kit's ASCII path segment in its language (`technik`). */
  slug: string;
  /** The public page's path (`de/youtuber-auf-mastodon/technik`). */
  path: string;
}

export interface YoutuberLanguageFile {
  version: 1;
  lang: string;
  generatedAt: string;
  packs: YoutuberPack[];
}

export interface YoutuberPaths {
  generatedAt: string;
  /** Kits per language. */
  languages: Record<string, number>;
  /** Public page path by category, then language. */
  kits: Record<string, Record<string, string>>;
}
