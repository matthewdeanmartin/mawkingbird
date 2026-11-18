/** What `/watch` can show about a YouTube video beyond oEmbed. Native only. */
export interface YoutubeVideoDetails {
  id: string;
  title: string;
  channelId: string | null;
  channelTitle: string;
  durationSeconds: number | null;
  description: string;
  /** YouTube's own flag; `false` means age-restricted or otherwise not family safe. */
  familySafe: boolean | null;
  live: boolean;
  chapters: YoutubeChapter[];
}

export interface YoutubeChapter {
  seconds: number;
  title: string;
}

const STAMP = /^\s*(?:[-–•*]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–:|]?\s*(.+?)\s*$/;

function seconds(stamp: string): number {
  return stamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * Chapters as YouTube itself derives them from a description: at least three
 * timestamped lines, the first at 0:00, in increasing order. Anything else
 * is just timestamps in prose, which YouTube does not treat as chapters either.
 */
export function chaptersFromDescription(description: string): YoutubeChapter[] {
  const chapters: YoutubeChapter[] = [];
  for (const line of description.split('\n')) {
    const match = STAMP.exec(line);
    if (!match) continue;
    const at = seconds(match[1]);
    if (chapters.length && at <= chapters[chapters.length - 1].seconds) continue;
    chapters.push({ seconds: at, title: match[2] });
  }
  return chapters.length >= 3 && chapters[0].seconds === 0 ? chapters : [];
}

/** A read-only YouTube comment, as plain text: never rendered as HTML. */
export interface YoutubeComment {
  id: string;
  author: string;
  /** YouTube's own relative wording ("2 weeks ago"); it gives no timestamp. */
  published: string;
  likes: string;
  text: string;
  replies: string;
  byCreator: boolean;
}

export interface YoutubeCommentPage {
  comments: YoutubeComment[];
  /** The next page, when YouTube has one. */
  more: (() => Promise<YoutubeCommentPage>) | null;
}

/** The parts of a Mastodon v2 filter that apply to text from outside Mastodon. */
export interface KeywordFilter {
  context: readonly string[];
  filter_action: string;
  expires_at: string | null;
  keywords: readonly { keyword: string; whole_word: boolean }[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The reader's own Mastodon keyword filters, applied to text Mastodon never
 * saw (YouTube comments). Whole-word keywords match on letter/number
 * boundaries in any script, as Mastodon's do. `hide` wins over `warn`.
 */
export function keywordFilterAction(
  text: string,
  filters: readonly KeywordFilter[],
  context = 'thread',
  now = Date.now(),
): 'hide' | 'warn' | null {
  let action: 'warn' | null = null;
  const haystack = text.toLowerCase();
  for (const filter of filters) {
    if (!filter.context.includes(context)) continue;
    if (filter.expires_at && Date.parse(filter.expires_at) <= now) continue;
    const hit = filter.keywords.some(({ keyword, whole_word }) => {
      const needle = keyword.trim().toLowerCase();
      if (!needle) return false;
      return whole_word
        ? new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(needle)}($|[^\\p{L}\\p{N}_])`, 'u').test(
            haystack,
          )
        : haystack.includes(needle);
    });
    if (!hit) continue;
    if (filter.filter_action === 'hide') return 'hide';
    if (filter.filter_action === 'warn') action = 'warn';
  }
  return action;
}
