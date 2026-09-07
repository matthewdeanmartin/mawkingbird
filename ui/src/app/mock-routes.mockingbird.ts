import { Routes } from '@angular/router';

/** Mocking Bird has no mock-server control plane: no mock-only routes. */
export const mockOnlyChildren: Routes = [];

/**
 * No mock-only settings pages either.
 *
 * Deletion, Account, Email notifications, Invites and Development all drive the
 * mock server's `_mock/*` endpoints, which no real Mastodon instance serves.
 * Leaving them routable would give a direct URL a page that cannot work; absent,
 * it falls through to the ordinary not-found route.
 */
export const mockOnlySettingsChildren: Routes = [];
