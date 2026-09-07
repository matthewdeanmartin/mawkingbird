import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../../auth';
import { BotPeers } from '../../chat/bot-peers';

/** Redirect authenticated-only pages before their components can issue API calls. */
export const anonymousUnavailableGuard: CanActivateFn = (route) => {
  if (!inject(Auth).isAnonymous) {
    return true;
  }
  const feature = String(route.data?.['anonymousFeature'] ?? 'This feature');
  return inject(Router).createUrlTree(['/unavailable'], { queryParams: { feature } });
};

/**
 * Chat, which is only *partly* unavailable to an anonymous visitor.
 *
 * The Mastodon and Bluesky halves genuinely need an account. The bot half does
 * not: Eliza is browser-local, and an OpenRouter key is browser-scoped rather
 * than tied to a Mastodon identity — someone who has pasted one has paid for a
 * model and is entitled to talk to it whether or not they have signed in
 * anywhere. Turning them away with "no chat in anonymous mode" was simply
 * false.
 *
 * Still a guard rather than an open door, because the page can be genuinely
 * empty for an anonymous visitor: with AI features switched off there is no
 * bot, no account, and nothing the page could show.
 */
export const anonymousChatGuard: CanActivateFn = (route) => {
  if (!inject(Auth).isAnonymous) {
    return true;
  }
  if (inject(BotPeers).peers().length) {
    return true;
  }
  const feature = String(route.data?.['anonymousFeature'] ?? 'This feature');
  return inject(Router).createUrlTree(['/unavailable'], { queryParams: { feature } });
};
