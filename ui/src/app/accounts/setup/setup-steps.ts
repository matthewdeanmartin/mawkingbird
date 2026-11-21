import type { SetupMovers, SetupPurpose } from './setup-store';

/*
 * Account setup copy is deliberately English-only until the whole feature
 * settles (owner, 2026-11-18). Do not add `// i18n` keys here, and do not add
 * this directory to MIGRATED in scripts/check-i18n.mjs.
 */

/** What a step's visibility depends on. */
export interface SetupContext {
  /** No other account is signed in on this browser. */
  first: boolean;
  /** The new account's network. Absent means Mastodon, setup's original case. */
  network?: 'mastodon' | 'bluesky';
  purpose?: SetupPurpose;
  movers?: SetupMovers;
}

export interface SetupStep {
  /** Stable: the route segment and the GoatCounter path (`/setup/<id>`). */
  id: string;
  title: string;
  when(ctx: SetupContext): boolean;
}

const always = (): boolean => true;
const bluesky = (ctx: SetupContext): boolean => ctx.network === 'bluesky';
const mastodon = (ctx: SetupContext): boolean => !bluesky(ctx);

/**
 * The steps, in order (spec/new-account-setup.md § Steps). Ids are stable:
 * analytics reads them as paths, and saved progress records them.
 */
export const SETUP_STEPS: readonly SetupStep[] = [
  { id: 'welcome', title: 'Welcome to Mastodon', when: (ctx) => mastodon(ctx) && ctx.first },
  // A new Bluesky account (spec/bsky_parity.md, sprint 2) gets its own short
  // run: Bluesky has no server settings to choose, and its people come from
  // Bluesky's suggestions rather than the Mastodon starter kits.
  { id: 'welcome-bluesky', title: 'Welcome to Bluesky', when: (ctx) => bluesky(ctx) && ctx.first },
  { id: 'purpose', title: 'What’s this account for?', when: mastodon },
  { id: 'profile', title: 'Your profile', when: mastodon },
  { id: 'profile-bluesky', title: 'Your profile', when: bluesky },
  { id: 'languages', title: 'Your languages', when: (ctx) => mastodon(ctx) && ctx.first },
  { id: 'findable', title: 'Who can find you', when: mastodon },
  {
    id: 'movers',
    title: 'Were you on Twitter or Bluesky?',
    when: (ctx) => mastodon(ctx) && ctx.purpose !== 'pseudonym',
  },
  {
    id: 'twitter',
    title: 'Find your Twitter people',
    when: (ctx) => mastodon(ctx) && ctx.purpose !== 'pseudonym' && ctx.movers === 'twitter',
  },
  {
    id: 'bluesky',
    title: 'Find your Bluesky people',
    when: (ctx) => mastodon(ctx) && ctx.purpose !== 'pseudonym' && ctx.movers === 'bluesky',
  },
  { id: 'follow', title: 'Fill your Home feed', when: mastodon },
  { id: 'follow-bluesky', title: 'Fill your Home feed', when: bluesky },
  { id: 'intro', title: 'Introduce yourself', when: mastodon },
  { id: 'intro-bluesky', title: 'Introduce yourself', when: bluesky },
  { id: 'done', title: 'You’re all set', when: always },
];

export function setupStep(id: string): SetupStep | undefined {
  return SETUP_STEPS.find((step) => step.id === id);
}
