import { Routes } from '@angular/router';
import { featureFlagGuard } from '../platform/build/feature-flag.guard';

/**
 * The `/m/` screens. Each is a thin page in `lite-pages.ts` (sharing one chunk
 * with the status card), except Write (the full app's blog-style writer) and
 * the media players, which are heavier and load only when opened. `npm run bundle:report -- --check` holds
 * these routes to the Lite budget (scripts/report-bundle.mjs).
 */
export const LITE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    title: 'Home',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteHome),
  },
  {
    path: 'notifications',
    title: 'Notifications',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteNotifications),
  },
  {
    path: 'statuses/:id',
    title: 'Thread',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteThread),
  },
  {
    path: 'accounts/:id/:handle',
    title: 'Profile',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteProfile),
  },
  {
    path: 'accounts/:id',
    title: 'Profile',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteProfile),
  },
  {
    path: 'search',
    title: 'Search',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteSearch),
  },
  {
    path: 'tags/:tag',
    title: 'Hashtag',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteTag),
  },
  {
    path: 'lists',
    title: 'Lists',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteLists),
  },
  {
    path: 'lists/:id',
    title: 'List',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteListTimeline),
  },
  {
    path: 'bookmarks',
    title: 'Bookmarks',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteBookmarks),
  },
  {
    path: 'conversations',
    title: 'Direct messages',
    loadComponent: () => import('./lite-pages').then((m) => m.LiteConversations),
  },
  {
    // The full app's blog-style writer, unchanged; the quick composer is on Lite Home.
    path: 'write',
    title: 'Write',
    canDeactivate: [(page: { canLeave: () => boolean | Promise<boolean> }) => page.canLeave()],
    canActivate: [featureFlagGuard],
    data: { featureFlag: 'write' },
    loadComponent: () => import('../publishing/write/write-page').then((m) => m.WritePage),
  },
  { path: 'compose', redirectTo: 'write' },
  {
    // Posts written offline, shown with Lite's chrome (the full app's page, unchanged).
    path: 'outbox',
    title: 'Outbox',
    loadComponent: () => import('../publishing/outbox/outbox-page').then((m) => m.OutboxPage),
  },
  {
    path: 'radio',
    title: 'Radio',
    loadComponent: () => import('./lite-media').then((m) => m.LiteRadio),
  },
  {
    path: 'videos',
    title: 'Videos',
    loadComponent: () => import('./lite-media').then((m) => m.LiteVideos),
  },
  { path: '**', redirectTo: 'home' },
];
