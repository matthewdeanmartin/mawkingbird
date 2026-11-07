import { SITE_ORIGIN } from './seo';

/** One step of a public page's trail, from the front page down. `path` has no slashes at either end. */
export interface Crumb {
  name: string;
  path: string;
}

/**
 * schema.org BreadcrumbList for a public page's `breadcrumb` property. Search
 * engines can show the trail in place of the URL. Addresses carry the trailing
 * slash of the published page (see public-page-urls.ts).
 */
export function breadcrumbList(crumbs: readonly Crumb[]): object {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${SITE_ORIGIN}/${crumb.path ? `${crumb.path}/` : ''}`,
    })),
  };
}
