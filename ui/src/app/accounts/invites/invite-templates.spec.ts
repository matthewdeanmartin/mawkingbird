import { describe, expect, it } from 'vitest';
import {
  campaignTaggedUrl,
  INVITE_LIMITS,
  INVITE_VARIATIONS,
  InviteContext,
  inviteIntentUrl,
  invitesFor,
  invitesPageUrl,
  JOIN_MASTODON_URL,
  publicServerUrl,
  renderInvite,
} from './invite-templates';

const CONTEXT: InviteContext = {
  profileUrl: 'https://example.social/@person',
  handle: '@person@example.social',
  visitUrl: JOIN_MASTODON_URL,
  inviteUrl: invitesPageUrl('example.social'),
};

describe('invitation inventory', () => {
  it('keeps the ten original Twitter choices plus the new advanced-only joke', () => {
    expect(invitesFor('x', false)).toHaveLength(11);
    expect(invitesFor('bluesky', false)).toHaveLength(10);
    expect(invitesFor('mastodon', false)).toHaveLength(10);
    expect(invitesFor('x', false).map((invite) => invite.id)).toEqual([
      'x-straightforward',
      'x-try-first',
      'x-follow-me',
      'x-no-algorithm',
      'x-community',
      'x-friendly-migration',
      'x-open-web',
      'x-low-pressure',
      'x-mawkingbird',
      'x-bring-friends',
      'x-touch-grass',
    ]);
  });

  it('keeps the eight original Bluesky choices before the two new additions', () => {
    expect(
      invitesFor('bluesky', false)
        .slice(0, 8)
        .map((invite) => invite.id),
    ).toEqual([
      'bsky-both-at-once',
      'bsky-no-signup',
      'bsky-one-timeline',
      'bsky-your-people',
      'bsky-window-shop',
      'bsky-say-hello',
      'bsky-same-web',
      'bsky-guest-pass',
    ]);
  });

  it('reduces direct invitations to two and Mastodon rally posts to four in simple mode', () => {
    expect(invitesFor('x', true)).toHaveLength(2);
    expect(invitesFor('bluesky', true)).toHaveLength(2);
    expect(invitesFor('mastodon', true)).toHaveLength(4);
  });

  it('uses distinct copy for each platform', () => {
    const x = new Set(invitesFor('x', false).map((invite) => invite.template));
    const bluesky = new Set(invitesFor('bluesky', false).map((invite) => invite.template));
    const mastodon = new Set(invitesFor('mastodon', false).map((invite) => invite.template));

    expect([...x].some((template) => bluesky.has(template) || mastodon.has(template))).toBe(false);
    expect([...bluesky].some((template) => mastodon.has(template))).toBe(false);
  });

  it('keeps direct and rally calls to action separate', () => {
    for (const invite of invitesFor('mastodon', false)) {
      expect(invite.template, invite.id).toContain('{inviteUrl}');
      expect(invite.template, invite.id).not.toContain('{visitUrl}');
    }
    for (const invite of [...invitesFor('x', false), ...invitesFor('bluesky', false)]) {
      expect(invite.template, invite.id).not.toContain('{inviteUrl}');
    }
  });

  it('keeps every default rendering inside its platform limit', () => {
    for (const invite of INVITE_VARIATIONS) {
      const text = renderInvite(invite.template, CONTEXT);
      expect(Array.from(text).length, invite.id).toBeLessThanOrEqual(INVITE_LIMITS[invite.network]);
    }
  });
});

describe('renderInvite', () => {
  it('drops whole lines for unavailable optional values', () => {
    const text = renderInvite('Hello\nMe: {profileUrl}\nStart: {visitUrl}', {
      ...CONTEXT,
      profileUrl: '',
    });
    expect(text).toBe(`Hello\nStart: ${JOIN_MASTODON_URL}`);
  });
});

describe('URLs and share intents', () => {
  it('carries the selected Anonymous server in a bare query key', () => {
    expect(invitesPageUrl('https://hachyderm.io/')).toBe(
      'https://mawkingbird.com/invites?hachyderm.io',
    );
  });

  it('normalizes a server to its public homepage', () => {
    expect(publicServerUrl('https://mstdn.social/')).toBe('https://mstdn.social');
  });

  it('opens the correct composer for all three platforms', () => {
    expect(inviteIntentUrl('x', 'hello')).toContain('https://x.com/intent/post?text=hello');
    expect(inviteIntentUrl('bluesky', 'hello')).toContain(
      'https://bsky.app/intent/compose?text=hello',
    );
    expect(inviteIntentUrl('mastodon', 'hello', 'mstdn.social')).toContain(
      'https://mstdn.social/share?text=hello',
    );
  });

  it('tags links for the chosen platform and wording', () => {
    const tagged = new URL(
      campaignTaggedUrl(JOIN_MASTODON_URL, { source: 'bluesky', variationId: 'open-web' }),
    );
    expect(tagged.searchParams.get('utm_source')).toBe('bluesky');
    expect(tagged.searchParams.get('utm_medium')).toBe('invite');
    expect(tagged.searchParams.get('utm_campaign')).toBe('open-web');
  });
});
