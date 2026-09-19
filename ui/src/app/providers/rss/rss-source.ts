import { Status } from '../../models';

/** The subscription's exact URL, never the article URL or the publisher's home page. */
export function rssSourceUrl(status: Status): string | null {
  const id = status.account.id;
  if (status.provider !== 'rss' || !id.startsWith('rss:') || id.includes('::author::')) return null;
  const url = id.slice(4);
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}
