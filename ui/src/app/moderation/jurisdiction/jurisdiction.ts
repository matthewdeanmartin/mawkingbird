import data from './jurisdictions.generated.json';

/**
 * A server's *self-declared* jurisdiction, as of the last crawl of its Terms
 * of Service and About page (spec/moderation-facets.md §6).
 *
 * Mastodon has no field for this: it is free text inside pages that run to
 * thousands of words. An offline crawl reads them for the largest servers and
 * the largest server per country. Everything here is a claim the server made
 * about itself, at a date, which is how the report gate words it.
 */
export interface JurisdictionRecord {
  /** "Helsinki, Finland", or null when the pages state none. */
  jurisdiction: string | null;
  /** The sentence the extraction relied on, so a reader can check it. */
  quote?: string;
  /** Which page said it. */
  source?: 'terms' | 'about';
  /** ISO date of the crawl. */
  crawledAt: string;
  /** Hash of the crawled legal text; a change re-shows the report gate. */
  hash: string;
}

interface JurisdictionFile {
  generatedAt: string | null;
  servers: Record<string, JurisdictionRecord>;
}

const FILE = data as unknown as JurisdictionFile;

function hostOf(serverOrUrl: string): string {
  const raw = serverOrUrl.trim().toLowerCase();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).host;
  } catch {
    return raw;
  }
}

/** The crawled record for a server (host or URL), if it was crawled. */
export function jurisdictionFor(
  serverOrUrl: string,
  file: JurisdictionFile = FILE,
): JurisdictionRecord | undefined {
  const host = hostOf(serverOrUrl);
  return host ? file.servers[host] : undefined;
}

export { hostOf as jurisdictionHost };
