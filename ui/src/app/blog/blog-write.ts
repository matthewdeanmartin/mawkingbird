import { Status } from '../platform/api/models';
import { BlogPostReason, BlogThresholds, blogReason, proseLength } from './blog-classifier';

/**
 * Writing a blog post in Write, as plain text.
 *
 * The title is not a separate field in the draft: it is the body's first
 * line, exactly as it will be read back (the first line of the first post is
 * the title — spec/blog-mode.md). Keeping it in the text means drafts,
 * versions, scheduling and every publish target carry it for free, and what
 * Write shows is what the blog will show.
 */

const MARKER = /^\s*blog:\s*/i;

function splitFirst(body: string): [string, string | null] {
  const at = body.indexOf('\n');
  return at < 0 ? [body, null] : [body.slice(0, at), body.slice(at + 1)];
}

/** Whether the first line carries the `BLOG:` marker. */
export function bodyMarked(body: string): boolean {
  return MARKER.test(splitFirst(body)[0]);
}

/** The title as typed: the first line, without the marker. */
export function bodyTitle(body: string): string {
  return splitFirst(body)[0].replace(MARKER, '').trim();
}

/**
 * The body with its first line replaced by `title` (and the marker, when
 * `marked`). An empty title keeps an empty first line rather than pulling the
 * text up into the title's place.
 */
export function withBodyTitle(body: string, title: string, marked: boolean): string {
  const [, rest] = splitFirst(body);
  const clean = title.replace(/[\r\n]+/g, ' ').trim();
  const line = marked ? (clean ? `BLOG: ${clean}` : 'BLOG:') : clean;
  return rest === null ? line : `${line}\n${rest}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Write's parts as the posts the classifier will later read back. */
function asPosts(parts: string[]): Status[] {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part, index) =>
        ({
          id: String(index),
          content: `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`,
        }) as Status,
    );
}

export interface BlogVerdict {
  reason: BlogPostReason | null;
  posts: number;
  chars: number;
}

/** Will this count as a blog post once published, and why. */
export function blogVerdict(parts: string[], thresholds: BlogThresholds): BlogVerdict {
  const chain = asPosts(parts);
  return { reason: blogReason(chain, thresholds), posts: chain.length, chars: proseLength(chain) };
}
