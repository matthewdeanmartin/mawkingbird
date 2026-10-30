import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';

export const SITE_ORIGIN = 'https://mawkingbird.com';
export const SITE_DESCRIPTION =
  'Mawkingbird brings Mastodon, Bluesky and RSS together with bookmarks, readable articles, writing tools and advanced account controls.';
export const FEATURES_DESCRIPTION =
  'Explore Mawkingbird: Mastodon feeds, RSS and readable articles, bookmarks, writing and drafts, bulk actions and third-party integrations.';
export const ABOUT_DESCRIPTION =
  'Why Mawkingbird exists: a 2018-Twitter-style client for Mastodon, Bluesky and RSS with a finite feed, an honest algorithm, bookmarks and analytics.';
export const FUNDING_DESCRIPTION =
  'How Mawkingbird is funded and built: free and open source, who pays for hosting and connections, and what a paid option might add.';
export const FOLLOW_DESCRIPTION =
  'New to Mastodon? Start with hand-picked starter kits of people to follow, grouped by interest, and follow a whole kit in one step with Mawkingbird.';
export const TOOLS_DESCRIPTION =
  'Free single-purpose tools for Mastodon and Bluesky: pick a handle, find your Twitter, Bluesky and phone contacts, schedule posts, and tidy up your account.';
export const BLOG_DESCRIPTION =
  'Notes from the Mawkingbird project: why the client exists, how it is funded, the software it ships and how it handles your data.';

/**
 * schema.org description of the app itself, for the front page and /features/.
 * It names what kind of thing Mawkingbird is, so search engines need not guess.
 */
export const APP_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Mawkingbird',
  url: `${SITE_ORIGIN}/`,
  description: SITE_DESCRIPTION,
  applicationCategory: 'SocialNetworkingApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  image: `${SITE_ORIGIN}/mockingbird_hand.png`,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
} as const;

/** One owner for metadata: navigation must never leave a previous page's tags behind. */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);

  update(snapshot: RouterStateSnapshot, title: string): void {
    let route = snapshot.root;
    let description = SITE_DESCRIPTION;
    let indexable = false;
    let canonicalPath: string | undefined;
    let structuredData: object | undefined;
    while (route) {
      if (route.data['seoStructuredData']) structuredData = route.data['seoStructuredData'];
      if (route.data['seoDescription']) description = route.data['seoDescription'];
      if (route.data['seoIndexable'] !== undefined) indexable = route.data['seoIndexable'];
      if (route.data['seoCanonicalPath']) canonicalPath = route.data['seoCanonicalPath'];
      if (!route.firstChild) break;
      route = route.firstChild;
    }
    // Canonicals never contain callback codes, shared-message content or account identifiers.
    const path = canonicalPath ?? snapshot.url.split(/[?#]/)[0];
    const canonical = indexable
      ? `${SITE_ORIGIN}${path === '/' ? '/' : path.replace(/\/$/, '') + '/'}`
      : `${SITE_ORIGIN}/`;
    const basePath = new URL(
      this.document.querySelector('base')?.getAttribute('href') ?? '/',
      SITE_ORIGIN,
    ).pathname;
    const preview = basePath.startsWith('/canary/') || basePath.startsWith('/test/');
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({
      name: 'robots',
      content: indexable && !preview ? 'index, follow' : 'noindex, follow',
    });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (indexable && !preview) {
      if (!link) {
        link = this.document.createElement('link');
        link.rel = 'canonical';
        this.document.head.appendChild(link);
      }
      link.href = canonical;
    } else {
      link?.remove();
    }
    // A JSON-LD data block is never executed, so script-src 'self' allows it.
    let data = this.document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (structuredData && indexable && !preview) {
      if (!data) {
        data = this.document.createElement('script');
        data.type = 'application/ld+json';
        this.document.head.appendChild(data);
      }
      // `<` escaped so text from kit data can never close the element.
      data.textContent = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    } else {
      data?.remove();
    }
  }
}
