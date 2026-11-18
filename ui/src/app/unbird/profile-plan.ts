import type { AccountField } from '../platform/api/models';
import { defuseMentions } from './replay-plan';
import type { UnbirdArchive } from './unbird-archive';

/**
 * What the Profile tab proposes from the archive: pure, so the merge rules can
 * be tested without a server.
 */

/** Mastodon's default number of profile fields; servers may allow more. */
export const DEFAULT_MAX_FIELDS = 4;

/** The Twitter bio, with mentions defused like every other replayed text. */
export function proposedBio(archive: UnbirdArchive): string {
  return defuseMentions(archive.profile?.bio ?? '').trim();
}

/**
 * The reader's fields plus a link to the old Twitter profile and their
 * website, without duplicates, within the server's limit. Existing fields
 * always win: Unbird adds, it never replaces what someone set up.
 */
export function mergedFields(
  existing: readonly AccountField[],
  archive: UnbirdArchive,
  max = DEFAULT_MAX_FIELDS,
): AccountField[] {
  const fields = existing.map(({ name, value }) => ({ name, value }));
  const has = (value: string) =>
    fields.some((field) => normalizeUrl(field.value) === normalizeUrl(value));
  const add = (name: string, value: string) => {
    if (!value || has(value) || fields.length >= max) return;
    fields.push({ name, value });
  };
  const user = archive.owner.userName;
  if (user) add('Twitter', `https://twitter.com/${user}`);
  add('Website', archive.profile?.website ?? '');
  return fields;
}

function normalizeUrl(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/+$/, '');
}

/** The pinned "I moved" post, in the reader's words to edit. */
export function movedPost(archive: UnbirdArchive): string {
  const user = archive.owner.userName;
  return user
    ? `Hello Mastodon! I've moved here from Twitter, where I was ${user}. Some of my old posts are coming along slowly. #TwitterMigration`
    : `Hello Mastodon! I've moved here from Twitter. Some of my old posts are coming along slowly. #TwitterMigration`;
}

/** A line to paste into the X bio, so old followers can find the new account. */
export function xBioLine(acct: string, url: string): string {
  return `Now on Mastodon: @${acct} ${url}`;
}

/** Saved searches that are hashtags, as tag names to follow. */
export function savedHashtags(archive: UnbirdArchive): string[] {
  return [
    ...new Set(
      archive.savedSearches
        .map((query) => query.trim())
        .filter((query) => /^#[\p{L}\p{N}_]+$/u.test(query))
        .map((query) => query.slice(1)),
    ),
  ];
}
