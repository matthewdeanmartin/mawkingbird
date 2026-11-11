import { Status } from '../platform/api/models';
import { HEATED_THRESHOLD, rageScore, stripHtml } from '../../lib/sentiment';

export { HEATED_THRESHOLD, rageScore, stripHtml } from '../../lib/sentiment';

/**
 * Whether a status (or the status it boosts) reads as inflammatory.
 *
 * Beyond the lexicon, two structural signals count as negative sentiment
 * outright: a content warning (the author flagged it themselves), and a match
 * on any of the viewer's own content filters (the viewer already said "less
 * of this, please").
 */
export function isHeated(status: Status): boolean {
  const target = status.reblog ?? status;
  if (target.spoiler_text.trim()) {
    return true;
  }
  if ((status.filtered?.length ?? 0) > 0 || (target.filtered?.length ?? 0) > 0) {
    return true;
  }
  const text = stripHtml(target.content);
  return rageScore(text) >= HEATED_THRESHOLD;
}

/** The ratio rule needs at least this many replies — small posts aren't "ratioed". */
export const RATIO_MIN_REPLIES = 5;
/** Ratioed = replies at least this many times the endorsements (favs + boosts). */
export const RATIO_FACTOR = 2;

/**
 * Whether a status (or its boost target) is being "ratioed": far more replies
 * than endorsements. Lots of comments over few likes/boosts almost always
 * means people are angry AT the post, not into it — pure engagement metrics
 * can't tell the difference, but this shape can.
 */
export function isRatioed(status: Status): boolean {
  const target = status.reblog ?? status;
  return (
    target.replies_count >= RATIO_MIN_REPLIES &&
    target.replies_count >= RATIO_FACTOR * (target.favourites_count + target.reblogs_count)
  );
}

/**
 * Whether a status (or its boost target) reads as a dunk: quoting someone
 * else's post with commentary of your own that carries any rage signal at
 * all. Quoting per se is fine — sharing with added context is the honest use
 * — so only the quote + negativity combination counts.
 */
export function isDunk(status: Status): boolean {
  const target = status.reblog ?? status;
  if (!target.quote) {
    return false;
  }
  return rageScore(stripHtml(target.content)) >= 1;
}

/**
 * Everything Calm mode hides: heated text ({@link isHeated}), dunks
 * ({@link isDunk}), and ratioed posts ({@link isRatioed}). The lexicon reads
 * the words; the other two read the shape of the engagement — outrage that
 * stays politely worded still gets caught by how people responded to it.
 */
export function isCalmHidden(status: Status): boolean {
  return isHeated(status) || isDunk(status) || isRatioed(status);
}
