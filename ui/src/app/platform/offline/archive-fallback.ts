import { Status } from '../api/models';
import { NativeProfilesApi } from '../session/native-profile-types';

/**
 * Native only (low-bandwidth Sprint 7): when a profile's posts are needed
 * offline and the read cache has no copy, answer from the local archive, which
 * keeps everything this device has seen from that person — every page, not
 * just the newest. Web builds have no archive and never get here.
 */

export interface ArchiveRequest {
  accountId: string;
  maxId: string | null;
  limit: number;
  excludeReplies: boolean;
  excludeReblogs: boolean;
  onlyMedia: boolean;
}

const ACCOUNT_STATUSES = /^\/api\/v1\/accounts\/(\d+)\/statuses$/;
/** The archive returns pages of this size, newest first. */
const ARCHIVE_PAGE = 40;
/** Archive pages read at most to fill one answer. */
const MAX_ARCHIVE_PAGES = 5;

/** The archive query for a profile-posts URL, or null when the archive can't answer it. */
export function archiveRequestFor(url: string): ArchiveRequest | null {
  const [path, query = ''] = url.split('?');
  const match = ACCOUNT_STATUSES.exec(path);
  if (!match) return null;
  const params = new URLSearchParams(query);
  // Pinned posts and newer-than pages need server knowledge the archive lacks.
  if (params.get('pinned') === 'true' || params.has('min_id') || params.has('since_id')) {
    return null;
  }
  const limit = Number(params.get('limit') ?? 20);
  return {
    accountId: match[1],
    maxId: params.get('max_id'),
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 40) : 20,
    excludeReplies: params.get('exclude_replies') === 'true',
    excludeReblogs: params.get('exclude_reblogs') === 'true',
    onlyMedia: params.get('only_media') === 'true',
  };
}

/** Mastodon ids are numeric strings of varying length; compare them as numbers. */
export function olderThan(id: string, maxId: string): boolean {
  if (id.length !== maxId.length) return id.length < maxId.length;
  return id < maxId;
}

export function matches(status: Status, request: ArchiveRequest): boolean {
  if (request.maxId && !olderThan(status.id, request.maxId)) return false;
  if (request.excludeReplies && status.in_reply_to_id) return false;
  if (request.excludeReblogs && status.reblog) return false;
  if (request.onlyMedia && !(status.reblog ?? status).media_attachments?.length) return false;
  return true;
}

/** Up to `limit` archived posts answering the request, newest first. */
export async function readArchive(
  profiles: NativeProfilesApi,
  handle: string,
  request: ArchiveRequest,
): Promise<Status[]> {
  const found: Status[] = [];
  for (let page = 0; page < MAX_ARCHIVE_PAGES && found.length < request.limit; page++) {
    const posts = await profiles.accountPosts(handle, request.accountId, page * ARCHIVE_PAGE);
    for (const post of posts) {
      if (found.length >= request.limit) break;
      if (matches(post.status, request)) found.push(post.status);
    }
    if (posts.length < ARCHIVE_PAGE) break;
  }
  return found;
}
