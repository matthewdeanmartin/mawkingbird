/** Platform-specific invitation copy and pure share-intent helpers. */

export type InviteNetwork = 'x' | 'bluesky' | 'mastodon';

export interface InviteVariation {
  id: string;
  network: InviteNetwork;
  title: string;
  template: string;
}

export interface InviteContext {
  profileUrl: string;
  handle: string;
  /** Where a friend can start with Mastodon. Used by direct invitations. */
  visitUrl: string;
  /** This page, carrying the current server. Used only by Mastodon rally posts. */
  inviteUrl: string;
}

export const MAWKINGBIRD_URL = 'https://mawkingbird.com';
export const JOIN_MASTODON_URL = 'https://joinmastodon.org/servers';
export const INVITE_LIMITS: Record<InviteNetwork, number> = {
  x: 280,
  bluesky: 300,
  mastodon: 500,
};

const SIMPLE_COUNTS: Record<InviteNetwork, number> = {
  x: 2,
  bluesky: 2,
  mastodon: 4,
};

export function publicServerUrl(host = 'mastodon.social'): string {
  const clean = host.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'mastodon.social';
  return `https://${clean}`;
}

export function invitesPageUrl(host = 'mastodon.social'): string {
  const clean = host.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'mastodon.social';
  return `${MAWKINGBIRD_URL}/invites?${encodeURIComponent(clean)}`;
}

export function campaignTaggedUrl(
  url: string,
  options: { source: InviteNetwork; variationId: string },
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  parsed.searchParams.set('utm_source', options.source);
  parsed.searchParams.set('utm_medium', 'invite');
  parsed.searchParams.set('utm_campaign', options.variationId);
  return parsed.toString();
}

/** Fill tokens, dropping the whole line when an optional value is unavailable. */
export function renderInvite(template: string, context: InviteContext): string {
  const values: Record<string, string> = {
    profileUrl: context.profileUrl,
    handle: context.handle,
    visitUrl: context.visitUrl,
    inviteUrl: context.inviteUrl,
    mawkingbird: MAWKINGBIRD_URL,
  };
  return template
    .split('\n')
    .filter((line) => {
      const tokens = line.match(/\{(\w+)\}/g) ?? [];
      return tokens.every((token) => !!values[token.slice(1, -1)]);
    })
    .map((line) => line.replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function inviteIntentUrl(
  network: InviteNetwork,
  text: string,
  mastodonHost = 'mastodon.social',
): string {
  const base =
    network === 'x'
      ? 'https://x.com/intent/post'
      : network === 'bluesky'
        ? 'https://bsky.app/intent/compose'
        : `${publicServerUrl(mastodonHost)}/share`;
  const url = new URL(base);
  url.searchParams.set('text', text);
  return url.toString();
}

const X_INVITES: readonly InviteVariation[] = [
  {
    id: 'x-straightforward',
    network: 'x',
    title: 'Straightforward',
    template: `I’m on Mastodon! Come join me for social media built around communities instead of one central platform.

Find me here: {profileUrl}

Try it with {visitUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'x-try-first',
    network: 'x',
    title: 'Try before committing',
    template: `Curious about Mastodon but haven’t tried it yet? Mawkingbird makes it easy to explore and use Mastodon from the web.

{visitUrl}

#Mastodon #Fediverse #SocialMedia`,
  },
  {
    id: 'x-follow-me',
    network: 'x',
    title: 'Follow me',
    template: `I’d love to see more of my Twitter friends on Mastodon. It takes a couple of minutes to try.

Follow me at {profileUrl}

Start here: {visitUrl}

#Mastodon #JoinMastodon`,
  },
  {
    id: 'x-no-algorithm',
    network: 'x',
    title: 'No algorithm',
    template: `Want a social feed you control instead of one chosen entirely by an algorithm? Give Mastodon a try.

Start here: {visitUrl}

#Mastodon #Fediverse #OpenSocial`,
  },
  {
    id: 'x-community',
    network: 'x',
    title: 'Lots of small communities',
    template: `Mastodon is made of independent communities that can still talk to one another. It’s a different and surprisingly human way to use social media.

Come try it: {visitUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'x-friendly-migration',
    network: 'x',
    title: 'Friendly migration',
    template: `You don’t have to quit Twitter to try Mastodon. Make an account, follow a few people, and see whether you like it.

{visitUrl}

#TryMastodon #Fediverse`,
  },
  {
    id: 'x-open-web',
    network: 'x',
    title: 'The open web',
    template: `I’m spending more time on the open social web. Mastodon lets people pick their own community and still follow people everywhere else.

Join me: {profileUrl}

Or just start here: {visitUrl}

#Mastodon #OpenWeb`,
  },
  {
    id: 'x-low-pressure',
    network: 'x',
    title: 'Low pressure',
    template: `Friendly invitation: come say hello to me on Mastodon sometime.

My profile: {profileUrl}

You can try Mastodon through {visitUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'x-mawkingbird',
    network: 'x',
    title: 'About Mawkingbird',
    template: `Want to see what Mastodon is like? Try Mawkingbird, a web client for exploring and using the Fediverse.

{visitUrl}

#Mawkingbird #Mastodon #Fediverse`,
  },
  {
    id: 'x-bring-friends',
    network: 'x',
    title: 'Bring your friends',
    template: `Social networks get better when your friends are there. I’m inviting mine to join me on Mastodon.

Find me at {handle}
Get started at {visitUrl}

#JoinMastodon #Fediverse`,
  },
  {
    id: 'x-touch-grass',
    network: 'x',
    title: 'Real talk: touch grass',
    template: `Hey, I’ve invited you to Mastodon, to Bluesky, and that didn’t work. I’m now inviting you to go touch grass. Log out and upgrade your experience by leaving Twitter.

If you come back online: {visitUrl}`,
  },
];

const BLUESKY_INVITES: readonly InviteVariation[] = [
  {
    id: 'bsky-both-at-once',
    network: 'bluesky',
    title: 'Both at once',
    template: `Hey — some of your friends are over on Mastodon. You can hang out with both crowds in one timeline with Mawkingbird, and you don’t even have to sign up for an account.

{visitUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'bsky-no-signup',
    network: 'bluesky',
    title: 'No signup needed',
    template: `You can read Mastodon right now without making an account anywhere. Open this, look around, and leave if it’s not for you:

{visitUrl}

#Fediverse #Mastodon`,
  },
  {
    id: 'bsky-one-timeline',
    network: 'bluesky',
    title: 'One timeline',
    template: `I got tired of checking two apps, so now I read Bluesky and Mastodon in the same timeline. Mawkingbird does both, and Mastodon works without an account:

{visitUrl}

#Bluesky #Mastodon`,
  },
  {
    id: 'bsky-your-people',
    network: 'bluesky',
    title: 'Your people are there',
    template: `A surprising number of the people you used to follow are posting on Mastodon these days. No account needed to go see:

{visitUrl}

You’ll find me at {handle}

#Mastodon #Fediverse`,
  },
  {
    id: 'bsky-window-shop',
    network: 'bluesky',
    title: 'Just window shopping',
    template: `Not asking you to switch to anything. Mawkingbird will show you Mastodon with no account, no email, no signup — just have a look and see whether your people are there.

{visitUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'bsky-say-hello',
    network: 'bluesky',
    title: 'Come say hello',
    template: `Come say hello to me on the Mastodon side sometime — {profileUrl}

You can read it without signing up for anything: {visitUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'bsky-same-web',
    network: 'bluesky',
    title: 'Same open web',
    template: `Bluesky and Mastodon are both the open social web, and there’s no reason to pick just one. Mawkingbird reads both, and the Mastodon half needs no account at all:

{visitUrl}

#Bluesky #Mastodon #OpenWeb`,
  },
  {
    id: 'bsky-guest-pass',
    network: 'bluesky',
    title: 'Guest pass',
    template: `Consider this a guest pass to Mastodon: no account, no signup, just a public timeline you can read today. If you like it, then make an account.

{visitUrl}

#Mastodon #TryMastodon`,
  },
  {
    id: 'bsky-small-communities',
    network: 'bluesky',
    title: 'Small communities',
    template: `Mastodon’s small communities each have their own character, but they can all talk to one another. That is worth experiencing firsthand.

{visitUrl}

#Mastodon #OpenSocial`,
  },
  {
    id: 'bsky-follow-across',
    network: 'bluesky',
    title: 'Follow across servers',
    template: `On Mastodon, choosing a home server does not trap you there. You can follow people across the Fediverse from one account.

Try it: {visitUrl}

#Mastodon #Fediverse`,
  },
];

const MASTODON_RALLIES: readonly InviteVariation[] = [
  {
    id: 'mastodon-save-a-friend',
    network: 'mastodon',
    title: 'Save a friend',
    template: `Hey Mastodon users: got friends still on Twitter? Go save one. Pick an invitation, make it yours, and send it where they still post.

{inviteUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'mastodon-one-today',
    network: 'mastodon',
    title: 'Invite one today',
    template: `Mastodon gets better when our people are here. Invite one friend from another platform today — one thoughtful message beats a migration campaign.

{inviteUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'mastodon-personal-note',
    network: 'mastodon',
    title: 'Make it personal',
    template: `Know somebody who would like Mastodon? Send them a personal invitation where they already are. We made a few starting points you can edit.

{inviteUrl}

#JoinMastodon #Fediverse`,
  },
  {
    id: 'mastodon-network-effect',
    network: 'mastodon',
    title: 'The good network effect',
    template: `The best way to improve Mastodon is to bring good people into it. Think of one person you miss and invite them from whichever platform they use.

{inviteUrl}

#Mastodon #OpenSocial`,
  },
  {
    id: 'mastodon-twitter-friends',
    network: 'mastodon',
    title: 'Friends still on Twitter',
    template: `Some of our friends are still on Twitter because nobody asked them personally. This is your reminder to ask — kindly, directly, and without a lecture.

{inviteUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'mastodon-any-platform',
    network: 'mastodon',
    title: 'Invite from anywhere',
    template: `Your future Mastodon friends might be on Twitter, Bluesky, Threads, a group chat, or somewhere else. Meet them there and invite them in.

{inviteUrl}

#Mastodon #OpenWeb`,
  },
  {
    id: 'mastodon-house-party',
    network: 'mastodon',
    title: 'The house-party rule',
    template: `A social network is like a house party: if you want interesting people there, invite interesting people. Who are you bringing to Mastodon?

{inviteUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'mastodon-no-evangelism',
    network: 'mastodon',
    title: 'No evangelism required',
    template: `You do not need a manifesto to invite someone to Mastodon. “I think you’d like it here” plus a useful starting link is enough.

{inviteUrl}

#Mastodon #Fediverse`,
  },
  {
    id: 'mastodon-community-builder',
    network: 'mastodon',
    title: 'Community builder',
    template: `Communities do not grow by accident. If you value this one, invite somebody whose voice would make the wider Fediverse better.

{inviteUrl}

#Mastodon #Community`,
  },
  {
    id: 'mastodon-pass-it-on',
    network: 'mastodon',
    title: 'Pass it on',
    template: `Someone helped you find your way to Mastodon. Pass that favor on: reach outside the Fediverse and invite the next person in.

{inviteUrl}

#Mastodon #OpenSocial`,
  },
];

export const INVITE_VARIATIONS: readonly InviteVariation[] = [
  ...X_INVITES,
  ...BLUESKY_INVITES,
  ...MASTODON_RALLIES,
];

export function invitesFor(network: InviteNetwork, simple: boolean): readonly InviteVariation[] {
  const matches = INVITE_VARIATIONS.filter((invite) => invite.network === network);
  return simple ? matches.slice(0, SIMPLE_COUNTS[network]) : matches;
}
