import { CENTRE, FocalPoint, focusParam, samePoint } from '../focal-point/focal-point';
import { Poll } from '../../platform/api/models';

/** Mastodon's shortest poll duration, in seconds. */
export const MIN_POLL_SECONDS = 300;
/** The composer's poll option cap, kept the same here. */
export const MAX_POLL_OPTIONS = 4;

/** One attachment as the editor holds it. */
export interface EditMedia {
  id: string;
  type: string;
  previewUrl: string;
  /** The uncropped image, for choosing a focus point. */
  fullUrl?: string;
  description: string;
  /** The description the server already has, to send only real changes. */
  savedDescription: string;
  /** Focal point now, and as the server has it (null = centre). */
  focus?: FocalPoint | null;
  savedFocus?: FocalPoint | null;
}

export interface EditPoll {
  options: string[];
  multiple: boolean;
  /** Seconds from now; for an existing poll, its remaining time. */
  expiresIn: number;
}

/** Everything `PUT /api/v1/statuses/:id` accepts that the editor changes. */
export interface StatusEditBody {
  status: string;
  spoiler_text: string;
  sensitive: boolean;
  language?: string;
  media_ids: string[];
  media_attributes?: { id: string; description: string; focus?: string }[];
  poll?: { options: string[]; multiple: boolean; expires_in: number };
}

/**
 * Seconds left on a poll, for re-sending it with an edit.
 *
 * Mastodon deletes a poll that an edit leaves out, and re-sending one sets its
 * expiry from `expires_in`, so an open poll is re-sent with what it has left.
 * A closed poll can only be re-sent open, for at least Mastodon's minimum.
 */
export function remainingSeconds(poll: Pick<Poll, 'expires_at'>, now = Date.now()): number {
  if (!poll.expires_at) return 24 * 3600;
  const left = Math.ceil((Date.parse(poll.expires_at) - now) / 1000);
  return Math.max(MIN_POLL_SECONDS, left);
}

export function editPollFrom(poll: Poll, now = Date.now()): EditPoll {
  return {
    options: poll.options.map((option) => option.title),
    multiple: poll.multiple,
    expiresIn: remainingSeconds(poll, now),
  };
}

/** Whether saving `next` would make Mastodon reset the poll's votes. */
export function pollVotesReset(previous: Poll | null, next: EditPoll | null): boolean {
  if (!previous || !next) return false;
  const titles = previous.options.map((option) => option.title);
  return (
    next.multiple !== previous.multiple ||
    next.options.length !== titles.length ||
    next.options.some((title, i) => title.trim() !== titles[i])
  );
}

export function buildEditBody(fields: {
  text: string;
  spoilerText: string;
  sensitive: boolean;
  language: string;
  media: EditMedia[];
  poll: EditPoll | null;
}): StatusEditBody {
  const body: StatusEditBody = {
    status: fields.text,
    spoiler_text: fields.spoilerText.trim(),
    sensitive: fields.sensitive,
    media_ids: fields.media.map((m) => m.id),
  };
  if (fields.language) body.language = fields.language;
  // Mastodon updates each listed attachment's description and focus; list only
  // the ones that changed, and send focus only when it moved.
  const changed = fields.media
    .filter(
      (m) =>
        m.description.trim() !== m.savedDescription ||
        !samePoint(m.focus ?? null, m.savedFocus ?? null),
    )
    .map((m) => ({
      id: m.id,
      description: m.description.trim(),
      ...(samePoint(m.focus ?? null, m.savedFocus ?? null)
        ? {}
        : { focus: focusParam(m.focus ?? CENTRE) }),
    }));
  if (changed.length) body.media_attributes = changed;
  if (fields.poll) {
    body.poll = {
      options: fields.poll.options.map((option) => option.trim()),
      multiple: fields.poll.multiple,
      expires_in: fields.poll.expiresIn,
    };
  }
  return body;
}
