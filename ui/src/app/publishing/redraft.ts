import { Status, StatusSource } from '../platform/api/models';
import { DraftMedia, DraftSnapshot, emptyDraftSnapshot } from './drafts';
import { focalPointOf } from './focal-point/focal-point';
import { POLL_EXPIRY } from './poll-editor';

/** Everything a deleted post held, ready to open in the composer. */
export interface RedraftSeed {
  snapshot: DraftSnapshot;
  media: DraftMedia[];
}

/**
 * Rebuild a deleted post for the composer. The server keeps the attachments of
 * a deleted post for a while, so they are reused by id and not uploaded again.
 */
export function redraftSeed(post: Status, source: StatusSource): RedraftSeed {
  return {
    snapshot: {
      ...emptyDraftSnapshot(post.visibility),
      segments: [source.text],
      spoilerText: source.spoiler_text,
      sensitive: post.sensitive,
      poll: post.poll
        ? {
            options: post.poll.options.map((option) => option.title),
            multiple: post.poll.multiple,
            expiresIn: pollLength(post.created_at, post.poll.expires_at),
          }
        : null,
      ...(post.language ? { postLanguage: post.language, postLanguageExplicit: true } : {}),
      target: 'fedi',
    },
    media: (post.media_attachments ?? []).map((media) => {
      const focus = focalPointOf(media);
      return { media, description: media.description ?? '', ...(focus ? { focus } : {}) };
    }),
  };
}

/** The offered poll length nearest to the one the post had. */
function pollLength(from: string, to: string | null): number {
  const seconds = to ? (Date.parse(to) - Date.parse(from)) / 1000 : NaN;
  if (!Number.isFinite(seconds)) return 86400;
  let best: number = POLL_EXPIRY[0].seconds;
  for (const option of POLL_EXPIRY) {
    if (Math.abs(option.seconds - seconds) < Math.abs(best - seconds)) best = option.seconds;
  }
  return best;
}
