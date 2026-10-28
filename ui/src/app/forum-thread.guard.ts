import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppModeService } from './app-mode';

/**
 * Keep a post opened from Forum inside Forum.
 *
 * Posts link to `/statuses/:id` from everywhere (a card, a reply, the thread
 * reader), and that route belongs to Mastodon mode, so following one out of a
 * discussion swapped the Forum menu and rails for the timeline's. While Forum
 * is the current mode, the same post opens at `/forum/d/:id` instead: the same
 * thread page, with Forum's rails and its way back to the list.
 *
 * The mode is still the one being left when guards run (it follows
 * `NavigationEnd`), which is exactly the question: where is the reader coming
 * from. The query string (`?reader=`) is kept.
 */
export const forumThreadGuard: CanActivateFn = (route) => {
  if (inject(AppModeService).mode() !== 'forum') return true;
  const id = route.paramMap.get('id');
  if (!id) return true;
  return inject(Router).createUrlTree(['/forum/d', id], { queryParams: route.queryParams });
};
