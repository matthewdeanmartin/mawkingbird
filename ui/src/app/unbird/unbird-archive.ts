import {
  extractTwitterArchive,
  TwitterArchivePerson,
  TwitterArchiveSource,
} from '../settings/import-export/twitter-archive';
import { listZipEntries, readZipText, ZipEntry } from './archive-zip';

/**
 * A Twitter archive as Unbird keeps it: the parts worth carrying to Mastodon,
 * read on the device and nothing else.
 *
 * ## What is opened
 *
 * Only {@link READ_FILES}. A Twitter archive also holds the account's email and
 * phone number, direct messages, IP logs, device tokens and the owner's address
 * book. Those are never decompressed. The address book is opened only when the
 * reader asks to export it ({@link CONTACTS_FILE}); see `contacts-export.ts`.
 * The page says this in one line, with the list behind a "which?" link.
 */

/** The data files Unbird reads, by base name. Split parts (`tweets-part1.js`) count as their base. */
export const READ_FILES = [
  'manifest.js',
  'profile.js',
  'following.js',
  'follower.js',
  'tweets.js',
  'like.js',
  'saved-search.js',
] as const;

/** Opened only by an explicit contacts export, never by reading the archive. */
export const CONTACTS_FILE = 'contact.js';

export interface UnbirdTweet {
  id: string;
  /** ISO time. */
  at: string;
  /** Text with entities decoded and t.co links expanded; attached-media links removed. */
  text: string;
  /** The tweet this replies to, if any. */
  replyTo?: string;
  /** Replies to one of the owner's own tweets: part of a thread. */
  selfReply?: boolean;
  /** Replies to someone else. */
  replyToOther?: boolean;
  retweet?: boolean;
  likes: number;
  retweets: number;
  /** Attached photos and videos. */
  media: number;
  lang?: string;
}

export interface UnbirdLike {
  id: string;
  text: string;
  url: string;
}

export interface UnbirdPerson extends TwitterArchivePerson {
  /** Follows the owner back. */
  mutual: boolean;
  /** How close the owner was to them: follows, mutuality and conversation. */
  closeness: number;
}

export interface UnbirdArchive {
  version: 1;
  /** Set when stored: whose archive and when Twitter made it (`unbird-store.ts`). */
  id?: string;
  readAt: number;
  owner: { accountId: string | null; userName: string | null; displayName: string | null };
  /** When Twitter generated the archive, if it said. */
  generatedAt: string | null;
  profile: {
    bio: string;
    website: string;
    location: string;
    /** Twitter's URLs; their file names find the images in `profile_media/`. */
    avatarUrl?: string;
    headerUrl?: string;
  } | null;
  /** Record counts per data type, from the manifest when present. */
  counts: Record<string, number>;
  /** How many data files the archive has, and which ones were opened. */
  files: { total: number; opened: string[] };
  /** Holds `contact.js`, so a contacts export is possible from the original file. */
  hasContacts: boolean;
  followingCount: number;
  followerCount: number;
  people: UnbirdPerson[];
  tweets: UnbirdTweet[];
  likes: UnbirdLike[];
  savedSearches: string[];
}

export class ArchiveReadError extends Error {
  override readonly name = 'ArchiveReadError';
}

/** `data/tweets-part2.js` → `tweets.js`. */
export function archiveBaseName(path: string): string {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  return name.replace(/-part\d+(?=\.js$)/, '');
}

/** A data file the archive reader may open. */
export function isReadFile(path: string): boolean {
  return (READ_FILES as readonly string[]).includes(archiveBaseName(path));
}

/** A Twitter data file (`data/*.js`), media excluded: the denominator of "opens 7 of 75". */
export function isDataFile(path: string): boolean {
  const parts = path.replace(/\\/g, '/').split('/');
  const name = parts.pop() ?? '';
  return name.toLowerCase().endsWith('.js') && parts.pop()?.toLowerCase() === 'data';
}

/** Strip the `window.YTD.x.part0 = ` assignment and parse the JSON after it. */
export function parseArchiveScript(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start < 0) throw new ArchiveReadError('An archive file is empty or damaged.');
  return JSON.parse(text.slice(start));
}

/** The files a reader picked: zips, a folder, or loose data files. */
export interface PickedFile {
  /** Relative path when picked as a folder, else the file name. */
  path: string;
  blob: Blob;
}

type Progress = (step: 'opening' | 'reading' | 'sorting') => void;

/**
 * Read the allowlisted files from whatever the reader picked.
 *
 * Accepts one or more `.zip` files (Twitter splits big archives), an unzipped
 * folder, or individual data files. Throws {@link ArchiveReadError} when none
 * of the files is a Twitter archive.
 */
export async function readTwitterArchive(
  picked: readonly PickedFile[],
  progress: Progress = () => undefined,
  now = Date.now(),
): Promise<UnbirdArchive> {
  progress('opening');
  const sources: TwitterArchiveSource[] = [];
  const dataFiles = new Set<string>();
  let hasContacts = false;

  const zips = picked.filter((file) => file.path.toLowerCase().endsWith('.zip'));
  const loose = picked.filter((file) => !file.path.toLowerCase().endsWith('.zip'));

  const zipped: { blob: Blob; entry: ZipEntry }[] = [];
  for (const zip of zips) {
    for (const entry of await listZipEntries(zip.blob)) {
      if (!isDataFile(entry.name)) continue;
      dataFiles.add(archiveBaseName(entry.name));
      if (archiveBaseName(entry.name) === CONTACTS_FILE) hasContacts = true;
      if (isReadFile(entry.name)) zipped.push({ blob: zip.blob, entry });
    }
  }
  for (const file of loose) {
    if (!file.path.toLowerCase().endsWith('.js')) continue;
    dataFiles.add(archiveBaseName(file.path));
    if (archiveBaseName(file.path) === CONTACTS_FILE) hasContacts = true;
  }

  progress('reading');
  for (const { blob, entry } of zipped) {
    sources.push({ name: entry.name, text: await readZipText(blob, entry) });
  }
  for (const file of loose) {
    if (isReadFile(file.path)) sources.push({ name: file.path, text: await file.blob.text() });
  }
  if (!sources.length) {
    throw new ArchiveReadError('No Twitter archive data was found in what you chose.');
  }

  progress('sorting');
  const archive = buildArchive(sources, now);
  archive.files.total = Math.max(dataFiles.size, archive.files.opened.length);
  archive.hasContacts = hasContacts;
  return archive;
}

/** Turn the read files into an archive. Pure, for tests. */
export function buildArchive(
  sources: readonly TwitterArchiveSource[],
  now = Date.now(),
): UnbirdArchive {
  const byBase = new Map<string, TwitterArchiveSource[]>();
  for (const source of sources) {
    const base = archiveBaseName(source.name);
    if (!isReadFile(source.name)) continue;
    byBase.set(base, [...(byBase.get(base) ?? []), source]);
  }
  const parsed = (base: string): unknown[] =>
    (byBase.get(base) ?? []).flatMap((source) => {
      const value = parseArchiveScript(source.text);
      return Array.isArray(value) ? value : [value];
    });

  const archive: UnbirdArchive = {
    version: 1,
    readAt: now,
    owner: { accountId: null, userName: null, displayName: null },
    generatedAt: null,
    profile: null,
    counts: {},
    files: { total: 0, opened: [...byBase.keys()].sort() },
    hasContacts: false,
    followingCount: 0,
    followerCount: 0,
    people: [],
    tweets: [],
    likes: [],
    savedSearches: [],
  };

  const manifest = parsed('manifest.js')[0] as ManifestShape | undefined;
  if (manifest) {
    archive.owner = {
      accountId: text(manifest.userInfo?.accountId),
      userName: text(manifest.userInfo?.userName),
      displayName: text(manifest.userInfo?.displayName),
    };
    archive.generatedAt = text(manifest.archiveInfo?.generationDate);
    for (const [type, info] of Object.entries(manifest.dataTypes ?? {})) {
      const count = (info?.files ?? []).reduce((sum, file) => sum + (Number(file?.count) || 0), 0);
      if (count) archive.counts[type] = count;
    }
  }

  const profile = (parsed('profile.js')[0] as ProfileShape | undefined)?.profile;
  if (profile) {
    archive.profile = {
      bio: text(profile.description?.bio) ?? '',
      website: text(profile.description?.website) ?? '',
      location: text(profile.description?.location) ?? '',
      avatarUrl: text(profile.avatarMediaUrl) ?? undefined,
      headerUrl: text(profile.headerMediaUrl) ?? undefined,
    };
  }

  const following = parsed('following.js') as { following?: { accountId?: unknown } }[];
  const followers = new Set(
    (parsed('follower.js') as { follower?: { accountId?: unknown } }[])
      .map((row) => text(row.follower?.accountId))
      .filter((id): id is string => !!id),
  );
  archive.followingCount = following.length;
  archive.followerCount = followers.size;

  const rawTweets = parsed('tweets.js') as RawTweetRow[];
  archive.tweets = compactTweets(rawTweets);

  archive.likes = (parsed('like.js') as { like?: Record<string, unknown> }[])
    .map((row) => ({
      id: text(row.like?.['tweetId']) ?? '',
      text: decodeEntities(text(row.like?.['fullText']) ?? ''),
      url: text(row.like?.['expandedUrl']) ?? '',
    }))
    .filter((like) => like.id);

  archive.savedSearches = (parsed('saved-search.js') as { savedSearch?: { query?: unknown } }[])
    .map((row) => text(row.savedSearch?.query))
    .filter((query): query is string => !!query);

  // People reuse the classic importer's extractor, which recovers handles for
  // followed IDs from the owner's own mentions. It reads `following.js` and
  // `tweets.js` by name, so split parts are passed under their base name.
  const peopleSources = [
    ...(byBase.get('following.js') ?? []),
    ...(byBase.get('tweets.js') ?? []),
  ].map((source) => ({ name: archiveBaseName(source.name), text: source.text }));
  if (peopleSources.length) {
    archive.people = extractTwitterArchive(peopleSources).people.map((person) => ({
      ...person,
      mutual: !!person.twitter_account_id && followers.has(person.twitter_account_id),
      closeness: 0,
    }));
    archive.people = rankPeople(archive);
  }
  return archive;
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * How close the owner was to someone, for "friends first".
 *
 * - Mutual follows weigh most: both chose each other.
 * - Following adds a floor; following alone is cheap on Twitter.
 * - Conversation counts with diminishing returns (log), so one long argument
 *   does not outrank years of regular talk, and replies count double mentions.
 * - Recency: talking in the archive's last year adds more than long ago.
 *
 * `reference` is when the archive ends (its generation date, else the newest
 * tweet). The archive has no likes by author, so likes cannot count.
 */
export function closeness(person: TwitterArchivePerson, mutual: boolean, reference = 0): number {
  let score =
    (mutual ? 6 : 0) +
    (person.currently_following ? 3 : 0) +
    3 * Math.log2(1 + person.reply_count) +
    1.5 * Math.log2(1 + person.mention_count);
  const last = Date.parse(person.last_interaction_at ?? '');
  if (reference && Number.isFinite(last)) {
    const years = (reference - last) / YEAR_MS;
    score += years <= 1 ? 3 : years <= 3 ? 1.5 : 0;
  }
  return Math.round(score * 100) / 100;
}

/** Is this the archive's owner, who must never be offered as their own friend? */
export function isOwner(archive: UnbirdArchive, person: TwitterArchivePerson): boolean {
  const { accountId, userName } = archive.owner;
  if (accountId && person.twitter_account_id === accountId) return true;
  const handle = userName?.toLowerCase();
  return (
    !!handle &&
    (person.twitter_handle?.toLowerCase() === handle ||
      person.previous_handles.some((previous) => previous.toLowerCase() === handle))
  );
}

/**
 * The archive's people without the owner, scored and closest first. Applied
 * on read too, so archives saved before a scoring change are re-ranked.
 */
export function rankPeople(archive: UnbirdArchive): UnbirdPerson[] {
  const reference =
    Date.parse(archive.generatedAt ?? '') ||
    Date.parse(archive.tweets.find((tweet) => tweet.at)?.at ?? '') ||
    0;
  return archive.people
    .filter((person) => !isOwner(archive, person))
    .map((person) => ({ ...person, closeness: closeness(person, person.mutual, reference) }))
    .sort(
      (left, right) =>
        right.closeness - left.closeness ||
        (left.twitter_handle ?? '').localeCompare(right.twitter_handle ?? ''),
    );
}

interface ManifestShape {
  userInfo?: { accountId?: unknown; userName?: unknown; displayName?: unknown };
  archiveInfo?: { generationDate?: unknown };
  dataTypes?: Record<string, { files?: { count?: unknown }[] } | undefined>;
}

interface ProfileShape {
  profile?: {
    description?: { bio?: unknown; website?: unknown; location?: unknown };
    avatarMediaUrl?: unknown;
    headerMediaUrl?: unknown;
  };
}

interface RawTweetRow {
  tweet?: {
    id_str?: unknown;
    created_at?: unknown;
    full_text?: unknown;
    in_reply_to_status_id_str?: unknown;
    favorite_count?: unknown;
    retweet_count?: unknown;
    lang?: unknown;
    entities?: { urls?: { url?: unknown; expanded_url?: unknown }[] };
    extended_entities?: { media?: { url?: unknown }[] };
  };
}

function compactTweets(rows: readonly RawTweetRow[]): UnbirdTweet[] {
  const ids = new Set(rows.map((row) => text(row.tweet?.id_str)).filter(Boolean));
  const tweets: UnbirdTweet[] = [];
  for (const row of rows) {
    const tweet = row.tweet;
    const id = text(tweet?.id_str);
    if (!tweet || !id) continue;
    const at = Date.parse(text(tweet.created_at) ?? '');
    let body = decodeEntities(text(tweet.full_text) ?? '');
    for (const link of tweet.entities?.urls ?? []) {
      const short = text(link.url);
      const long = text(link.expanded_url);
      if (short && long) body = body.split(short).join(long);
    }
    const media = tweet.extended_entities?.media ?? [];
    for (const item of media) {
      const short = text(item.url);
      if (short) body = body.split(short).join('');
    }
    const replyTo = text(tweet.in_reply_to_status_id_str) ?? undefined;
    const compact: UnbirdTweet = {
      id,
      at: Number.isFinite(at) ? new Date(at).toISOString() : '',
      text: body.trim(),
      likes: Number(tweet.favorite_count) || 0,
      retweets: Number(tweet.retweet_count) || 0,
      media: media.length,
    };
    if (replyTo) {
      compact.replyTo = replyTo;
      if (ids.has(replyTo)) compact.selfReply = true;
      else compact.replyToOther = true;
    }
    if (/^RT @\w+:/.test(body)) compact.retweet = true;
    const lang = text(tweet.lang);
    if (lang && lang !== 'und') compact.lang = lang;
    tweets.push(compact);
  }
  return tweets.sort((left, right) => right.at.localeCompare(left.at));
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (typeof value === 'number') return String(value);
  return null;
}

/** Twitter escapes `&`, `<` and `>` in tweet text. */
export function decodeEntities(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
