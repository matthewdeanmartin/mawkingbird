import { Status } from '../../platform/api/models';
import { attachmentSource, statusVideo, watchParams } from '../video-player/media-source';
import { queueEntry } from './watch-queue';

/**
 * What post history keeps about a post's video, so the queue page can offer
 * "Recently seen" videos (owner request, 2026-11-18): just enough to reopen it
 * on Watch and to show a row. No media URL is stored; Watch fetches the post.
 */
export interface SeenVideo {
  title: string;
  poster?: string;
  params: Record<string, string>;
}

/** The video a seen post carries (a YouTube link or an uploaded video), or null. */
export function seenVideo(status: Status, homeServer: string): SeenVideo | null {
  const shown = status.reblog ?? status;
  const youtube = statusVideo(shown);
  const upload = youtube
    ? null
    : (shown.media_attachments ?? []).find((media) => media.type === 'video');
  const source = youtube ?? (upload ? attachmentSource(upload) : null);
  if (!source) return null;
  try {
    const entry = queueEntry(source, watchParams(shown, source, homeServer, upload?.id));
    return entry
      ? {
          title: entry.title,
          ...(entry.poster ? { poster: entry.poster } : {}),
          params: entry.params,
        }
      : null;
  } catch {
    return null;
  }
}
