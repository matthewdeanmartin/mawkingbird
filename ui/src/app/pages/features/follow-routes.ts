import { ActivatedRouteSnapshot, ResolveFn, Routes } from '@angular/router';
import { FOLLOW_DESCRIPTION } from '../../seo';

// Only route metadata lives here. Kit data is imported lazily, by the resolvers
// and the pages, so the startup bundle never carries the starter-kit snapshots.
const kits = () => import('./follow-kits');
const kitSlug = (route: ActivatedRouteSnapshot) => route.paramMap.get('slug');

const kitTitle: ResolveFn<string> = async (route) =>
  (await kits()).publicKit(kitSlug(route))?.heading ?? 'Starter kit not found';
const kitDescription: ResolveFn<string> = async (route) =>
  (await kits()).publicKit(kitSlug(route))?.description ?? FOLLOW_DESCRIPTION;
const kitIndexable: ResolveFn<boolean> = async (route) =>
  !!(await kits()).publicKit(kitSlug(route));

export const followRoutes: Routes = [
  {
    path: 'follow',
    title: 'Who to follow on Mastodon: starter kits',
    data: { seoIndexable: true, seoDescription: FOLLOW_DESCRIPTION },
    loadComponent: () => import('./follow-hub').then((m) => m.FollowHub),
  },
  {
    path: 'follow/:slug',
    title: kitTitle,
    resolve: { seoDescription: kitDescription, seoIndexable: kitIndexable },
    loadComponent: () => import('./follow-kit').then((m) => m.FollowKit),
  },
];
