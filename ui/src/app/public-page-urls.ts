import { Directive, HostAttributeToken, inject, Provider } from '@angular/core';
import { DefaultUrlSerializer, Route, RouterLink, UrlSerializer, UrlTree } from '@angular/router';

/**
 * Links to prerendered public pages end in a slash.
 *
 * Every public page is published as `<path>/index.html`, so GitHub Pages
 * answers `/features` with a 301 to `/features/`. Angular serializes router
 * links without the slash, which made every link between public pages a
 * redirect and filled Search Console with "Page with redirect". This
 * serializer adds the slash for the routes that opt in to indexing (the same
 * `seoIndexable` flag the canonical tag uses), so links, the address bar and
 * the canonical URL agree. App routes keep their usual form: `/login` is an
 * OAuth redirect address and must not move.
 */
export class PublicPageUrlSerializer extends DefaultUrlSerializer {
  private readonly patterns: RegExp[];

  constructor(routes: Routes) {
    super();
    this.patterns = publicRoutePaths(routes).map(
      (path) =>
        new RegExp(
          '^/' +
            path
              .split('/')
              .map((part) =>
                part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              )
              .join('/') +
            '$',
        ),
    );
  }

  /** Whether `path` (no query or fragment, no trailing slash) is a prerendered page. */
  isPublicPage(path: string): boolean {
    if (path === '/' || path === '') return true;
    const bare = path.replace(/\/$/, '');
    return this.patterns.some((pattern) => pattern.test(bare));
  }

  /** `/features/` and `/features` are the same page. */
  override parse(url: string): UrlTree {
    const end = url.search(/[?#]/);
    const path = end === -1 ? url : url.slice(0, end);
    if (path.length > 1 && path.endsWith('/') && this.isPublicPage(path))
      url = path.slice(0, -1) + (end === -1 ? '' : url.slice(end));
    return super.parse(url);
  }

  override serialize(tree: UrlTree): string {
    const url = super.serialize(tree);
    const end = url.search(/[?#]/);
    const path = end === -1 ? url : url.slice(0, end);
    if (path === '/' || path.endsWith('/') || !this.isPublicPage(path)) return url;
    return `${path}/${end === -1 ? '' : url.slice(end)}`;
  }
}

type Routes = readonly Route[];

/** Full paths of the routes marked indexable, including `:param` segments. */
export function publicRoutePaths(routes: Routes, prefix = ''): string[] {
  const paths: string[] = [];
  for (const route of routes) {
    const path = [prefix, route.path ?? ''].filter(Boolean).join('/');
    const indexable =
      route.data?.['seoIndexable'] === true || route.resolve?.['seoIndexable'] !== undefined;
    // `/home` is indexable but canonicalises to `/`; it has no page of its own.
    if (indexable && path && !route.data?.['seoCanonicalPath']) paths.push(path);
    if (route.children) paths.push(...publicRoutePaths(route.children, path));
  }
  return [...new Set(paths)];
}

export function providePublicPageUrls(routes: Routes): Provider {
  return { provide: UrlSerializer, useFactory: () => new PublicPageUrlSerializer(routes) };
}

/**
 * `rel="nofollow"` on links from public pages into the app.
 *
 * App routes (`/login`, `/accounts/…`, `/tags/…`) have no prerendered file, so
 * a crawler gets the SPA fallback with a 404 status. Visitors still use these
 * links; search engines are asked not to follow them. Import it next to
 * `RouterLink` in public page components.
 */
@Directive({
  selector: 'a[routerLink]',
  host: { '[attr.rel]': 'rel()' },
})
export class AppOnlyLinkRel {
  private readonly link = inject(RouterLink, { self: true });
  private readonly serializer = inject(UrlSerializer);
  /** A link's own `rel` (`noopener` on a new-tab link) is kept. */
  private readonly ownRel = inject(new HostAttributeToken('rel'), { optional: true });
  /** The serializer gives every public page, and only those, a trailing slash. */
  protected rel(): string | null {
    const href = this.link.href;
    const own = this.ownRel || null;
    if (!href || !(this.serializer instanceof PublicPageUrlSerializer)) return own;
    if (href.split(/[?#]/)[0].endsWith('/')) return own;
    return own ? `${own} nofollow` : 'nofollow';
  }
}
