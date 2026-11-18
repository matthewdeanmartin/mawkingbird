import { strToU8, Zippable, zipSync } from 'fflate';
import type { UnbirdArchive, UnbirdTweet } from './unbird-archive';

/**
 * The archive as a small static website the reader can host anywhere: an
 * index, a page per year, an RSS feed and one stylesheet, zipped.
 *
 * Replies to other people and retweets are left out by default, for the same
 * reason they are not replayed to Mastodon: out of context they read as
 * nonsense, and they name people who did not choose to be in it. Likes are
 * other people's words and are never included. Media files stay in the
 * original archive; a post notes how many it had.
 */

export interface WebsiteOptions {
  title: string;
  /** Include replies to other people. */
  replies: boolean;
  /** Absolute URL the site will live at, for the RSS feed; empty for relative links. */
  baseUrl: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escaped text with bare http(s) links made clickable and line breaks kept. */
export function renderText(text: string): string {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    parts.push(escapeHtml(text.slice(last, match.index)));
    const url = match[0].replace(/[.,;:!?)]+$/, '');
    parts.push(`<a href="${escapeHtml(url)}" rel="nofollow">${escapeHtml(url)}</a>`);
    last = match.index + url.length;
  }
  parts.push(escapeHtml(text.slice(last)));
  return parts.join('').replace(/\n/g, '<br>');
}

function included(tweet: UnbirdTweet, options: WebsiteOptions): boolean {
  if (tweet.retweet || !tweet.at) return false;
  return options.replies || !tweet.replyToOther;
}

const STYLE = `:root{color-scheme:light dark;--bg:#fff;--text:#1d1d1f;--muted:#6b6b70;--line:#e3e3e6;--accent:#2a6fdb}
@media(prefers-color-scheme:dark){:root{--bg:#111214;--text:#ececef;--muted:#9a9aa2;--line:#2a2b30;--accent:#7aa7ff}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
a{color:var(--accent)}h1{margin:0 0 4px}.bio,.meta{color:var(--muted)}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;margin:16px 0 24px}
article{padding:14px 0;border-top:1px solid var(--line);overflow-wrap:anywhere}
time{display:block;color:var(--muted);font-size:.85rem;margin-bottom:4px}
.note{color:var(--muted);font-size:.85rem}`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><link rel="stylesheet" href="style.css"><link rel="alternate" type="application/rss+xml" href="feed.xml"></head>
<body><main>${body}</main></body></html>
`;
}

function article(tweet: UnbirdTweet): string {
  const date = tweet.at.slice(0, 10);
  const notes: string[] = [];
  if (tweet.selfReply) notes.push('part of a thread');
  if (tweet.replyToOther) notes.push('a reply');
  if (tweet.media)
    notes.push(tweet.media === 1 ? '1 photo or video' : `${tweet.media} photos or videos`);
  return `<article id="t${tweet.id}"><time datetime="${tweet.at}">${date}</time><p>${renderText(tweet.text)}</p>${
    notes.length ? `<p class="note">${notes.join(' · ')}</p>` : ''
  }</article>`;
}

/** The site's files, before zipping. Pure, for tests. */
export function websiteFiles(
  archive: UnbirdArchive,
  options: WebsiteOptions,
): Record<string, string> {
  const tweets = archive.tweets.filter((tweet) => included(tweet, options));
  const byYear = new Map<string, UnbirdTweet[]>();
  for (const tweet of tweets) {
    const year = tweet.at.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), tweet]);
  }
  const years = [...byYear.keys()].sort((left, right) => right.localeCompare(left));
  const nav = `<nav><a href="index.html">Home</a>${years
    .map((year) => `<a href="${year}.html">${year}</a>`)
    .join('')}</nav>`;
  const header = `<h1>${escapeHtml(options.title)}</h1>${
    archive.profile?.bio ? `<p class="bio">${renderText(archive.profile.bio)}</p>` : ''
  }`;

  const files: Record<string, string> = { 'style.css': STYLE };
  files['index.html'] = page(
    options.title,
    `${header}${nav}<p class="meta">${tweets.length.toLocaleString('en')} posts, ${
      years.at(-1) ?? ''
    }–${years[0] ?? ''}. Saved from a Twitter archive.</p>${tweets.slice(0, 20).map(article).join('')}`,
  );
  for (const year of years) {
    files[`${year}.html`] = page(
      `${options.title} · ${year}`,
      `${header}${nav}<h2>${year}</h2>${byYear.get(year)!.map(article).join('')}`,
    );
  }

  const base = options.baseUrl.replace(/\/+$/, '');
  const link = (path: string) => (base ? `${base}/${path}` : path);
  files['feed.xml'] = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>${escapeHtml(options.title)}</title><link>${escapeHtml(link('index.html'))}</link><description>${escapeHtml(
    archive.profile?.bio || options.title,
  )}</description>
${tweets
  .slice(0, 100)
  .map(
    (tweet) =>
      `<item><guid isPermaLink="false">tweet-${tweet.id}</guid><link>${escapeHtml(
        link(`${tweet.at.slice(0, 4)}.html#t${tweet.id}`),
      )}</link><pubDate>${new Date(tweet.at).toUTCString()}</pubDate><description>${escapeHtml(
        renderText(tweet.text),
      )}</description></item>`,
  )
  .join('\n')}
</channel></rss>
`;
  return files;
}

export function websiteZip(archive: UnbirdArchive, options: WebsiteOptions): Blob {
  const input: Zippable = {};
  for (const [name, text] of Object.entries(websiteFiles(archive, options))) {
    input[`site/${name}`] = strToU8(text);
  }
  return new Blob([zipSync(input) as BlobPart], { type: 'application/zip' });
}
