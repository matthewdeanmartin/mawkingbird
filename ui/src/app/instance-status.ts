import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Server } from './server';

export type StatusLinkKind = 'official' | 'administrator-provided' | 'third-party';

/** A status/uptime link offered on the fail whale, with an explicit trust level. */
export interface StatusLink {
  url: string;
  kind: StatusLinkKind;
  label: 'Check instance status' | 'View third-party uptime information';
  verifiedAt: string;
}

/** Cached discovery result for one instance. `statusPage: null` means "looked, found none". */
interface DiscoveryRecord {
  statusPage: string | null;
  source: 'instance-about-page';
  verifiedAt: string;
}

const CACHE_KEY = 'mockingbird_instance_status_pages';
/** Cached discoveries (and misses) are revalidated after this long. */
const REVALIDATE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Curated registry of status pages for major instances. Mastodon defines no
 * standard status-page URL or `status_page` instance field, so these are
 * maintained data, not permanent truth — each entry was verified by hand
 * (see `REGISTRY_VERIFIED_AT`) and should be revalidated periodically.
 */
const REGISTRY: Readonly<Record<string, string>> = {
  'mastodon.social': 'https://status.mastodon.social/',
  'mastodon.online': 'https://status.mastodon.social/',
  'mstdn.social': 'https://status.mstdn.social/',
  'mas.to': 'https://status.mas.to/',
  'fosstodon.org': 'https://status.fosstodon.org/',
  'infosec.exchange': 'https://status.infosec.exchange/',
  'techhub.social': 'https://status.techhub.social/',
};
const REGISTRY_VERIFIED_AT = '2026-07-14T00:00:00Z';

/** Terms that mark an about-page link as a status/uptime page. */
const STATUS_TERMS = /\b(status|uptime|incidents?)\b/i;

/**
 * Reduce an instance base URL to a bare lowercase domain safe to build links
 * from, or null when no trustworthy domain can be derived. Rejects non-HTTPS
 * origins, embedded credentials, explicit ports, IP addresses (including
 * loopback), single-label hosts (localhost etc.), and .onion addresses.
 */
export function normalizeInstanceDomain(baseUrl: string): string | null {
  if (!baseUrl) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (isIpv4 || host.includes(':') || !host.includes('.') || host.endsWith('.onion')) {
    return null;
  }
  return host;
}

/** True when `candidate` is an https URL with no credentials, port, or fragment. */
function isSafeExternalUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    !url.username &&
    !url.password &&
    !url.hash &&
    normalizeInstanceDomain(url.origin) !== null
  );
}

/**
 * Finds a status/uptime page to offer when an instance is unreachable, in
 * decreasing order of trust: the curated registry, an administrator-provided
 * link previously discovered on the instance's own about page, then Fediverse
 * Observer as an independent third-party fallback. Never guesses: a bare
 * `status.<domain>` convention is not offered unverified, and browser CORS
 * rules out probing it from a client-only app, so instances outside the first
 * two tiers get the clearly-labelled third-party link or nothing.
 *
 * Discovery can't run while an instance is down, so it happens during normal
 * operation: whenever a (non-mock) instance is selected, its public about page
 * (`GET /api/v1/instance/extended_description`, CORS-enabled) is scanned once
 * for administrator-published status links, and the result — hit or miss — is
 * cached in localStorage and revalidated after 30 days.
 */
@Injectable({ providedIn: 'root' })
export class InstanceStatus {
  private http = inject(HttpClient);
  private server = inject(Server);

  private cache = signal<Record<string, DiscoveryRecord>>(this.loadCache());

  /** The current instance's domain, or null for the mock / unsafe origins. */
  readonly currentDomain = computed(() => normalizeInstanceDomain(this.server.baseUrl()));

  /** The best status link for the current instance, or null when none is trustworthy. */
  readonly statusLink = computed<StatusLink | null>(() => {
    const domain = this.currentDomain();
    if (!domain) {
      return null;
    }
    const registered = REGISTRY[domain];
    if (registered) {
      return {
        url: registered,
        kind: 'official',
        label: 'Check instance status',
        verifiedAt: REGISTRY_VERIFIED_AT,
      };
    }
    const discovered = this.cache()[domain];
    if (discovered?.statusPage) {
      return {
        url: discovered.statusPage,
        kind: 'administrator-provided',
        label: 'Check instance status',
        verifiedAt: discovered.verifiedAt,
      };
    }
    return {
      url: `https://fediverse.observer/${domain}`,
      kind: 'third-party',
      label: 'View third-party uptime information',
      verifiedAt: new Date().toISOString(),
    };
  });

  constructor() {
    effect(() => this.discover(this.currentDomain()));
  }

  /** Scan the instance's about page for an administrator-published status link. */
  private discover(domain: string | null): void {
    if (!domain || REGISTRY[domain]) {
      return;
    }
    const cached = this.cache()[domain];
    if (cached && Date.now() - Date.parse(cached.verifiedAt) < REVALIDATE_MS) {
      return;
    }
    this.http.get<{ content?: string }>('/api/v1/instance/extended_description').subscribe({
      next: (about) => this.store(domain, this.extractStatusUrl(about.content ?? '')),
      error: () => {
        // Unreachable or unsupported endpoint: keep whatever we knew before.
      },
    });
  }

  /** First safe https link in the about-page HTML that reads as a status page. */
  private extractStatusUrl(html: string): string | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = anchor.getAttribute('href') ?? '';
      if (!isSafeExternalUrl(href)) {
        continue;
      }
      const host = new URL(href).hostname;
      if (STATUS_TERMS.test(anchor.textContent ?? '') || /^(status|uptime)\./i.test(host)) {
        return href;
      }
    }
    return null;
  }

  private store(domain: string, statusPage: string | null): void {
    this.cache.update((all) => ({
      ...all,
      [domain]: {
        statusPage,
        source: 'instance-about-page',
        verifiedAt: new Date().toISOString(),
      },
    }));
    localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache()));
  }

  private loadCache(): Record<string, DiscoveryRecord> {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, DiscoveryRecord>;
    } catch {
      return {};
    }
  }
}
