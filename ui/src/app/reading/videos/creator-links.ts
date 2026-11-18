import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { Account } from '../../platform/api/models';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { PLATFORM_WIKIDATA } from '../../platform/http/platform-http';
import { externalFetch } from '../../platform/http/external-fetch';
import { mastodonProfileHandle } from '../../accounts/rendered-html-links';
import { CHANNEL_ID } from './video-subscriptions';
import { YoutubeFeeds } from './youtube-feeds';

/**
 * How a YouTube channel was tied to a Mastodon account (spec/youtube-client.md).
 * - `channel`: the channel's own About page links the account (the creator's claim);
 * - `wikidata`: Wikidata lists it (community-edited, public);
 * Either becomes `confirmed` when the account's profile links back to the channel.
 */
export type CreatorLinkSource = 'channel' | 'wikidata';

export interface CreatorLink {
  /** `user@host`. */
  acct: string;
  sources: CreatorLinkSource[];
  /** The account's own profile links back to this channel. */
  confirmed: boolean;
  /** The account as its own server shows it, when it could be looked up. */
  account: Account | null;
}

/** The fixed question for one channel; Native's Rust builds the same text. */
export function wikidataQuery(channelId: string): string {
  return `SELECT ?item ?mastodon WHERE { ?item wdt:P2397 "${channelId}" . OPTIONAL { ?item wdt:P4033 ?mastodon } } LIMIT 5`;
}

/** A Mastodon address as Wikidata or a profile writes it: `user@host`, `@user@host` or a profile URL. */
export function mastodonAddress(raw: string): string | null {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return mastodonProfileHandle(value);
  const match = /^@?([A-Za-z0-9_.-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/.exec(value);
  return match ? `${match[1]}@${match[2].toLowerCase()}` : null;
}

/** Mastodon addresses in a SPARQL JSON answer. */
export function wikidataAddresses(json: string): string[] {
  try {
    const bindings = (
      JSON.parse(json) as { results?: { bindings?: { mastodon?: { value?: string } }[] } }
    ).results?.bindings;
    return [
      ...new Set(
        (bindings ?? []).flatMap((row) => {
          const acct = row.mastodon?.value ? mastodonAddress(row.mastodon.value) : null;
          return acct ? [acct] : [];
        }),
      ),
    ];
  } catch {
    return [];
  }
}

/**
 * Hosts whose `/@name` pages are not fediverse profiles. A channel's links
 * often include these; treating Medium or TikTok as Mastodon would offer a
 * Follow that can never work.
 */
const NOT_FEDIVERSE = new Set([
  'medium.com',
  'www.medium.com',
  'tiktok.com',
  'www.tiktok.com',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'threads.net',
  'www.threads.net',
  'threads.com',
  'www.threads.com',
  'substack.com',
  'linktr.ee',
  'bsky.app',
]);

/** Mastodon-shaped profile links among a channel's About links. */
export function addressesFromLinks(links: readonly { url: string }[]): string[] {
  return [
    ...new Set(
      links.flatMap(({ url }) => {
        let host: string;
        try {
          host = new URL(url).hostname.toLowerCase();
        } catch {
          return [];
        }
        if (NOT_FEDIVERSE.has(host)) return [];
        const acct = mastodonProfileHandle(url);
        return acct ? [acct] : [];
      }),
    ),
  ];
}

/** Whether a profile links this channel: by channel ID, or by its `@handle`. */
export function profileLinksChannel(
  account: Pick<Account, 'note' | 'fields'>,
  channelId: string,
  handle: string | null,
): boolean {
  const haystack = [account.note ?? '', ...(account.fields ?? []).map((field) => field.value ?? '')]
    .join(' ')
    .toLowerCase();
  if (haystack.includes(`youtube.com/channel/${channelId.toLowerCase()}`)) return true;
  if (!handle) return false;
  const name = handle.replace(/^@/, '').toLowerCase();
  return new RegExp(
    `youtube\\.com/@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.-])`,
  ).test(haystack);
}

/**
 * Ties a YouTube channel to its creator's Mastodon account, saying how it
 * knows. Sources, best first: the channel's own About links (Native), then
 * Wikidata (P2397 → P4033, behind the Wikidata connection setting). Each
 * candidate is looked up on its own server, publicly, to confirm it exists and
 * to see whether its profile links back. Results are kept for this visit only.
 */
@Injectable({ providedIn: 'root' })
export class CreatorLinks {
  private readonly http = inject(HttpClient);
  private readonly flags = inject(FeatureFlags);
  private readonly nativeWikidata = inject(PLATFORM_WIKIDATA);
  private readonly youtube = inject(YoutubeFeeds);
  private readonly cache = new Map<string, Promise<CreatorLink | null>>();

  /**
   * For a channel known only by ID (Watch): on Native, read its handle and
   * About links first, without its uploads; elsewhere, Wikidata alone.
   */
  async lookupChannel(id: string): Promise<CreatorLink | null> {
    if (!CHANNEL_ID.test(id)) return null;
    const info = this.youtube.canReadDetails()
      ? await this.youtube.channel(id, { uploads: false }).catch(() => null)
      : null;
    return this.forChannel({ id, handle: info?.handle ?? null, links: info?.links ?? [] });
  }

  forChannel(channel: {
    id: string;
    handle?: string | null;
    links?: readonly { url: string }[];
  }): Promise<CreatorLink | null> {
    if (!CHANNEL_ID.test(channel.id)) return Promise.resolve(null);
    const key = `${channel.id}|${channel.handle ?? ''}|${(channel.links ?? []).map((l) => l.url).join(' ')}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.find(channel).catch(() => null);
      this.cache.set(key, pending);
    }
    return pending;
  }

  private async find(channel: {
    id: string;
    handle?: string | null;
    links?: readonly { url: string }[];
  }): Promise<CreatorLink | null> {
    const fromChannel = addressesFromLinks(channel.links ?? []);
    const fromWikidata = await this.wikidata(channel.id);
    const candidates = new Map<string, CreatorLinkSource[]>();
    for (const acct of fromChannel) candidates.set(acct, ['channel']);
    for (const acct of fromWikidata)
      candidates.set(acct, [...(candidates.get(acct) ?? []), 'wikidata']);
    if (!candidates.size) return null;
    const links = await Promise.all(
      [...candidates].slice(0, 3).map(async ([acct, sources]): Promise<CreatorLink> => {
        const account = await this.lookup(acct);
        return {
          acct,
          sources,
          account,
          confirmed: !!account && profileLinksChannel(account, channel.id, channel.handle ?? null),
        };
      }),
    );
    // A confirmed link, then the one more sources agree on, then the channel's own claim.
    const rank = (link: CreatorLink) =>
      (link.confirmed ? 4 : 0) + link.sources.length + (link.sources.includes('channel') ? 1 : 0);
    return links.sort((a, b) => rank(b) - rank(a))[0] ?? null;
  }

  private async wikidata(channelId: string): Promise<string[]> {
    if (!this.flags.enabled('connector-wikidata')) return [];
    try {
      const json = this.nativeWikidata
        ? await this.nativeWikidata(channelId)
        : await firstValueFrom(
            this.http
              .get('https://query.wikidata.org/sparql', {
                params: { format: 'json', query: wikidataQuery(channelId) },
                headers: { Accept: 'application/sparql-results+json' },
                responseType: 'text',
                context: externalFetch(),
                withCredentials: false,
              })
              .pipe(timeout(15_000)),
          );
      return wikidataAddresses(json);
    } catch {
      return [];
    }
  }

  /** The account on its own server, publicly (no token, nothing followed). */
  private async lookup(acct: string): Promise<Account | null> {
    const [username, host] = acct.split('@');
    try {
      return await firstValueFrom(
        this.http
          .get<Account>(`https://${host}/api/v1/accounts/lookup`, {
            params: { acct: username },
            context: externalFetch(),
            withCredentials: false,
          })
          .pipe(timeout(10_000)),
      );
    } catch {
      return null;
    }
  }
}
