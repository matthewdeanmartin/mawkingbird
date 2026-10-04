import { Signal } from '@angular/core';
import { Auth } from '../auth';
import { ACCENT_PRESETS, ClientPrefs, POST_NOUNS, PostNoun } from '../client-prefs';
import { FeatureFlags } from '../feature-flags';
import { LOCALE_ENDONYMS, UiLocale } from '../i18n/locale';
import { LANG_NAMES, LangCode } from '../language-detect';
import { ProviderId } from '../models';
import { visiblePlusBenefits } from '../plus-benefits';
import { SupporterStatus } from '../providers/account/supporter-status';
import { AnonymousFollows } from '../providers/anonymous/anonymous-follows';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { MastodonConnector } from '../providers/mastodon/mastodon-connector';
import { Pseudonymity } from '../pseudonymity';
import { KnownLanguages } from '../trend-language-filter';
import { TrustedAccounts, TrustLevel } from '../trusted-accounts';

/*
 * ENGLISH ONLY, ON PURPOSE.
 *
 * The onboarding wizard is still evolving and may be rewritten or dropped, so
 * its copy is plain English rather than transloco keys. This directory is not
 * in `MIGRATED` in scripts/check-i18n.mjs; when that list inverts to an EXEMPT
 * list (ui-i18n-5), `onboarding` must be added there until the wizard settles.
 * See spec/onboarding-wizard.md.
 *
 * Copy rules: one short question, at most two short sentences of help, no
 * implementation words.
 */

/** A value a card holds. Compared by JSON, so arrays compare by content. */
export type OnboardingValue = string | boolean | string[];

/**
 * Where an answer is stored. `app` is shared by every account in this browser,
 * `account` belongs to the active account, `server` is written to Mastodon.
 */
export type OnboardingScope = 'app' | 'account' | 'server';

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

export type OnboardingControl =
  | { kind: 'choice'; options: (ctx: OnboardingContext) => ChoiceOption[] }
  | { kind: 'multi'; options: (ctx: OnboardingContext) => ChoiceOption[]; extra?: 'learning' }
  | { kind: 'toggle'; label: string }
  | { kind: 'accent' }
  | { kind: 'action'; label: string; route: string }
  | { kind: 'plus' };

/** The Mastodon account settings some cards write, loaded once on demand. */
export interface ServerSettings {
  locked: boolean;
  discoverable: boolean;
  privacy: string;
  language: string;
}

export type ServerField = keyof ServerSettings;

export interface OnboardingServer {
  /** Null until loaded, and for accounts without a Mastodon server. */
  readonly state: Signal<ServerSettings | null>;
  write(field: ServerField, value: boolean | string): Promise<void>;
}

/** Everything a question may read or change. */
export interface OnboardingContext {
  auth: Auth;
  prefs: ClientPrefs;
  pseudonymity: Pseudonymity;
  trust: TrustedAccounts;
  flags: FeatureFlags;
  bsky: BlueskySession;
  connector: MastodonConnector;
  anonFollows: AnonymousFollows;
  supporter: SupporterStatus;
  locale: UiLocale;
  known: KnownLanguages;
  server: OnboardingServer;
  /** Set by the "I'm learning a language" link on the languages card. */
  wantsLearning: Signal<boolean>;
}

export interface OnboardingQuestion {
  id: string;
  scope: OnboardingScope;
  title: (ctx: OnboardingContext) => string;
  help?: (ctx: OnboardingContext) => string;
  control: OnboardingControl;
  /** Whether the card applies right now. Re-evaluated as answers change. */
  when: (ctx: OnboardingContext) => boolean;
  /** The setting as it is now. Action cards have none. */
  read?: (ctx: OnboardingContext) => OnboardingValue;
  /** A better starting selection than {@link read}, applied if the user presses Next. */
  suggest?: (ctx: OnboardingContext) => OnboardingValue;
  /** Make the setting take effect. May be async for server settings. */
  apply?: (ctx: OnboardingContext, value: OnboardingValue) => void | Promise<void>;
}

const text = (value: string) => () => value;

/** Languages offered as chips, in the same order as Settings → Internationalization. */
const PICKER_ORDER: LangCode[] = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'nl',
  'sv',
  'da',
  'no',
  'fi',
  'pl',
  'tr',
  'ru',
  'uk',
  'el',
  'ja',
  'ko',
  'zh',
  'ar',
  'he',
  'hi',
  'th',
  'eo',
  'is',
];

const bare = (code: string) => code.toLowerCase().split(/[-_]/)[0];

function languageName(code: string): string {
  return (LANG_NAMES as Record<string, string>)[code] ?? code.toUpperCase();
}

function languageOptions(codes: Iterable<string>): ChoiceOption[] {
  const seen = new Set<string>();
  const out: ChoiceOption[] = [];
  for (const code of codes) {
    const c = bare(code);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push({ value: c, label: languageName(c) });
  }
  return out;
}

/** The languages the reader has told us they read. */
function known(ctx: OnboardingContext): string[] {
  return ctx.prefs.knownLanguages();
}

function readsBeyondInterface(ctx: OnboardingContext): boolean {
  const ui = bare(ctx.locale.active());
  return known(ctx).some((code) => bare(code) !== ui);
}

const isMastodon = (ctx: OnboardingContext) => ctx.auth.kind() === 'mastodon';
const hasServer = (ctx: OnboardingContext) => isMastodon(ctx) && ctx.server.state() !== null;
const isPseudonymous = (ctx: OnboardingContext) => ctx.pseudonymity.enabled();
const pseudonymousEligible = (ctx: OnboardingContext) =>
  ctx.auth.kind() === 'mastodon' || ctx.auth.kind() === 'bluesky';

type PostingPace = 'now' | 'confirm' | 'delay' | 'drafts';

/** Home feed sources a new account may actually have. */
function feedSources(ctx: OnboardingContext): ChoiceOption[] {
  const out: ChoiceOption[] = [];
  if (ctx.auth.kind() === 'mastodon') out.push({ value: 'mastodon', label: 'Mastodon' });
  if (ctx.auth.isAnonymous) out.push({ value: 'anonymous-mastodon', label: 'Mastodon' });
  if (ctx.bsky.linked()) out.push({ value: 'bluesky', label: 'Bluesky' });
  return out;
}

/** Which network the connect card offers, if any. */
function connectTarget(ctx: OnboardingContext): 'Bluesky' | 'Mastodon' | null {
  if (ctx.auth.isBlueskyPrimary) {
    return !ctx.connector.optedIn() && ctx.flags.enabled('connector-mastodon') ? 'Mastodon' : null;
  }
  return !ctx.bsky.linked() && ctx.flags.enabled('connector-bluesky') ? 'Bluesky' : null;
}

function followsNobody(ctx: OnboardingContext): boolean {
  if (ctx.auth.isAnonymous) return ctx.anonFollows.count() === 0;
  return ctx.auth.account()?.following_count === 0;
}

const NOUN_LABELS: Partial<Record<PostNoun, string>> = {
  post: 'Post',
  toot: 'Toot',
  skeet: 'Skeet',
  tweet: 'Tweet',
  florp: 'Florp',
};

/**
 * The questions, in the order they are asked.
 *
 * Pseudonymity leads because it is the one answer that must take effect before
 * anything is posted. App-wide sections follow, then the rest of the account,
 * then Plus.
 */
export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  // --- Identity and safety -------------------------------------------------
  {
    id: 'pseudonymous',
    scope: 'account',
    title: text('Is this a pseudonymous account?'),
    help: text("A name that isn't linked to your real identity. We'll help keep it that way."),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    when: pseudonymousEligible,
    read: (ctx) => (ctx.pseudonymity.enabled() ? 'yes' : 'no'),
    apply: (ctx, value) => ctx.pseudonymity.setEnabled(value === 'yes'),
  },
  {
    id: 'pa-locked',
    scope: 'server',
    title: text('Approve new followers yourself?'),
    help: text(
      'Approval gives you control over followers, but each new follower has to wait for you.',
    ),
    control: { kind: 'toggle', label: 'Approve followers' },
    when: (ctx) => hasServer(ctx) && isPseudonymous(ctx),
    read: (ctx) => ctx.server.state()?.locked ?? false,
    suggest: () => true,
    apply: (ctx, value) => ctx.server.write('locked', value === true),
  },
  {
    id: 'pa-discoverable',
    scope: 'server',
    title: text('Keep this account out of suggestions and trends?'),
    help: text('Less exposure, but people have fewer ways to discover you.'),
    control: { kind: 'toggle', label: 'Keep me out' },
    when: (ctx) => hasServer(ctx) && isPseudonymous(ctx),
    read: (ctx) => !(ctx.server.state()?.discoverable ?? false),
    suggest: () => true,
    apply: (ctx, value) => ctx.server.write('discoverable', value !== true),
  },
  {
    id: 'pa-clean',
    scope: 'account',
    title: text('Strip hidden details from links and photos you post?'),
    help: text(
      'Share fewer hidden details, but cleaned links can lose referral information and photos lose location data.',
    ),
    control: { kind: 'toggle', label: 'Strip hidden details' },
    when: (ctx) => pseudonymousEligible(ctx) && isPseudonymous(ctx),
    read: (ctx) => ctx.pseudonymity.cleanLinks() && ctx.pseudonymity.cleanMedia(),
    apply: (ctx, value) => {
      ctx.pseudonymity.setCleanLinks(value === true);
      ctx.pseudonymity.setCleanMedia(value === true);
    },
  },
  {
    id: 'pa-reminder',
    scope: 'account',
    title: text('Remind you before each post?'),
    help: text(
      "Check that you're posting as the right person, with an extra step before each post.",
    ),
    control: { kind: 'toggle', label: 'Remind me' },
    when: (ctx) => pseudonymousEligible(ctx) && isPseudonymous(ctx),
    read: (ctx) => ctx.pseudonymity.reminder(),
    apply: (ctx, value) => ctx.pseudonymity.setReminder(value === true),
  },

  // --- Look and feel -------------------------------------------------------
  {
    id: 'theme',
    scope: 'app',
    title: text('Light or dark?'),
    help: text('Automatic follows your device.'),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'auto', label: 'Automatic' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    },
    when: () => true,
    read: (ctx) => ctx.prefs.themeMode(),
    apply: (ctx, value) => ctx.prefs.setThemeMode(value as 'auto' | 'light' | 'dark'),
  },
  {
    id: 'accent',
    scope: 'app',
    title: text('Pick a colour.'),
    control: { kind: 'accent' },
    when: () => true,
    read: (ctx) => ctx.prefs.accentId(),
    apply: (ctx, value) => ctx.prefs.setAccent(String(value)),
  },
  {
    id: 'images',
    scope: 'app',
    title: text('Show pictures in your feed?'),
    help: text(
      'Pictures give visual context; text-only keeps the feed quieter with an icon and description.',
    ),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'show', label: 'Show pictures' },
        { value: 'text', label: 'Text-only' },
      ],
    },
    when: () => true,
    read: (ctx) => (ctx.prefs.showImages() ? 'show' : 'text'),
    apply: (ctx, value) => ctx.prefs.setShowImages(value === 'show'),
  },
  {
    id: 'likes',
    scope: 'app',
    title: text('Stars or hearts?'),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'star', label: '⭐ Stars' },
        { value: 'heart', label: '❤️ Hearts' },
      ],
    },
    when: () => true,
    read: (ctx) => ctx.prefs.favStyle(),
    apply: (ctx, value) => ctx.prefs.setFavStyle(value as 'star' | 'heart'),
  },
  {
    id: 'post-noun',
    scope: 'app',
    title: text('What do you call a post?'),
    help: text('Just a word. Change it any time.'),
    control: {
      kind: 'choice',
      options: () =>
        POST_NOUNS.filter((noun) => noun !== 'custom' && NOUN_LABELS[noun]).map((noun) => ({
          value: noun,
          label: NOUN_LABELS[noun] as string,
        })),
    },
    when: () => true,
    read: (ctx) => ctx.prefs.postNoun(),
    apply: (ctx, value) => ctx.prefs.setPostNoun(value as PostNoun),
  },
  {
    id: 'zen',
    scope: 'app',
    title: text('Would you like Zen mode?'),
    help: text(
      'Less visual clutter, with side panels tucked away. More features live behind menus instead of staying in view.',
    ),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'zen', label: 'Zen mode', hint: 'Less clutter; open menus for more features.' },
        { value: 'full', label: 'Keep features in view', hint: 'More shortcuts; more on screen.' },
      ],
    },
    when: () => true,
    read: (ctx) => (ctx.prefs.zenMode() ? 'zen' : 'full'),
    apply: (ctx, value) => ctx.prefs.setZenMode(value === 'zen'),
  },

  // --- Languages -----------------------------------------------------------
  {
    id: 'languages',
    scope: 'app',
    title: text('Which languages do you read?'),
    control: {
      kind: 'multi',
      extra: 'learning',
      options: (ctx) => languageOptions([...known(ctx), ...ctx.known.codes(), ...PICKER_ORDER]),
    },
    when: () => true,
    read: (ctx) => known(ctx),
    // Start from what the browser already says, so most people just press Next.
    suggest: (ctx) =>
      known(ctx).length ? known(ctx) : languageOptions(ctx.known.codes()).map((o) => o.value),
    apply: (ctx, value) => ctx.prefs.setKnownLanguages(value as string[]),
  },
  {
    id: 'ui-language',
    scope: 'app',
    title: text('Use Mawkingbird in another language?'),
    help: text('This changes the menus and buttons, not the posts.'),
    control: {
      kind: 'choice',
      options: (ctx) => [
        { value: '', label: 'Same as my device' },
        ...ctx.locale.available.map((code) => ({
          value: code,
          label: LOCALE_ENDONYMS[code] ?? code,
        })),
      ],
    },
    when: (ctx) => ctx.locale.hasChoice && readsBeyondInterface(ctx),
    read: (ctx) => ctx.prefs.uiLocale() ?? '',
    apply: (ctx, value) => ctx.prefs.uiLocale.set(value ? String(value) : null),
  },
  {
    id: 'hide-foreign',
    scope: 'app',
    title: text("Hide posts in languages you don't read?"),
    help: text('A more readable feed, but fewer chances to discover posts you could translate.'),
    control: { kind: 'toggle', label: 'Hide them' },
    when: () => true,
    read: (ctx) => ctx.prefs.hideForeignLangPosts(),
    apply: (ctx, value) => ctx.prefs.setHideForeignLangPosts(value === true),
  },
  {
    id: 'learning',
    scope: 'app',
    title: text('Learning a language?'),
    help: text("Pick any you're learning. We'll never hide posts in them."),
    control: {
      kind: 'multi',
      options: (ctx) => languageOptions([...ctx.prefs.learningLanguages(), ...PICKER_ORDER]),
    },
    when: (ctx) =>
      known(ctx).length >= 2 || ctx.prefs.learningLanguages().length > 0 || ctx.wantsLearning(),
    read: (ctx) => ctx.prefs.learningLanguages(),
    apply: (ctx, value) => {
      const next = value as string[];
      // Learning a language means not knowing it yet; keep the two lists apart.
      ctx.prefs.setKnownLanguages(known(ctx).filter((code) => !next.includes(bare(code))));
      ctx.prefs.setLearningLanguages(next);
    },
  },
  {
    id: 'learning-help',
    scope: 'app',
    title: (ctx) => {
      const langs = ctx.prefs.learningLanguages();
      return langs.length === 1
        ? `Add a translation under posts in ${languageName(langs[0])}?`
        : 'Add a translation under posts in these languages?';
    },
    help: text(
      'Translations help with unfamiliar words, but add more text and make it easier to skip practising.',
    ),
    control: {
      kind: 'multi',
      options: (ctx) => languageOptions(ctx.prefs.learningLanguages().slice(0, 3)),
    },
    when: (ctx) => ctx.prefs.learningLanguages().length > 0,
    read: (ctx) =>
      ctx.prefs
        .learningLanguages()
        .slice(0, 3)
        .filter((code) => ctx.prefs.appendsTranslation(code)),
    apply: (ctx, value) => {
      const on = value as string[];
      for (const code of ctx.prefs.learningLanguages().slice(0, 3)) {
        ctx.prefs.setAppendTranslation(code, on.includes(code));
      }
    },
  },
  {
    id: 'auto-translate',
    scope: 'app',
    title: text('When would you like translations?'),
    help: text(
      'Automatic translation saves taps but replaces the original text. On demand keeps the original until you ask.',
    ),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'off', label: 'When I ask' },
        { value: 'view', label: 'As they appear' },
        { value: 'hover', label: 'When I point at them' },
      ],
    },
    when: (ctx) => readsBeyondInterface(ctx) || ctx.prefs.learningLanguages().length > 0,
    read: (ctx) => ctx.prefs.autoTranslateMode(),
    apply: (ctx, value) => ctx.prefs.setAutoTranslateMode(value as 'off' | 'view' | 'hover'),
  },

  // --- Reading and posting -------------------------------------------------
  {
    id: 'auto-refresh',
    scope: 'app',
    title: text('Load new posts on their own?'),
    help: text(
      'Automatic refresh brings in the latest posts; manual refresh keeps the feed steady while you read.',
    ),
    control: { kind: 'toggle', label: 'Load new posts automatically' },
    when: () => true,
    read: (ctx) => ctx.prefs.autoRefreshTimeline(),
    apply: (ctx, value) => ctx.prefs.setAutoRefreshTimeline(value === true),
  },
  {
    id: 'posting-pace',
    scope: 'app',
    title: text('How would you like to send posts?'),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'now', label: 'Post right away' },
        { value: 'confirm', label: 'Ask "are you sure?"' },
        { value: 'delay', label: 'Wait 30 seconds so I can cancel' },
        { value: 'drafts', label: 'Save to drafts first' },
      ],
    },
    when: () => true,
    // Strongest wins when more than one is on today.
    read: (ctx): PostingPace =>
      ctx.prefs.thoughtfulPosting()
        ? 'drafts'
        : ctx.prefs.delayedSend()
          ? 'delay'
          : ctx.prefs.confirmBeforePost()
            ? 'confirm'
            : 'now',
    apply: (ctx, value) => {
      ctx.prefs.setThoughtfulPosting(value === 'drafts');
      ctx.prefs.setDelayedSend(value === 'delay');
      ctx.prefs.setConfirmBeforePost(value === 'confirm');
    },
  },
  {
    id: 'alt-text',
    scope: 'app',
    title: text('Require a description on every image?'),
    help: text(
      'Descriptions make images accessible; requiring them means you must add one before posting.',
    ),
    control: { kind: 'toggle', label: 'Require descriptions' },
    when: () => true,
    read: (ctx) => ctx.prefs.requireAltText(),
    apply: (ctx, value) => ctx.prefs.setRequireAltText(value === true),
  },

  // --- The rest of this account --------------------------------------------
  {
    id: 'visibility',
    scope: 'server',
    title: text('Who sees your posts by default?'),
    help: text('You can change it on each post.'),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'public', label: 'Public' },
        { value: 'unlisted', label: 'Quiet public' },
        { value: 'private', label: 'Followers only' },
      ],
    },
    when: hasServer,
    read: (ctx) => ctx.server.state()?.privacy ?? 'public',
    suggest: (ctx) => {
      const current = ctx.server.state()?.privacy ?? 'public';
      return isPseudonymous(ctx) && current === 'public' ? 'private' : current;
    },
    apply: (ctx, value) => ctx.server.write('privacy', String(value)),
  },
  {
    id: 'post-language',
    scope: 'server',
    title: text('What language do you usually post in?'),
    control: { kind: 'choice', options: (ctx) => languageOptions(known(ctx)) },
    when: (ctx) => hasServer(ctx) && known(ctx).length >= 2,
    read: (ctx) => bare(ctx.server.state()?.language ?? ''),
    apply: (ctx, value) => ctx.server.write('language', String(value)),
  },
  {
    id: 'content-warnings',
    scope: 'account',
    title: text('Open content warnings for people you follow?'),
    help: text(
      'Opening warnings saves taps, but shows sensitive content straight away. Warnings from strangers stay closed.',
    ),
    control: {
      kind: 'choice',
      options: () => [
        { value: 'individuals', label: 'Only people I pick' },
        { value: 'follows', label: 'Everyone I follow' },
        { value: 'follows-boosts', label: 'Everyone I follow, and what they boost' },
        { value: 'none', label: 'Keep them all closed' },
      ],
    },
    when: () => true,
    read: (ctx) => ctx.trust.level(),
    apply: (ctx, value) => ctx.trust.setLevel(value as TrustLevel),
  },
  {
    id: 'networks',
    scope: 'account',
    title: text('Which networks go in your Home feed?'),
    control: { kind: 'multi', options: feedSources },
    when: (ctx) => feedSources(ctx).length >= 2,
    read: (ctx) =>
      feedSources(ctx)
        .map((o) => o.value)
        .filter((id) => ctx.prefs.isProviderVisible(id as ProviderId)),
    apply: (ctx, value) => {
      const on = value as string[];
      for (const { value: id } of feedSources(ctx)) {
        if (ctx.prefs.isProviderVisible(id as ProviderId) !== on.includes(id)) {
          ctx.prefs.toggleProvider(id as ProviderId);
        }
      }
    },
  },
  {
    id: 'connect',
    scope: 'account',
    title: (ctx) => `Also read ${connectTarget(ctx) ?? 'another network'} here?`,
    help: text('Read both networks together, with more variety and a busier feed.'),
    control: { kind: 'action', label: 'Connect', route: '/settings/connections' },
    when: (ctx) => connectTarget(ctx) !== null,
  },
  {
    id: 'find-people',
    scope: 'account',
    title: text('Follow a few people to fill your feed?'),
    help: text(
      'Following a whole starter pack fills your feed quickly, but gives you less say over who fills it.',
    ),
    control: { kind: 'action', label: 'Show me starter packs', route: '/bundled-starter-kits' },
    when: followsNobody,
  },

  // --- Plus ----------------------------------------------------------------
  {
    id: 'plus',
    scope: 'app',
    title: text('Mawkingbird Plus'),
    help: (ctx) =>
      ctx.supporter.isSupporter()
        ? "You're a Plus member. Thank you!"
        : 'Your feeds, lists and settings on every device, plus better connections to other websites, like RSS feeds and reading articles here.',
    control: { kind: 'plus' },
    when: (ctx) => ctx.flags.enabled('mawkingbird-plus'),
  },
];

/** Plus benefit rows for this build, as the Plus card lists them. */
export function plusRows(ctx: OnboardingContext): { label: string; plus: string }[] {
  return visiblePlusBenefits((flag) => ctx.flags.enabled(flag)).map(({ label, plus }) => ({
    label,
    plus,
  }));
}

/** Accent swatches, by id and colour. Names stay out: this card is English-only. */
export const ACCENT_SWATCHES = ACCENT_PRESETS.map(({ id, accent }) => ({ id, accent }));
