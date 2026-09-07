import { Routes } from '@angular/router';
import { anonymousUnavailableGuard } from './providers/anonymous/anonymous-route.guard';

/**
 * Routes that only make sense against the mock server (its `_mock/*` control plane).
 *
 * In the standalone "Mocking Bird" build this whole file is replaced by
 * `mock-routes.mockingbird.ts` (empty arrays), via the `mockingbird` configuration's
 * `fileReplacements` in angular.json. Replacing the file -- rather than guarding with
 * a runtime flag -- ensures the lazy `import()` literals below are not present in the
 * Mocking Bird source, so their chunks are never emitted and the `_mock` URLs they
 * reach never ship.
 */

/**
 * Settings pages that only work against the mock server's `_mock/*` control plane.
 *
 * Spliced into the settings children here and absent from Mocking Bird's build, so
 * a direct URL there falls through to the ordinary not-found route rather than
 * loading a page whose every request 404s. `settings-shell` already hides these
 * nav entries off-mock (`mockOnly: true`); removing the routes as well is what
 * takes their lazy chunks and `_mock` URLs out of the shipped client.
 *
 * Appearance deliberately stays in `app.routes.ts`: it is theme and accent in
 * localStorage, works against any instance, and hides its own server-backed rows.
 */
export const mockOnlySettingsChildren: Routes = [
  {
    path: 'deletion',
    title: 'Delete account',
    canActivate: [anonymousUnavailableGuard],
    data: { anonymousFeature: 'Automatic post deletion', preloadSettings: true },
    loadComponent: () =>
      import('./pages/settings/deletion/settings-deletion').then((m) => m.SettingsDeletion),
  },
  {
    path: 'account',
    title: 'Account',
    canActivate: [anonymousUnavailableGuard],
    data: { anonymousFeature: 'Account settings', preloadSettings: true },
    loadComponent: () =>
      import('./pages/settings/account/settings-account').then((m) => m.SettingsAccount),
  },
  {
    path: 'notifications',
    title: 'Inbox',
    canActivate: [anonymousUnavailableGuard],
    data: { anonymousFeature: 'Email notifications', preloadSettings: true },
    loadComponent: () =>
      import('./pages/settings/notifications/settings-notifications').then(
        (m) => m.SettingsNotifications,
      ),
  },
  {
    path: 'invites',
    title: 'Invites',
    canActivate: [anonymousUnavailableGuard],
    data: { anonymousFeature: 'Invites', preloadSettings: true },
    loadComponent: () =>
      import('./pages/settings/invites/settings-invites').then((m) => m.SettingsInvites),
  },
  {
    path: 'development',
    title: 'Development',
    canActivate: [anonymousUnavailableGuard],
    data: { anonymousFeature: 'Development settings', preloadSettings: true },
    loadComponent: () =>
      import('./pages/settings/development/settings-development').then(
        (m) => m.SettingsDevelopment,
      ),
  },
];

export const mockOnlyChildren: Routes = [
  {
    path: 'dev/faults',
    loadComponent: () =>
      import('./pages/fault-injection/fault-injection').then((m) => m.FaultInjection),
  },
];
