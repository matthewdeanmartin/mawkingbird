import { normalizeHashtag } from '../../hashtag';
import { Status } from '../../models';
import { attachmentSource, statusVideo, watchParams } from '../../video-player/media-source';

/** Watch takes at most eight party tags (party-conversation.ts). */
export const PARTY_TAG_LIMIT = 8;

/** `"#Debate, debate  #Anime2000"` → `['Debate', 'Anime2000']`: valid, unique, capped. */
export function partyTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const word of raw.split(/[\s,]+/)) {
    const tag = normalizeHashtag(word);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags.slice(0, PARTY_TAG_LIMIT);
}

/**
 * The Watch link that opens `status` as a party on `tags`.
 *
 * A Mastodon "watch party" is only a convention: a video, and a hashtag people
 * post under while watching. So opening one is the ordinary Watch page for the
 * post's video, with the tags joined for the visit. Null when Watch cannot play
 * the post — a link to a host it does not embed, say — even though the finder
 * still counted it as video.
 */
export function partyWatchParams(
  status: Status,
  server: string,
  tags: readonly string[],
): Record<string, string> | null {
  const post = status.reblog ?? status;
  const media = post.media_attachments.find((item) => attachmentSource(item));
  const source = media ? attachmentSource(media) : statusVideo(post);
  if (!source) return null;
  return { ...watchParams(post, source, server, media?.id), tags: tags.join(',') };
}
