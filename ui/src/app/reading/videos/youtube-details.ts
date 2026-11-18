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
