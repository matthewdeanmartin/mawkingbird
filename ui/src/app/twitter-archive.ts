/** A text file selected from an unzipped Twitter archive. */
export interface TwitterArchiveSource {
  name: string;
  text: string;
}

/** One Twitter identity and the evidence connecting it to the archive owner. */
export interface TwitterArchivePerson {
  twitter_handle: string | null;
  twitter_name: string | null;
  twitter_account_id: string | null;
  previous_handles: string[];
  currently_following: boolean;
  reply_count: number;
  mention_count: number;
  first_interaction_at: string | null;
  last_interaction_at: string | null;
  twitter_profile_url: string;
}

/** Counts displayed before the extracted contact file is downloaded. */
export interface TwitterArchiveSummary {
  files: string[];
  people: TwitterArchivePerson[];
  currentFollowingCount: number;
  currentFollowingWithHandleCount: number;
  repliedPeopleCount: number;
  replyCount: number;
  mentionedPeopleCount: number;
  mentionCount: number;
}

interface MutablePerson extends TwitterArchivePerson {
  handles: Map<string, string | null>;
  currentHandleAt: string | null;
  currentNameAt: string | null;
}

interface ArchiveFollowing {
  following?: {
    accountId?: unknown;
  };
}

interface ArchiveMention {
  id_str?: unknown;
  id?: unknown;
  name?: unknown;
  screen_name?: unknown;
}

interface ArchiveTweet {
  tweet?: {
    created_at?: unknown;
    retweeted?: unknown;
    in_reply_to_user_id_str?: unknown;
    in_reply_to_user_id?: unknown;
    in_reply_to_screen_name?: unknown;
    entities?: {
      user_mentions?: unknown;
      hashtags?: unknown;
    };
  };
}

const SUPPORTED_FILES = new Set(['following.js', 'tweets.js', 'deleted-tweets.js']);

/**
 * Extract current follows and authored reply/mention history from an Twitter archive.
 *
 * Twitter's following.js contains only numeric account IDs. Tweet mention entities contain both
 * the numeric ID and contemporaneous handle, so joining them recovers handles for accounts that
 * also appeared in the owner's authored tweets.
 */
export function extractTwitterArchive(
  sources: readonly TwitterArchiveSource[],
): TwitterArchiveSummary {
  const selected = sources.filter((source) => SUPPORTED_FILES.has(baseName(source.name)));
  if (!selected.length) {
    throw new Error('No supported archive files were found.');
  }

  const people = new Map<string, MutablePerson>();
  const handleKeys = new Map<string, string>();

  const upsert = (
    accountId: string | null,
    handle: string | null,
    name: string | null,
    at: string | null,
  ): MutablePerson => {
    const normalizedHandle = normalizeTwitterHandle(handle);
    const handleKey = normalizedHandle?.toLowerCase() ?? null;
    const idKey = accountId ? `id:${accountId}` : null;
    const existingHandleKey = handleKey ? handleKeys.get(handleKey) : null;
    let key = idKey ?? existingHandleKey ?? `handle:${handleKey}`;
    let person = people.get(key);

    if (idKey && existingHandleKey && existingHandleKey !== idKey) {
      const handlePerson = people.get(existingHandleKey);
      if (handlePerson && !handlePerson.twitter_account_id) {
        if (person) {
          mergePeople(person, handlePerson);
          people.delete(existingHandleKey);
          for (const knownHandle of handlePerson.handles.keys()) {
            handleKeys.set(knownHandle, idKey);
          }
        } else {
          person = handlePerson;
          people.delete(existingHandleKey);
          key = idKey;
          person.twitter_account_id = accountId;
          people.set(key, person);
          for (const knownHandle of person.handles.keys()) {
            handleKeys.set(knownHandle, key);
          }
        }
      }
    }

    if (!person && idKey && existingHandleKey) {
      person = people.get(existingHandleKey);
      if (person && !person.twitter_account_id) {
        people.delete(existingHandleKey);
        key = idKey;
        person.twitter_account_id = accountId;
        people.set(key, person);
        for (const knownHandle of person.handles.keys()) {
          handleKeys.set(knownHandle, key);
        }
      }
    }

    if (!person) {
      person = {
        twitter_handle: null,
        twitter_name: null,
        twitter_account_id: accountId,
        previous_handles: [],
        currently_following: false,
        reply_count: 0,
        mention_count: 0,
        first_interaction_at: null,
        last_interaction_at: null,
        twitter_profile_url: twitterProfileUrl(accountId, normalizedHandle),
        handles: new Map<string, string | null>(),
        currentHandleAt: null,
        currentNameAt: null,
      };
      people.set(key, person);
    }

    if (normalizedHandle && handleKey) {
      const previousSeenAt = person.handles.get(handleKey);
      if (!person.handles.has(handleKey) || isLater(at, previousSeenAt)) {
        person.handles.set(handleKey, at);
      }
      handleKeys.set(handleKey, key);
      if (!person.twitter_handle || isLater(at, person.currentHandleAt)) {
        person.twitter_handle = normalizedHandle;
        person.currentHandleAt = at;
      }
    }
    if (name && (!person.twitter_name || isLater(at, person.currentNameAt))) {
      person.twitter_name = name;
      person.currentNameAt = at;
    }
    person.twitter_profile_url = twitterProfileUrl(
      person.twitter_account_id,
      person.twitter_handle,
    );
    return person;
  };

  for (const source of selected) {
    const filename = baseName(source.name);
    const rows = parseArchiveAssignment(source.text, filename);
    if (filename === 'following.js') {
      for (const row of rows as ArchiveFollowing[]) {
        const accountId = asString(row.following?.accountId);
        if (accountId) {
          upsert(accountId, null, null, null).currently_following = true;
        }
      }
      continue;
    }

    for (const row of rows as ArchiveTweet[]) {
      const tweet = row.tweet;
      if (!tweet || tweet.retweeted === true) {
        continue;
      }
      const at = normalizeDate(tweet.created_at);
      const replyAccountId = asString(tweet.in_reply_to_user_id_str ?? tweet.in_reply_to_user_id);
      const replyHandle = asString(tweet.in_reply_to_screen_name);
      if (replyAccountId || replyHandle) {
        const person = upsert(replyAccountId, replyHandle, null, at);
        person.reply_count += 1;
        recordInteraction(person, at);
      }

      const mentions = Array.isArray(tweet.entities?.user_mentions)
        ? (tweet.entities.user_mentions as ArchiveMention[])
        : [];
      for (const mention of mentions) {
        const accountId = asString(mention.id_str ?? mention.id);
        const handle = asString(mention.screen_name);
        const name = asString(mention.name);
        if (!accountId && !handle) {
          continue;
        }
        const person = upsert(accountId, handle, name, at);
        person.mention_count += 1;
        recordInteraction(person, at);
      }
    }
  }

  const results = [...people.values()].map(finalizePerson).sort(comparePeople);
  return {
    files: [...new Set(selected.map((source) => baseName(source.name)))].sort(),
    people: results,
    currentFollowingCount: results.filter((person) => person.currently_following).length,
    currentFollowingWithHandleCount: results.filter(
      (person) => person.currently_following && person.twitter_handle,
    ).length,
    repliedPeopleCount: results.filter((person) => person.reply_count > 0).length,
    replyCount: results.reduce((total, person) => total + person.reply_count, 0),
    mentionedPeopleCount: results.filter((person) => person.mention_count > 0).length,
    mentionCount: results.reduce((total, person) => total + person.mention_count, 0),
  };
}

/** Render the extracted identities as a portable, inspectable Mawkingbird input CSV. */
export function twitterArchiveCsv(people: readonly TwitterArchivePerson[]): string {
  const header = [
    'twitter_handle',
    'twitter_name',
    'twitter_account_id',
    'relationships',
    'reply_count',
    'mention_count',
    'first_interaction_at',
    'last_interaction_at',
    'previous_handles',
    'twitter_profile_url',
  ];
  const rows = people.map((person) => {
    const relationships = [
      person.currently_following ? 'following' : '',
      person.reply_count ? 'replied' : '',
      person.mention_count ? 'mentioned' : '',
    ].filter(Boolean);
    return [
      person.twitter_handle ?? '',
      person.twitter_name ?? '',
      person.twitter_account_id ?? '',
      relationships.join('|'),
      String(person.reply_count),
      String(person.mention_count),
      person.first_interaction_at ?? '',
      person.last_interaction_at ?? '',
      person.previous_handles.join('|'),
      person.twitter_profile_url,
    ]
      .map(csvCell)
      .join(',');
  });
  return [header.join(','), ...rows, ''].join('\n');
}

function parseArchiveAssignment(text: string, filename: string): unknown[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) {
    throw new Error(`${filename} is not a recognized Twitter archive file.`);
  }
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(value)) {
      throw new Error('Expected an array.');
    }
    return value;
  } catch {
    throw new Error(
      `${filename} could not be read. Make sure it came from the archive's data folder.`,
    );
  }
}

function normalizeTwitterHandle(value: string | null): string | null {
  const handle = value?.trim().replace(/^@/, '');
  return handle && /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function recordInteraction(person: MutablePerson, at: string | null): void {
  if (!at) {
    return;
  }
  if (!person.first_interaction_at || at < person.first_interaction_at) {
    person.first_interaction_at = at;
  }
  if (!person.last_interaction_at || at > person.last_interaction_at) {
    person.last_interaction_at = at;
  }
}

function mergePeople(target: MutablePerson, source: MutablePerson): void {
  target.currently_following ||= source.currently_following;
  target.reply_count += source.reply_count;
  target.mention_count += source.mention_count;
  if (
    source.first_interaction_at &&
    (!target.first_interaction_at || source.first_interaction_at < target.first_interaction_at)
  ) {
    target.first_interaction_at = source.first_interaction_at;
  }
  if (
    source.last_interaction_at &&
    (!target.last_interaction_at || source.last_interaction_at > target.last_interaction_at)
  ) {
    target.last_interaction_at = source.last_interaction_at;
  }
  for (const [handle, at] of source.handles) {
    const targetAt = target.handles.get(handle);
    if (!target.handles.has(handle) || isLater(at, targetAt)) {
      target.handles.set(handle, at);
    }
  }
  if (
    source.twitter_handle &&
    (!target.twitter_handle || isLater(source.currentHandleAt, target.currentHandleAt))
  ) {
    target.twitter_handle = source.twitter_handle;
    target.currentHandleAt = source.currentHandleAt;
  }
  if (
    source.twitter_name &&
    (!target.twitter_name || isLater(source.currentNameAt, target.currentNameAt))
  ) {
    target.twitter_name = source.twitter_name;
    target.currentNameAt = source.currentNameAt;
  }
}

function finalizePerson(person: MutablePerson): TwitterArchivePerson {
  const previousHandles = [...person.handles.entries()]
    .filter(([handle]) => handle !== person.twitter_handle?.toLowerCase())
    .sort((left, right) => (right[1] ?? '').localeCompare(left[1] ?? ''))
    .map(([handle]) => handle);
  return {
    twitter_handle: person.twitter_handle,
    twitter_name: person.twitter_name,
    twitter_account_id: person.twitter_account_id,
    previous_handles: previousHandles,
    currently_following: person.currently_following,
    reply_count: person.reply_count,
    mention_count: person.mention_count,
    first_interaction_at: person.first_interaction_at,
    last_interaction_at: person.last_interaction_at,
    twitter_profile_url: person.twitter_profile_url,
  };
}

function comparePeople(left: TwitterArchivePerson, right: TwitterArchivePerson): number {
  return (
    Number(right.currently_following) - Number(left.currently_following) ||
    right.reply_count - left.reply_count ||
    right.mention_count - left.mention_count ||
    (left.twitter_handle ?? '').localeCompare(right.twitter_handle ?? '') ||
    (left.twitter_account_id ?? '').localeCompare(right.twitter_account_id ?? '')
  );
}

function twitterProfileUrl(accountId: string | null, handle: string | null): string {
  if (accountId) {
    return `https://twitter.com/intent/user?user_id=${encodeURIComponent(accountId)}`;
  }
  return handle ? `https://twitter.com/${encodeURIComponent(handle)}` : '';
}

function baseName(path: string): string {
  return path.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ?? '';
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isLater(candidate: string | null, current: string | null | undefined): boolean {
  return candidate !== null && (current == null || candidate > current);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** One hashtag the archive owner used, and how often. */
export interface ArchiveHashtag {
  tag: string;
  count: number;
  lastUsedAt: string | null;
}

/**
 * Count the hashtags the archive owner wrote, most-used first.
 *
 * Separate from `extractTwitterArchive` because it answers a different question
 * — what this person posts *about*, rather than who they talked to — and needs
 * only tweets.js. Retweets are skipped for the same reason they are there: the
 * tags in them are somebody else's.
 *
 * The raw list is long and mostly noise (a tag used once, years ago, in a reply
 * to a conference), so callers rank and cut it rather than following all of it.
 */
export function extractArchiveHashtags(sources: readonly TwitterArchiveSource[]): ArchiveHashtag[] {
  const selected = sources.filter((source) =>
    ['tweets.js', 'deleted-tweets.js'].includes(baseName(source.name)),
  );
  if (!selected.length) {
    throw new Error('No tweets.js was found in the selected files.');
  }

  const counts = new Map<string, ArchiveHashtag>();
  for (const source of selected) {
    const filename = baseName(source.name);
    for (const row of parseArchiveAssignment(source.text, filename) as ArchiveTweet[]) {
      const tweet = row.tweet;
      if (!tweet || tweet.retweeted === true) {
        continue;
      }
      const at = normalizeDate(tweet.created_at);
      const hashtags = Array.isArray(tweet.entities?.hashtags)
        ? (tweet.entities.hashtags as { text?: unknown }[])
        : [];
      for (const hashtag of hashtags) {
        const text = asString(hashtag.text)?.replace(/^#/, '').toLowerCase();
        // Twitter's tag rules are looser than Mastodon's; anything Mastodon
        // cannot represent as a tag is dropped rather than mangled.
        if (!text || !/^[\p{L}\p{N}_]+$/u.test(text) || /^\p{N}+$/u.test(text)) {
          continue;
        }
        const existing = counts.get(text);
        if (existing) {
          existing.count += 1;
          if (isLater(at, existing.lastUsedAt)) {
            existing.lastUsedAt = at;
          }
        } else {
          counts.set(text, { tag: text, count: 1, lastUsedAt: at });
        }
      }
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
