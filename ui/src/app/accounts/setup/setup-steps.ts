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

/**
 * The steps, in order (spec/new-account-setup.md § Steps). Ids are stable:
 * analytics reads them as paths, and saved progress records them.
 */
export const SETUP_STEPS: readonly SetupStep[] = [
  { id: 'welcome', title: 'Welcome to Mastodon', when: (ctx) => ctx.first },
  { id: 'purpose', title: 'What’s this account for?', when: always },
  { id: 'profile', title: 'Your profile', when: always },
  { id: 'languages', title: 'Your languages', when: (ctx) => ctx.first },
  { id: 'findable', title: 'Who can find you', when: always },
  {
    id: 'movers',
    title: 'Were you on Twitter or Bluesky?',
    when: (ctx) => ctx.purpose !== 'pseudonym',
  },
  {
    id: 'twitter',
    title: 'Find your Twitter people',
    when: (ctx) => ctx.purpose !== 'pseudonym' && ctx.movers === 'twitter',
  },
  {
    id: 'bluesky',
    title: 'Find your Bluesky people',
    when: (ctx) => ctx.purpose !== 'pseudonym' && ctx.movers === 'bluesky',
  },
  { id: 'follow', title: 'Fill your Home feed', when: always },
  { id: 'intro', title: 'Introduce yourself', when: always },
  { id: 'done', title: 'You’re all set', when: always },
];

export function setupStep(id: string): SetupStep | undefined {
  return SETUP_STEPS.find((step) => step.id === id);
}
