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
export const BLOG_DESCRIPTION =
  'Notes from the Mawkingbird project: why the client exists, how it is funded, the software it ships and how it handles your data.';

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
    while (route) {
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
  }
}
