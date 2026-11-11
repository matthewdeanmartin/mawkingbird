import { Status } from './models';

/** Where a Home post comes from, relative to the signed-in Mastodon server. */
export type HomeOrigin = 'all' | 'local' | 'remote';

/**
 * Whether `status` passes the Home origin filter.
 *
 * Judged on the post actually shown (a boost's original), since that is what
 * "from this server" means to the reader. Mastodon gives local accounts a bare
 * `acct` (`alice`) and remote ones `alice@host`. Posts from other networks
 * (Bluesky, Misskey, RSS…) are never local.
 */
export function passesHomeOrigin(status: Status, origin: HomeOrigin): boolean {
  if (origin === 'all') return true;
  const shown = status.reblog ?? status;
  const local = !shown.provider && !!shown.account?.acct && !shown.account.acct.includes('@');
  return origin === 'local' ? local : !local;
}
