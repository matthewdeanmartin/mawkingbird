import { effect, inject, Injectable, signal, WritableSignal } from '@angular/core';
import {
  DEFAULT_DICTIONARY,
  DictionaryId,
  dictionaryById,
  isValidDictionaryTemplate,
} from './providers/read/dictionaries';
import { scopedKey } from './account-scope';
import { isCanaryBuild } from './build-flavor';
import { ProviderId } from './models';
import { ProfileSyncStarter } from './providers/account/profile-sync-starter';
import { DEFAULT_PKM_VOCABULARY, PkmVocabulary, normalizeVocabulary } from './pkm/pkm-tags';
import { ALL_STEPS_ON, WIZARD_STEPS, WizardStep, WizardSteps } from './publish-wizard';

const PREFS_KEY = 'mockingbird_client_prefs';

/**
 * Which feed sources are hidden is per-account, not global: one account may have
 * a Bluesky chip toggled off that another account doesn't even have. Kept in its
 * own account-scoped key (see {@link scopedKey}) rather than the shared prefs
 * blob so a filter set on one login never follows the user to another.
 */
const HIDDEN_PROVIDERS_KEY_BASE = 'mockingbird_hidden_providers';

/**
 * The account's own posting default (`source.privacy`), mirrored locally so the
 * composer can open on it without a request. Necessarily per-account, and for
 * the same reason as {@link HIDDEN_PROVIDERS_KEY_BASE} it gets its own scoped
 * key rather than a slot in the shared prefs blob.
 */
const DEFAULT_VISIBILITY_KEY_BASE = 'mockingbird_default_visibility';

/**
 * The words that mean `#NOTE`, `#TODO` and `#CAL` for this account.
 *
 * Account-scoped for the same reason as the two above, plus one of its own:
 * these are language-specific. Someone with an English account and a German one
 * wants `#TODO` on the first and `#AUFGABE` on the second, and a global setting
 * would make one of them wrong every time they switch.
 */
const PKM_VOCABULARY_KEY_BASE = 'mockingbird_pkm_vocabulary';

const PROVIDER_IDS: ProviderId[] = [
  'mastodon',
  'anonymous-mastodon',
  'bluesky',
  'rss',
  'twitter',
  'paste',
];

/**
 * How far back the home feed reaches.
 *
 * Merging providers that publish at wildly different rates sorts badly by date
 * alone: Mastodon and Bluesky produce posts continuously, while a followed
 * Twitter account or an RSS feed may produce one a month. The high-rate sources
 * fill the top, and once they run out the low-rate ones dump their entire back
 * catalogue — so scrolling down reaches posts from years ago that the reader has
 * already seen.
 *
 * This bounds what is *loaded*, not just what is shown. A window that only hid
 * old posts would leave the page just as large (the Anonymous client-side
 * follows feed is the worst case) and would still spend Twitter's cold-start
 * budget on accounts dormant since 2019.
 *
 * `today` is a rolling 24 hours rather than "since local midnight", which would
 * be nearly empty at 00:05 and jump at the day boundary.
 */
export type HomeWindow = 'today' | 'week' | 'all';

/** Cutoff in ms for each window, or null for "no limit". */
export function homeWindowMs(window: HomeWindow): number | null {
  switch (window) {
    case 'today':
      return 24 * 60 * 60 * 1000;
    case 'week':
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export type ThemeMode = 'light' | 'dark' | 'auto';

/** Mastodon's four post visibilities, in descending reach. */
export const VISIBILITY_VALUES = ['public', 'unlisted', 'private', 'direct'] as const;
export type Visibility = (typeof VISIBILITY_VALUES)[number];

/** Narrow an untrusted value (stored JSON, an API `source.privacy`) to a visibility. */
export function asVisibility(value: unknown): Visibility | null {
  return typeof value === 'string' && (VISIBILITY_VALUES as readonly string[]).includes(value)
    ? (value as Visibility)
    : null;
}

/** When the blue verification check shows on other accounts. */
export type VerifiedMode = 'fixed' | 'famous' | 'everyone';
export type ReaderFontFamily =
  | 'serif'
  | 'charter'
  | 'palatino'
  | 'sans'
  | 'helvetica-neue'
  | 'inter'
  | 'verdana'
  | 'mono';
export type ReaderTextAlign = 'left' | 'justify';

/** Readable, local-only typeface choices shared by every reader control. */
export const READER_FONT_OPTIONS: readonly {
  id: ReaderFontFamily;
  label: string;
  stack: string;
}[] = [
  { id: 'serif', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'charter', label: 'Charter', stack: "Charter, 'Bitstream Charter', Georgia, serif" },
  {
    id: 'palatino',
    label: 'Palatino',
    stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  },
  {
    id: 'sans',
    label: 'System Sans',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  {
    id: 'helvetica-neue',
    label: 'Helvetica Neue',
    stack:
      "'Helvetica Neue', Helvetica, Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    id: 'inter',
    label: 'Inter',
    stack: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  {
    id: 'mono',
    label: 'Monospace',
    stack: "'Cascadia Code', Consolas, 'Courier New', monospace",
  },
];

/**
 * Paper colour for reader mode.
 *
 * `app` means "whatever the app theme is" and stays the default, so nothing
 * changes for people who never open the picker. The other four repaint *only*
 * the article — a sepia page inside an otherwise dark app is the point, not a
 * bug: reading a long article is a different activity from scanning a feed, and
 * people have strong per-activity preferences.
 */
export type ReaderTheme = 'app' | 'light' | 'sepia' | 'dark' | 'solarized';

/** Article foreground/background per {@link ReaderTheme}. `app` inherits. */
export const READER_THEMES: Record<Exclude<ReaderTheme, 'app'>, { bg: string; fg: string }> = {
  light: { bg: '#ffffff', fg: '#16181c' },
  sepia: { bg: '#f4ecd8', fg: '#3b2f1e' },
  dark: { bg: '#16181c', fg: '#e7e9ea' },
  solarized: { bg: '#fdf6e3', fg: '#586e75' },
};

// Chat-list filters (the toggles above the conversation list).
/**
 * Who the chat list shows.
 *
 * `bots` is the synthetic correspondents — Eliza and OpenRouter — and is only
 * offered while AI features are on. There is nothing behind it otherwise.
 */
export type ChatAudience = 'all' | 'mutuals' | 'bots';

const CHAT_AUDIENCES: readonly ChatAudience[] = ['all', 'mutuals', 'bots'];

/**
 * How much of the AI machinery is present in the UI.
 *
 * `off` hides every AI surface: Eliza, OpenRouter chat, AI translation, and the
 * query/hashtag suggestions. It does not delete anything — a stored OpenRouter
 * key survives, and turning AI back on restores the conversations intact.
 *
 * The long-planned third state — generated art swapped for hand-drawn
 * illustrations — landed as {@link ArtStyle} instead of a value here. Which
 * pictures the app shows turned out to be independent of whether the chat bots
 * exist: someone can want the drawings and still want Eliza.
 */
export type AiMode = 'on' | 'off';

const AI_MODES: readonly AiMode[] = ['on', 'off'];

/**
 * Which set of brand illustrations the app draws: the bird mark and the fail
 * whale.
 *
 * `hand` is the default and the real artwork — drawings made for this app by
 * hand. `ai` keeps the generated originals for anyone who prefers them, so
 * switching is a preference rather than a deprecation.
 *
 * Purely cosmetic and app-wide rather than per-account: it is a statement about
 * what this browser should look like, like the theme, not about an identity.
 */
export type ArtStyle = 'hand' | 'ai';

const ART_STYLES: readonly ArtStyle[] = ['hand', 'ai'];

/**
 * How long a fetched RSS feed may be reused. `0` refetches every time.
 *
 * Offered as a fixed list rather than a free number so the stored value is
 * always one the UI can name back to the user.
 */
/** How the `/rss` reading pane renders items. */
export type RssDensity = 'full' | 'headlines';

/** Every valid {@link RssDensity}, for validating stored/typed input. */
export const RSS_DENSITIES: readonly RssDensity[] = ['full', 'headlines'];

/** Cache lifetimes offered for RSS feeds. Labels are keys; see extract-i18n.mjs. */
// i18n settings.rss.ttl.always: Always refetch (not recommended)
// i18n settings.rss.ttl.hour1: 1 hour
// i18n settings.rss.ttl.hour6: 6 hours
// i18n settings.rss.ttl.hour24: 24 hours
// i18n settings.rss.ttl.day7: 7 days
export const RSS_CACHE_TTL_OPTIONS: readonly { hours: number; key: string }[] = [
  { hours: 0, key: 'settings.rss.ttl.always' },
  { hours: 1, key: 'settings.rss.ttl.hour1' },
  { hours: 6, key: 'settings.rss.ttl.hour6' },
  { hours: 24, key: 'settings.rss.ttl.hour24' },
  { hours: 24 * 7, key: 'settings.rss.ttl.day7' },
];
export type ChatKindFilter = 'all' | 'private' | 'public' | 'bsky' | 'bot';

const CHAT_KINDS: readonly ChatKindFilter[] = ['all', 'private', 'public', 'bsky', 'bot'];

/** Algo-feed audience chip: everything, or only posts authored by follows. */
export type AlgoAudience = 'all' | 'friends';

/** Whether the favourite action renders as a star or a heart. */
export type FavStyle = 'star' | 'heart';

/** Which complete post/re-share vocabulary the English UI uses. */
export type PostNoun = 'post' | 'tweet' | 'florp' | 'skeet' | 'toot' | 'custom';

/** Every accepted value, so validation and the settings picker agree. */
export const POST_NOUNS: readonly PostNoun[] = [
  'post',
  'tweet',
  'florp',
  'skeet',
  'toot',
  'custom',
];

/**
 * The seven forms Mawkingbird needs to put user-defined terminology into real
 * sentences. Keeping them explicit is a little more work in Settings, but it
 * means an irregular word or a non-English vocabulary is never "helpfully"
 * conjugated into nonsense.
 */
export interface CustomTerminology {
  post: string;
  posts: string;
  poster: string;
  posted: string;
  boost: string;
  boosts: string;
  boosted: string;
}

export type CustomTerminologyKey = keyof CustomTerminology;

export const DEFAULT_CUSTOM_TERMINOLOGY: Readonly<CustomTerminology> = {
  post: 'chirp',
  posts: 'chirps',
  poster: 'chirper',
  posted: 'chirped',
  boost: 'echo',
  boosts: 'echoes',
  boosted: 'echoed',
};

const CUSTOM_TERMINOLOGY_KEYS: readonly CustomTerminologyKey[] = [
  'post',
  'posts',
  'poster',
  'posted',
  'boost',
  'boosts',
  'boosted',
];

/** Keep custom words compact and printable while allowing Unicode and emoji. */
export function normalizeCustomTerminology(value: unknown): CustomTerminology {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = { ...DEFAULT_CUSTOM_TERMINOLOGY };
  for (const key of CUSTOM_TERMINOLOGY_KEYS) {
    const raw = (source as Record<string, unknown>)[key];
    if (typeof raw !== 'string') {
      continue;
    }
    const clean = raw
      .replace(/\p{Cc}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    if (clean) {
      normalized[key] = clean;
    }
  }
  return normalized;
}

/**
 * Whether a stored value is a noun we still ship.
 *
 * Anything unrecognised falls back to 'post' rather than throwing: someone who
 * tried florp and later loads a build without it should see posts, not a
 * broken settings page.
 */
export function isPostNoun(value: unknown): value is PostNoun {
  return POST_NOUNS.includes(value as PostNoun);
}

/** Custom color overrides; a `#rrggbb` string, or null for the theme default. */
export type CustomColor = string | null;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface AccentPreset {
  id: string;
  labelKey: string;
  accent: string;
  accentHover: string;
  /** Tint used for soft backgrounds (light theme; dark theme derives its own). */
  accentSoft: string;
}

/** Accent color presets, Twitter-Blue style. The first entry is the classic default. */
/** Accent names, as keys: colour words differ per language. */
// i18n accent.blue: Blue
// i18n accent.yellow: Yellow
// i18n accent.rose: Rose
// i18n accent.purple: Purple
// i18n accent.orange: Orange
// i18n accent.green: Green
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'blue',
    labelKey: 'accent.blue',
    accent: '#1da1f2',
    accentHover: '#1a91da',
    accentSoft: '#e8f5fe',
  },
  {
    id: 'yellow',
    labelKey: 'accent.yellow',
    accent: '#ffad1f',
    accentHover: '#e79c16',
    accentSoft: '#fff5e0',
  },
  {
    id: 'rose',
    labelKey: 'accent.rose',
    accent: '#f91880',
    accentHover: '#dd1573',
    accentSoft: '#fee7f2',
  },
  {
    id: 'purple',
    labelKey: 'accent.purple',
    accent: '#7856ff',
    accentHover: '#6a4ce0',
    accentSoft: '#efebff',
  },
  {
    id: 'orange',
    labelKey: 'accent.orange',
    accent: '#ff7a00',
    accentHover: '#e56e00',
    accentSoft: '#ffefe0',
  },
  {
    id: 'green',
    labelKey: 'accent.green',
    accent: '#00ba7c',
    accentHover: '#00a56e',
    accentSoft: '#e0f7ef',
  },
];

const FONT_STACKS = Object.fromEntries(
  READER_FONT_OPTIONS.map(({ id, stack }) => [id, stack]),
) as Record<ReaderFontFamily, string>;

interface StoredPrefs {
  themeMode?: ThemeMode;
  accentId?: string;
  /** Legacy combined pref; migrated to confirmBeforePost + delayedSend on load. */
  undoSend?: boolean;
  confirmBeforePost?: boolean;
  delayedSend?: boolean;
  verifiedMode?: VerifiedMode;
  readerFontSize?: number;
  readerFontFamily?: ReaderFontFamily;
  readerFontWeight?: number;
  readerLineHeight?: number;
  readerLetterSpacing?: number;
  readerWordSpacing?: number;
  readerTextAlign?: ReaderTextAlign;
  readerTheme?: ReaderTheme;
  readerPageFlip?: boolean;
  readerLibraryOpen?: boolean;
  readerLibraryCollapsed?: string[];
  readerDictionary?: DictionaryId;
  readerDictionaryCustom?: string;
  feedReader?: boolean;
  autoRefreshTimeline?: boolean;
  homeWindow?: HomeWindow;
  showImages?: boolean;
  hiddenProviders?: ProviderId[];
  chatAudience?: ChatAudience;
  aiMode?: AiMode;
  artStyle?: ArtStyle;
  rssCacheTtlHours?: number;
  rssDensity?: RssDensity;
  rssScrollMarksRead?: boolean;
  chatKind?: ChatKindFilter;
  feedMin?: number;
  feedMax?: number;
  ignoreFeedCooldown?: boolean;
  algoAudience?: AlgoAudience;
  algoCalm?: boolean;
  algoTags?: boolean;
  favStyle?: FavStyle;
  postNoun?: PostNoun;
  customTerminology?: Partial<CustomTerminology>;
  zenMode?: boolean;
  analytics?: boolean;
  requireAltText?: boolean;
  thoughtfulPosting?: boolean;
  autoShowMiniComposer?: boolean;
  warnOnPkmPublish?: boolean;
  wizardSteps?: Partial<Record<WizardStep, boolean>>;
  customBg?: CustomColor;
  customLink?: CustomColor;
  customSidebar?: CustomColor;
  excludeUnknownLangTrends?: boolean;
  uiLocale?: string | null;
  knownLanguages?: string[];
  hideForeignLangPosts?: boolean;
  feedLanguages?: string[];
  learningLanguages?: string[];
  appendTranslation?: Record<string, boolean>;
  autoTranslateMode?: AutoTranslateMode;
  translateAllForeign?: boolean;
  autoTranslateUsesAi?: boolean;
  skipSameLanguageTranslation?: boolean;
}

/** When automatic translation fires. See {@link ClientPrefs.autoTranslateMode}. */
export type AutoTranslateMode = 'off' | 'view' | 'hover';

export const AUTO_TRANSLATE_MODES: readonly AutoTranslateMode[] = ['off', 'view', 'hover'];

/**
 * How many languages the feed filter can be narrowed to at once.
 *
 * Three is a product decision, not a technical limit: bilingual is common,
 * trilingual is rare, and beyond that the list no longer excludes enough to be
 * worth maintaining — "All languages" says the same thing in one click.
 */
export const MAX_FEED_LANGUAGES = 3;

/** ISO 639-1 codes normalized/deduped; also drives the trending-tag language filter. */
function normalizeLangs(list: unknown): string[] {
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set<string>();
  for (const raw of list) {
    if (typeof raw !== 'string') {
      continue;
    }
    const code = raw.toLowerCase().split(/[-_]/)[0];
    if (/^[a-z]{2,3}$/.test(code)) {
      seen.add(code);
    }
  }
  return [...seen];
}

/**
 * A stored UI-locale choice, or `null` when there isn't a usable one.
 *
 * Deliberately does **not** check the code against the shipped locale list: a
 * hand-edited or newer-build value that names a locale this build doesn't have
 * should fall back to English at render time (Transloco's `fallbackLang`), not
 * be silently erased from storage here. Erasing it would turn "I chose Finnish
 * on the canary build" into "I never chose anything" on the production one.
 */
function normalizeLocale(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const code = value.toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(code) ? code : null;
}

/**
 * Per-language append flags, keyed by normalized code. Anything that isn't a plain
 * boolean under a plausible language code is dropped rather than trusted — the same
 * treatment `normalizeLangs` gives its input, for the same reason: this blob is
 * hand-editable localStorage.
 */
function normalizeAppendFlags(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [raw, flag] of Object.entries(value as Record<string, unknown>)) {
    const code = raw.toLowerCase().split(/[-_]/)[0];
    if (typeof flag === 'boolean' && /^[a-z]{2,3}$/.test(code)) {
      out[code] = flag;
    }
  }
  return out;
}

/** Feed-size bounds (see feedMin / feedMax). */
export const FEED_MIN_DEFAULT = 20;
export const FEED_MAX_DEFAULT = 500;
const FEED_MIN_FLOOR = 5;
const FEED_MAX_CEILING = 5000;
/** How long the "you've had enough" cap sticks before it lifts, in ms. */
export const FEED_MAX_COOLDOWN_MS = 60 * 60 * 1000;

/** Clamp helper shared by the numeric reader prefs. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Client-only preferences persisted in localStorage. These must work against any
 * Mastodon instance (e.g. mastodon.social), so nothing here touches the server.
 *
 * The service applies theme + accent to `document.documentElement` as
 * `data-theme` / `data-accent` attributes (`styles.css` carries the palettes),
 * reader typography as `--reader-*` CSS variables, and the feed-wide reader /
 * images toggles as `data-feed-reader` / `data-images` attributes so every
 * timeline picks them up without wiring.
 */
@Injectable({ providedIn: 'root' })
export class ClientPrefs {
  /**
   * Settings sync, behind an indirection that loads nothing until it is needed.
   *
   * See the note at the end of {@link persist}. This service is instantiated
   * eagerly so theme and accent apply on every route, so anything it imports is
   * in the initial bundle — which the account machinery must not be.
   */
  private readonly profileSync = inject(ProfileSyncStarter);

  readonly themeMode = signal<ThemeMode>('auto');
  /**
   * Accent defaults to blue, but canary builds (/canary/ base href) default to
   * yellow so the two deployments look distinct. This is only the default: a
   * stored user choice loaded in load() takes precedence.
   */
  readonly accentId = signal<string>(isCanaryBuild() ? 'yellow' : 'blue');
  /** Ask "do you really want to post that?" before sending. */
  readonly confirmBeforePost = signal<boolean>(false);
  /** Hold posts for 30 seconds with a cancel (and publish-now) option. */
  readonly delayedSend = signal<boolean>(false);
  /** Who gets a blue check: fixed follower bar, more followers than me, or everyone. */
  readonly verifiedMode = signal<VerifiedMode>('fixed');

  // Reader typography (thread reader mode + feed reader mode).
  readonly readerFontSize = signal<number>(18);
  readonly readerFontFamily = signal<ReaderFontFamily>('serif');
  readonly readerFontWeight = signal<number>(400);
  readonly readerLineHeight = signal<number>(1.65);
  readonly readerLetterSpacing = signal<number>(0);
  readonly readerWordSpacing = signal<number>(0);
  readonly readerTextAlign = signal<ReaderTextAlign>('left');
  /** Paper colour for the article body only — see {@link ReaderTheme}. */
  readonly readerTheme = signal<ReaderTheme>('app');

  /**
   * Which dictionary "Define" opens.
   *
   * A preference rather than a constant because a dictionary is a personal
   * choice — a learner and a lexicographer want different sites, and someone
   * reading in a language the catalogue does not cover wants their own.
   */
  readonly readerDictionary = signal<DictionaryId>(DEFAULT_DICTIONARY);

  /** The reader's own `{word}` template, used when `readerDictionary` is custom. */
  readonly readerDictionaryCustom = signal<string>('');

  /**
   * Whether the reader page turns pages rather than scrolling.
   *
   * On by default, which is the change from how reading worked before it had a
   * page of its own: a long article in an endless scroll has no position you
   * can return to and no sense of how much is left. A page does both, and
   * `article-pages.ts` was already splitting documents for the RSS pane — this
   * makes that the normal way to read rather than one surface's local habit.
   */
  readonly readerPageFlip = signal<boolean>(true);

  /**
   * Whether the reader's library panel is showing.
   *
   * Off by default, per the brief. A view preference, so it lives here and not
   * in the library store — mixing panel state into a store shaped for a later
   * sync is how "my laptop closed the panel on my phone" happens.
   */
  readonly readerLibraryOpen = signal<boolean>(false);

  /** Which library shelves are folded away. Shelf ids; unknown values ignored. */
  readonly readerLibraryCollapsed = signal<readonly string[]>([]);

  // Feed-wide toggles (command bar).
  readonly feedReader = signal<boolean>(false);

  /**
   * Whether the timeline may hold a streaming connection open and append posts
   * as they arrive.
   *
   * Off by default and deliberately opt-in. A feed that rewrites itself while
   * you are reading it is an antipattern — it moves the thing you were halfway
   * through and turns a timeline into a slot machine — so it lives in Blue where
   * someone has to go looking for it, rather than one click away on a toolbar
   * whose space is better spent on controls people actually want.
   *
   * Only Mastodon has a streaming API here; every other provider is polled, so
   * the toggle has no effect on Twitter, Bluesky, or RSS content.
   */
  readonly autoRefreshTimeline = signal<boolean>(false);

  /**
   * How far back Home reaches. Defaults to the last 24 hours — see
   * {@link HomeWindow} for why this bounds loading rather than only display.
   */
  readonly homeWindow = signal<HomeWindow>('all');

  readonly showImages = signal<boolean>(true);

  /** Providers filtered OUT of the home feed via the command-bar chips. */
  readonly hiddenProviders = signal<ProviderId[]>([]);

  /**
   * The account's posting default (`source.privacy`), cached from the last
   * `verify_credentials`. This is a *mirror*, not a preference: the server owns
   * the value and Settings → Posting is where it is changed. It exists so the
   * composer can open on the user's real default without spending a request on
   * the hot path — see {@link setDefaultVisibility}. Anonymous sessions have no
   * server-side default and keep the `public` fallback.
   */
  readonly defaultVisibility = signal<Visibility>('public');

  // Chat-list filters.
  readonly chatAudience = signal<ChatAudience>('all');

  /**
   * Whether the AI features are present at all. See {@link AiMode}.
   *
   * This is the *user's* switch, and it is not the whole answer — the
   * `connector-openrouter` rollout flag is the operator's, for when the API is
   * down. Anything gating an AI surface must consult both; nothing should read
   * this signal directly except that combined check.
   */
  readonly aiMode = signal<AiMode>('on');

  /**
   * Which brand illustrations to draw. See {@link ArtStyle}; the hand-drawn set
   * is the default. Read through {@link brandLogoSrc} / {@link failWhaleSrc}
   * rather than directly, so every surface picks the same file.
   */
  readonly artStyle = signal<ArtStyle>('hand');

  /**
   * How long a fetched RSS feed is reused before going back to the network.
   *
   * Twenty-four hours by default. Feeds are polled by every view that shows
   * them and are frequently read through a shared CORS proxy with a low rate
   * limit, so the cost of re-fetching is borne by a third party and paid in
   * throttling; almost no feed publishes often enough for a shorter window to
   * show the reader anything new. `0` means "always refetch", kept as an escape
   * hatch for someone debugging their own feed.
   */
  readonly rssCacheTtlHours = signal<number>(24);

  /**
   * How the `/rss` reading pane renders items.
   *
   * `full` (the default) is the `app-status-card` rendering the pane has always
   * used — unchanged for anyone already reading there, and the right thing for
   * someone who has just installed a starter kit and wants to see content
   * rather than a spreadsheet. `headlines` is the dense one-line-per-item scan
   * view for people who go looking for it.
   */
  readonly rssDensity = signal<RssDensity>('full');

  /**
   * Mark RSS items read as they scroll past in the reading pane.
   *
   * Off by default and deliberately opt-in: silently marking things read is the
   * kind of behaviour that feels like data loss when you did not ask for it.
   * Opening an item always marks it read regardless of this setting.
   */
  readonly rssScrollMarksRead = signal<boolean>(false);

  readonly chatKind = signal<ChatKindFilter>('all');

  // Algo-feed filters.
  readonly algoAudience = signal<AlgoAudience>('all');
  /** Calm mode: hide posts the rage lexicon flags as inflammatory. */
  readonly algoCalm = signal<boolean>(false);
  /** Include popular recent posts from followed hashtags in the Algo feed. */
  readonly algoTags = signal<boolean>(true);

  /**
   * Feed-size bounds. `feedMin` auto-loads more pages until the feed holds at
   * least this many (or the timeline is exhausted). `feedMax` caps how much a
   * feed will load in one sitting; hitting it disables "Load more" until a
   * cooldown passes or the page reloads.
   */
  readonly feedMin = signal<number>(FEED_MIN_DEFAULT);
  readonly feedMax = signal<number>(FEED_MAX_DEFAULT);
  /**
   * Let the reader page past the reading break.
   *
   * The cooldown is a health guard, not a technical limit — it exists because
   * two hours of scrolling is bad for you, not because the server minds. So it
   * is overridable, and the override is a deliberate setting rather than a
   * button at the end of the feed: turning it off should cost a trip to
   * Settings, which is friction proportional to what is being switched off.
   *
   * Off by default. Someone who wants endurance doomscrolling can have it; the
   * point is that they have to say so somewhere other than mid-scroll.
   */
  readonly ignoreFeedCooldown = signal<boolean>(false);

  /** Favourite buttons render as ⭐ (Mastodon-style) or ❤️ (Twitter-style). */
  readonly favStyle = signal<FavStyle>('star');
  /** The selected built-in vocabulary, or the user's custom one. */
  readonly postNoun = signal<PostNoun>('post');
  /** User-defined vocabulary; retained while a built-in preset is selected. */
  readonly customTerminology = signal<CustomTerminology>({ ...DEFAULT_CUSTOM_TERMINOLOGY });
  /** Zen mode: both sidebars disappear, leaving just the feed column. */
  readonly zenMode = signal<boolean>(false);
  /**
   * Whether anonymous page-view analytics run at all.
   *
   * Opt-out rather than opt-in, but a real one: when this is off the analytics
   * script is never injected, so nothing is loaded, counted or sent — see
   * {@link AnalyticsTracker}. Stored app-wide, not per account, because it is a
   * statement about this browser rather than about an identity.
   */
  readonly analytics = signal<boolean>(true);
  /** Opt-in: refuse to post while any attached image lacks alt text. */
  readonly requireAltText = signal<boolean>(false);

  /**
   * Thoughtful posting: nothing publishes straight from a text box.
   *
   * With this on, Home has no composer — just a Write button that opens an
   * editor at the top of /drafts, and that editor only saves. Posting happens
   * later, deliberately, from a draft row. The gap between writing something and
   * coming back to it is the entire feature.
   *
   * Replies, chats, and the paste-share composer are never gated: replies are
   * urgent, and a paste link was already a deliberate act. See the composer's
   * `gateable` input for which surfaces opt in.
   */
  readonly thoughtfulPosting = signal<boolean>(false);

  /**
   * Whether Home opens with the mini composer already expanded.
   *
   * Off by default, and deliberately so: the box at the top of the feed is the
   * shortest path from "landed on Home" to "posted something", and that path is
   * the one worth making the user ask for. With this off, Home offers two
   * buttons — Write, which leaves for the full editor, and Quick post, which
   * expands the box for that visit only. Turning this on restores the box on
   * every visit for anyone who wants the old behaviour back.
   *
   * Independent of {@link thoughtfulPosting}, which is about the *publish* step
   * rather than the box: when that is on there is no Quick post button at all,
   * so this pref has nothing to act on.
   */
  readonly autoShowMiniComposer = signal<boolean>(false);

  /**
   * The words that mark a post as a note, a to-do or a calendar item.
   *
   * Configurable because `#TODO` is English; see {@link PkmVocabulary}. An empty
   * list for a kind means the user switched that kind off, and is preserved
   * rather than being restored to the default.
   */
  readonly pkmVocabulary = signal<PkmVocabulary>(DEFAULT_PKM_VOCABULARY);

  /** Whether to warn before publishing a post carrying a PKM tag. */
  readonly warnOnPkmPublish = signal<boolean>(true);

  /**
   * Which publish-wizard steps to show.
   *
   * All on by default. The opposite default would ship the feature invisible —
   * and turning steps off one at a time is the safe direction to discover it.
   */
  readonly wizardSteps = signal<WizardSteps>(ALL_STEPS_ON);

  // Custom colors (null = keep the theme's own value).
  readonly customBg = signal<CustomColor>(null);
  readonly customLink = signal<CustomColor>(null);
  readonly customSidebar = signal<CustomColor>(null);

  /**
   * Hide trending tags detected as a language the user doesn't know. **On by
   * default**: with ~3000 human languages, a reader who happens to know the one
   * a tag is written in is the rare case, so the sensible default is to exclude
   * tags we're *sure* are foreign. The filter only ever hides tags whose script
   * commits to a known-foreign language; anything undetermined (all Latin tags,
   * bare Han for a reader who might know zh/ja) is still kept — so "we can't tell
   * your language" degrades to showing everything, never hiding by mistake. See
   * {@link KnownLanguages} for how "known" is derived and the
   * TrendLanguageFilter service for where it is applied.
   */
  readonly excludeUnknownLangTrends = signal<boolean>(true);

  /**
   * The interface language the user has **explicitly chosen**, or `null` to let
   * the browser decide (see `i18n/locale.ts`).
   *
   * `null` is not the same as `'en'`, and the difference is the whole design:
   * `null` means "negotiate from `navigator.languages` every visit", so someone
   * who later changes their OS language follows along. `'en'` means "this person
   * asked for English" and must survive a German browser forever. Persisting a
   * *negotiated* result would silently collapse the first case into the second.
   */
  readonly uiLocale = signal<string | null>(null);

  /**
   * Languages the user has explicitly said they know (ISO 639-1). This is the
   * future home of Mastodon's "public timeline languages" checkbox list; it
   * augments — never replaces — the languages we can infer from the UI language,
   * the browser, and the posting default.
   */
  readonly knownLanguages = signal<string[]>([]);

  /**
   * Hide feed posts (Home, Algo) that are confidently in a language the user
   * doesn't know, or that misrepresent their own language. Off by default. Like
   * the trending filter, it never hides a post whose language can't be
   * determined — see the FeedLanguageFilter service.
   */
  readonly hideForeignLangPosts = signal<boolean>(false);

  /**
   * Languages the user is **learning** (ISO 639-1) — orthogonal to
   * {@link knownLanguages}, never merged with it.
   *
   * The distinction is the whole point of learner mode. A *known* language needs no
   * translation and is never hidden. A *learning* language is the opposite case on both
   * counts: it is exactly what the reader wants translated, and exactly what they must
   * not have filtered away — hiding the Icelandic posts from someone learning Icelandic
   * defeats the reason they follow those accounts.
   *
   * So this list does two jobs, and {@link FeedLanguageFilter} honours the second one
   * whether or not any translation feature is switched on:
   *
   *   1. it marks posts eligible for automatic translation, and
   *   2. it exempts those posts from `hideForeignLangPosts`, always.
   *
   * Uncapped, unlike {@link feedLanguages}: that one is a narrowing filter where a long
   * list stops meaning anything, whereas this is a statement about the person. Someone
   * studying four languages is unusual, not incoherent.
   */
  readonly learningLanguages = signal<string[]>([]);

  /**
   * Which learning languages should have their translation **appended** below the
   * original rather than replacing it, keyed by language code.
   *
   * Per-language rather than one global switch because a reader learning two languages
   * may want them treated differently — and because showing original *plus* translation
   * for several languages at once is the "Rosetta triplet" case, which costs a
   * translation per language and should be opted into deliberately, one at a time.
   *
   * Absent means append (the learner default): seeing the original beside the
   * translation is the entire pedagogical value, so the useful behaviour is what you
   * get by adding a language, and replacing is the deliberate choice.
   */
  readonly appendTranslation = signal<Record<string, boolean>>({});

  /**
   * When automatic translation fires: never, as posts scroll into view, or on hover.
   *
   * Off by default, and it must stay that way — this is the setting that turns reading
   * into spending, and a default that spends on someone's behalf is exactly what
   * `translation-preference.ts` refuses to do for the manual button.
   *
   * The two live modes suit different readers rather than being better and worse.
   * `view` matches how people actually read and needs no gesture, but a fast scroll
   * makes translation decisions for posts nobody looked at. `hover` is deliberate and
   * far cheaper, but it is useless on a touchscreen. Neither is right for everyone, so
   * the reader picks.
   */
  readonly autoTranslateMode = signal<AutoTranslateMode>('off');

  /**
   * Translate **every** foreign post, not just the ones in a language being learned.
   *
   * The `$$$` switch, off by default. Learner mode is bounded by a short list of
   * languages the reader chose; this is unbounded — every post the filter would call
   * foreign becomes a translation call. It is genuinely useful for someone reading a
   * timeline they don't share a language with, and genuinely expensive, so it is a
   * separate opt-in rather than a wider setting of the same knob.
   */
  readonly translateAllForeign = signal<boolean>(false);

  /**
   * Allow automatic translation to spend OpenRouter credit.
   *
   * Off by default, and separate from {@link TranslationPreference} on purpose. That
   * preference governs one button the reader pressed; this governs a loop that runs
   * while they scroll. Someone who chose AI for a deliberate click has not thereby
   * agreed to buy a translation for every post that passes, so automatic translation
   * uses the instance endpoint unless this is explicitly switched on.
   */
  readonly autoTranslateUsesAi = signal<boolean>(false);

  /**
   * Refuse a translation when the post already looks like the target language.
   *
   * **On by default**, which is unusual for a setting that blocks an action the user
   * asked for — justified because the blocked call is one that cannot produce anything:
   * translating English into English spends a request, spends a slot in the daily
   * budget, and returns the post you were already reading.
   *
   * Gated on confident detection only ({@link CONFIDENT_TRANSLATE_SHARE}). Uncertain
   * text is translated as asked — the failure we refuse to risk is silently withholding
   * a translation someone needed, which is worse than a wasted call.
   */
  readonly skipSameLanguageTranslation = signal<boolean>(true);

  /**
   * The specific languages the feed is narrowed to, or empty for "every
   * language I know".
   *
   * This sits *inside* {@link hideForeignLangPosts}: the toggle decides whether
   * to filter at all, and this decides how tightly. Someone who follows several
   * hundred accounts across languages wants "just Esperanto today" without
   * unfollowing anyone or editing the languages they know.
   *
   * Capped at {@link MAX_FEED_LANGUAGES}. Past three the list stops being a
   * filter and becomes a worse way of saying "all" — a quadrilingual reader is
   * better served by turning the filter off.
   */
  readonly feedLanguages = signal<string[]>([]);

  /** Resolved theme actually in effect ('auto' resolved against the OS preference). */
  readonly resolvedTheme = signal<'light' | 'dark'>('light');

  private readonly darkQuery: MediaQueryList | null =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  constructor() {
    this.load();
    this.darkQuery?.addEventListener('change', () => this.apply());
    effect(() => {
      this.apply();
      this.persist();
    });
  }

  setThemeMode(mode: ThemeMode): void {
    this.themeMode.set(mode);
  }

  setAccent(id: string): void {
    if (ACCENT_PRESETS.some((p) => p.id === id)) {
      this.accentId.set(id);
    }
  }

  setConfirmBeforePost(enabled: boolean): void {
    this.confirmBeforePost.set(enabled);
  }

  setDelayedSend(enabled: boolean): void {
    this.delayedSend.set(enabled);
  }

  setVerifiedMode(mode: VerifiedMode): void {
    if (mode === 'fixed' || mode === 'famous' || mode === 'everyone') {
      this.verifiedMode.set(mode);
    }
  }

  setReaderFontSize(px: number): void {
    this.readerFontSize.set(clamp(px, 15, 24));
  }

  setReaderFontFamily(family: ReaderFontFamily): void {
    if (family in FONT_STACKS) {
      this.readerFontFamily.set(family);
    }
  }

  setReaderTheme(theme: ReaderTheme): void {
    if (theme === 'app' || theme in READER_THEMES) {
      this.readerTheme.set(theme);
    }
  }

  setReaderDictionary(id: DictionaryId): void {
    this.readerDictionary.set(dictionaryById(id).id);
  }

  /**
   * Store a custom lookup template, if it is one.
   *
   * Validated here rather than at use: a template that fails is a setting the
   * reader can still see and correct, while one that fails at lookup time is a
   * button that silently does nothing.
   */
  setReaderDictionaryCustom(template: string): boolean {
    const trimmed = template.trim();
    if (trimmed && !isValidDictionaryTemplate(trimmed)) {
      return false;
    }
    this.readerDictionaryCustom.set(trimmed);
    return true;
  }

  setReaderFontWeight(weight: number): void {
    this.readerFontWeight.set(clamp(Math.round(weight / 100) * 100, 300, 700));
  }

  setReaderLineHeight(value: number): void {
    this.readerLineHeight.set(clamp(value, 1.2, 2.4));
  }

  setReaderLetterSpacing(px: number): void {
    this.readerLetterSpacing.set(clamp(px, 0, 3));
  }

  setReaderWordSpacing(px: number): void {
    this.readerWordSpacing.set(clamp(px, 0, 8));
  }

  setReaderTextAlign(align: ReaderTextAlign): void {
    if (align === 'left' || align === 'justify') {
      this.readerTextAlign.set(align);
    }
  }

  setReaderPageFlip(on: boolean): void {
    this.readerPageFlip.set(on);
  }

  setReaderLibraryOpen(open: boolean): void {
    this.readerLibraryOpen.set(open);
  }

  setReaderLibraryCollapsed(shelves: readonly string[]): void {
    this.readerLibraryCollapsed.set([...shelves]);
  }

  setFeedReader(on: boolean): void {
    this.feedReader.set(on);
  }

  setAutoRefreshTimeline(on: boolean): void {
    this.autoRefreshTimeline.set(on);
  }

  setHomeWindow(window: HomeWindow): void {
    this.homeWindow.set(window);
  }

  setShowImages(on: boolean): void {
    this.showImages.set(on);
  }

  isProviderVisible(id: ProviderId): boolean {
    return !this.hiddenProviders().includes(id);
  }

  setChatAudience(who: ChatAudience): void {
    if (CHAT_AUDIENCES.includes(who)) {
      this.chatAudience.set(who);
    }
  }

  setAiMode(mode: AiMode): void {
    if (AI_MODES.includes(mode)) {
      this.aiMode.set(mode);
    }
  }

  setArtStyle(style: ArtStyle): void {
    if (ART_STYLES.includes(style)) {
      this.artStyle.set(style);
    }
  }

  setRssCacheTtlHours(hours: number): void {
    if (RSS_CACHE_TTL_OPTIONS.some((option) => option.hours === hours)) {
      this.rssCacheTtlHours.set(hours);
    }
  }

  setRssDensity(density: RssDensity): void {
    if (RSS_DENSITIES.includes(density)) {
      this.rssDensity.set(density);
    }
  }

  setRssScrollMarksRead(enabled: boolean): void {
    this.rssScrollMarksRead.set(enabled);
  }

  setChatKind(kind: ChatKindFilter): void {
    if (CHAT_KINDS.includes(kind)) {
      this.chatKind.set(kind);
    }
  }

  setAlgoAudience(audience: AlgoAudience): void {
    if (audience === 'all' || audience === 'friends') {
      this.algoAudience.set(audience);
    }
  }

  setAlgoCalm(on: boolean): void {
    this.algoCalm.set(on);
  }

  setIgnoreFeedCooldown(on: boolean): void {
    this.ignoreFeedCooldown.set(on);
    this.persist();
  }

  setAlgoTags(on: boolean): void {
    this.algoTags.set(on);
  }

  setFeedMin(n: number): void {
    if (Number.isFinite(n)) {
      this.feedMin.set(clamp(Math.round(n), FEED_MIN_FLOOR, this.feedMax()));
    }
  }

  setFeedMax(n: number): void {
    if (Number.isFinite(n)) {
      const max = clamp(Math.round(n), FEED_MIN_FLOOR, FEED_MAX_CEILING);
      this.feedMax.set(max);
      // Keep min ≤ max.
      if (this.feedMin() > max) {
        this.feedMin.set(max);
      }
    }
  }

  setFavStyle(style: FavStyle): void {
    if (style === 'star' || style === 'heart') {
      this.favStyle.set(style);
    }
  }

  setPostNoun(noun: PostNoun): void {
    if (isPostNoun(noun)) {
      this.postNoun.set(noun);
    }
  }

  setCustomTerminologyField(key: CustomTerminologyKey, value: string): void {
    if (!CUSTOM_TERMINOLOGY_KEYS.includes(key)) {
      return;
    }
    this.customTerminology.update((current) =>
      normalizeCustomTerminology({ ...current, [key]: value }),
    );
  }

  resetCustomTerminology(): void {
    this.customTerminology.set({ ...DEFAULT_CUSTOM_TERMINOLOGY });
  }

  setZenMode(on: boolean): void {
    this.zenMode.set(on);
  }

  /** Turn page-view analytics on or off. Takes effect on the next page view. */
  setAnalytics(on: boolean): void {
    this.analytics.set(on);
  }

  setRequireAltText(on: boolean): void {
    this.requireAltText.set(on);
  }

  setThoughtfulPosting(on: boolean): void {
    this.thoughtfulPosting.set(on);
  }

  /** Show or hide the mini composer on Home without a click each visit. */
  setAutoShowMiniComposer(on: boolean): void {
    this.autoShowMiniComposer.set(on);
  }

  setCustomBg(color: CustomColor): void {
    this.customBg.set(normalizeColor(color));
  }

  setCustomLink(color: CustomColor): void {
    this.customLink.set(normalizeColor(color));
  }

  setCustomSidebar(color: CustomColor): void {
    this.customSidebar.set(normalizeColor(color));
  }

  setExcludeUnknownLangTrends(on: boolean): void {
    this.excludeUnknownLangTrends.set(on);
  }

  /** Replace the explicit known-languages list (deduped, normalized). */
  setKnownLanguages(list: string[]): void {
    this.knownLanguages.set(normalizeLangs(list));
  }

  setHideForeignLangPosts(on: boolean): void {
    this.hideForeignLangPosts.set(on);
  }

  /**
   * Narrow the feed to specific languages. An empty list means "all the
   * languages I know"; anything non-empty also turns the filter on, because
   * choosing a language and seeing no change would be a broken control.
   */
  setFeedLanguages(list: string[]): void {
    const next = normalizeLangs(list).slice(0, MAX_FEED_LANGUAGES);
    this.feedLanguages.set(next);
    if (next.length) {
      this.hideForeignLangPosts.set(true);
    }
  }

  /** Add one language to the explicit known-languages list. */
  addKnownLanguage(code: string): void {
    this.knownLanguages.update((list) => normalizeLangs([...list, code]));
  }

  /** Remove one language from the explicit known-languages list. */
  removeKnownLanguage(code: string): void {
    const bare = code.toLowerCase().split(/[-_]/)[0];
    this.knownLanguages.update((list) => list.filter((c) => c !== bare));
  }

  /** Replace the languages-I'm-learning list (deduped, normalized). */
  setLearningLanguages(list: string[]): void {
    this.learningLanguages.set(normalizeLangs(list));
  }

  /**
   * Add a language to the learning list.
   *
   * A language you are learning is by definition one you do not yet know, so adding it
   * here removes it from the known list. Left in both, it would be simultaneously
   * "never translate" and "always translate" — and the known list wins that argument in
   * {@link FeedLanguageFilter}, so the learning entry would silently do nothing.
   */
  addLearningLanguage(code: string): void {
    const bare = code.toLowerCase().split(/[-_]/)[0];
    this.learningLanguages.update((list) => normalizeLangs([...list, bare]));
    this.knownLanguages.update((list) => list.filter((c) => c !== bare));
  }

  /** Remove one language from the learning list, and forget its append preference. */
  removeLearningLanguage(code: string): void {
    const bare = code.toLowerCase().split(/[-_]/)[0];
    this.learningLanguages.update((list) => list.filter((c) => c !== bare));
    this.appendTranslation.update((all) => {
      const next = { ...all };
      delete next[bare];
      return next;
    });
  }

  /** Whether `code`'s translation appends below the original. Defaults to true. */
  appendsTranslation(code: string): boolean {
    return this.appendTranslation()[code.toLowerCase().split(/[-_]/)[0]] ?? true;
  }

  setAppendTranslation(code: string, append: boolean): void {
    const bare = code.toLowerCase().split(/[-_]/)[0];
    this.appendTranslation.update((all) => ({ ...all, [bare]: append }));
  }

  /** True when `code` is a language the user is learning. */
  isLearning(code: string): boolean {
    return this.learningLanguages().includes(code.toLowerCase().split(/[-_]/)[0]);
  }

  setAutoTranslateMode(mode: AutoTranslateMode): void {
    if (AUTO_TRANSLATE_MODES.includes(mode)) {
      this.autoTranslateMode.set(mode);
    }
  }

  setTranslateAllForeign(on: boolean): void {
    this.translateAllForeign.set(on);
  }

  setAutoTranslateUsesAi(on: boolean): void {
    this.autoTranslateUsesAi.set(on);
  }

  setSkipSameLanguageTranslation(on: boolean): void {
    this.skipSameLanguageTranslation.set(on);
  }

  /**
   * Mirror the account's posting default. Called wherever a credential account
   * lands (login, boot, account switch, saving Settings → Posting). An
   * unrecognized or absent value leaves the previous cache alone rather than
   * resetting it: a partial response should not silently widen the user's
   * default back to `public`.
   */
  setDefaultVisibility(privacy: unknown): void {
    const visibility = asVisibility(privacy);
    if (visibility) {
      this.defaultVisibility.set(visibility);
    }
  }

  toggleProvider(id: ProviderId): void {
    this.hiddenProviders.update((hidden) =>
      hidden.includes(id) ? hidden.filter((p) => p !== id) : [...hidden, id],
    );
  }

  private load(): void {
    let stored: StoredPrefs = {};
    try {
      stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as StoredPrefs;
    } catch {
      // Corrupt prefs: fall back to defaults.
    }
    if (
      stored.themeMode === 'light' ||
      stored.themeMode === 'dark' ||
      stored.themeMode === 'auto'
    ) {
      this.themeMode.set(stored.themeMode);
    }
    if (
      typeof stored.accentId === 'string' &&
      ACCENT_PRESETS.some((p) => p.id === stored.accentId)
    ) {
      this.accentId.set(stored.accentId);
    }
    // Legacy combined pref maps onto both halves; explicit new keys win.
    this.loadBool(stored.undoSend, this.confirmBeforePost);
    this.loadBool(stored.undoSend, this.delayedSend);
    this.loadBool(stored.confirmBeforePost, this.confirmBeforePost);
    this.loadBool(stored.delayedSend, this.delayedSend);
    if (
      stored.verifiedMode === 'fixed' ||
      stored.verifiedMode === 'famous' ||
      stored.verifiedMode === 'everyone'
    ) {
      this.verifiedMode.set(stored.verifiedMode);
    }
    this.loadBool(stored.readerPageFlip, this.readerPageFlip);
    this.loadBool(stored.readerLibraryOpen, this.readerLibraryOpen);
    if (Array.isArray(stored.readerLibraryCollapsed)) {
      this.readerLibraryCollapsed.set(
        stored.readerLibraryCollapsed.filter((s): s is string => typeof s === 'string'),
      );
    }
    this.loadBool(stored.feedReader, this.feedReader);
    this.loadBool(stored.autoRefreshTimeline, this.autoRefreshTimeline);
    // `today` was the old implicit default. Treat a stored copy as that legacy
    // default so existing browsers move to Everything too; week/all represent
    // deliberate non-default choices and still round-trip.
    if (stored.homeWindow === 'week' || stored.homeWindow === 'all') {
      this.homeWindow.set(stored.homeWindow);
    }
    this.loadBool(stored.showImages, this.showImages);
    if (typeof stored.readerFontSize === 'number') {
      this.setReaderFontSize(stored.readerFontSize);
    }
    if (typeof stored.readerFontFamily === 'string' && stored.readerFontFamily in FONT_STACKS) {
      this.readerFontFamily.set(stored.readerFontFamily);
    }
    if (typeof stored.readerFontWeight === 'number') {
      this.setReaderFontWeight(stored.readerFontWeight);
    }
    if (typeof stored.readerTheme === 'string') {
      this.setReaderTheme(stored.readerTheme);
    }
    if (typeof stored.readerDictionary === 'string') {
      this.setReaderDictionary(stored.readerDictionary);
    }
    if (typeof stored.readerDictionaryCustom === 'string') {
      this.setReaderDictionaryCustom(stored.readerDictionaryCustom);
    }
    if (typeof stored.readerLineHeight === 'number') {
      this.setReaderLineHeight(stored.readerLineHeight);
    }
    if (typeof stored.readerLetterSpacing === 'number') {
      this.setReaderLetterSpacing(stored.readerLetterSpacing);
    }
    if (typeof stored.readerWordSpacing === 'number') {
      this.setReaderWordSpacing(stored.readerWordSpacing);
    }
    if (stored.readerTextAlign === 'left' || stored.readerTextAlign === 'justify') {
      this.readerTextAlign.set(stored.readerTextAlign);
    }
    this.loadHiddenProviders(stored);
    this.loadDefaultVisibility();
    this.loadPkmVocabulary();
    this.loadBool(stored.warnOnPkmPublish, this.warnOnPkmPublish);
    // Each step read independently: a stored blob written by an older build
    // simply leaves the steps it never knew about switched on.
    if (stored.wizardSteps && typeof stored.wizardSteps === 'object') {
      const steps = { ...ALL_STEPS_ON };
      for (const step of WIZARD_STEPS) {
        if (typeof stored.wizardSteps[step] === 'boolean') {
          steps[step] = stored.wizardSteps[step];
        }
      }
      this.wizardSteps.set(steps);
    }
    // 'everyone' was this setting's name for 'all' before the Bots filter
    // arrived. Migrated rather than dropped: silently resetting someone's chat
    // filter is the kind of small betrayal nobody reports but everybody notices.
    if ((stored.chatAudience as string) === 'everyone') {
      this.chatAudience.set('all');
    } else if (stored.chatAudience && CHAT_AUDIENCES.includes(stored.chatAudience)) {
      this.chatAudience.set(stored.chatAudience);
    }
    if (stored.aiMode && AI_MODES.includes(stored.aiMode)) {
      this.aiMode.set(stored.aiMode);
    }
    if (stored.artStyle && ART_STYLES.includes(stored.artStyle)) {
      this.artStyle.set(stored.artStyle);
    }
    if (
      typeof stored.rssCacheTtlHours === 'number' &&
      RSS_CACHE_TTL_OPTIONS.some((option) => option.hours === stored.rssCacheTtlHours)
    ) {
      this.rssCacheTtlHours.set(stored.rssCacheTtlHours);
    }
    if (typeof stored.rssDensity === 'string' && RSS_DENSITIES.includes(stored.rssDensity)) {
      this.rssDensity.set(stored.rssDensity);
    }
    if (typeof stored.rssScrollMarksRead === 'boolean') {
      this.rssScrollMarksRead.set(stored.rssScrollMarksRead);
    }
    if (stored.chatKind && CHAT_KINDS.includes(stored.chatKind)) {
      this.chatKind.set(stored.chatKind);
    }
    // A legacy stored 'platform' value simply falls back to the 'all' default.
    if (stored.algoAudience === 'all' || stored.algoAudience === 'friends') {
      this.algoAudience.set(stored.algoAudience);
    }
    this.loadBool(stored.algoCalm, this.algoCalm);
    this.loadBool(stored.algoTags, this.algoTags);
    // feedMax first so setFeedMin can clamp against it.
    if (typeof stored.ignoreFeedCooldown === 'boolean') {
      this.ignoreFeedCooldown.set(stored.ignoreFeedCooldown);
    }
    if (typeof stored.feedMax === 'number') {
      this.setFeedMax(stored.feedMax);
    }
    if (typeof stored.feedMin === 'number') {
      this.setFeedMin(stored.feedMin);
    }
    if (stored.favStyle === 'star' || stored.favStyle === 'heart') {
      this.favStyle.set(stored.favStyle);
    }
    if (isPostNoun(stored.postNoun)) {
      this.postNoun.set(stored.postNoun);
    }
    this.customTerminology.set(normalizeCustomTerminology(stored.customTerminology));
    this.loadBool(stored.zenMode, this.zenMode);
    this.loadBool(stored.analytics, this.analytics);
    this.loadBool(stored.requireAltText, this.requireAltText);
    this.loadBool(stored.thoughtfulPosting, this.thoughtfulPosting);
    this.loadBool(stored.autoShowMiniComposer, this.autoShowMiniComposer);
    this.customBg.set(normalizeColor(stored.customBg ?? null));
    this.customLink.set(normalizeColor(stored.customLink ?? null));
    this.customSidebar.set(normalizeColor(stored.customSidebar ?? null));
    this.loadBool(stored.excludeUnknownLangTrends, this.excludeUnknownLangTrends);
    this.uiLocale.set(normalizeLocale(stored.uiLocale));
    this.knownLanguages.set(normalizeLangs(stored.knownLanguages));
    this.loadBool(stored.hideForeignLangPosts, this.hideForeignLangPosts);
    this.feedLanguages.set(normalizeLangs(stored.feedLanguages).slice(0, MAX_FEED_LANGUAGES));
    this.learningLanguages.set(normalizeLangs(stored.learningLanguages));
    this.appendTranslation.set(normalizeAppendFlags(stored.appendTranslation));
    // An unrecognised mode falls back to 'off' rather than being trusted: this key
    // decides whether the app spends money by itself.
    this.autoTranslateMode.set(
      AUTO_TRANSLATE_MODES.includes(stored.autoTranslateMode as AutoTranslateMode)
        ? (stored.autoTranslateMode as AutoTranslateMode)
        : 'off',
    );
    this.loadBool(stored.translateAllForeign, this.translateAllForeign);
    this.loadBool(stored.autoTranslateUsesAi, this.autoTranslateUsesAi);
    this.loadBool(stored.skipSameLanguageTranslation, this.skipSameLanguageTranslation);
  }

  private loadBool(value: boolean | undefined, target: WritableSignal<boolean>): void {
    if (typeof value === 'boolean') {
      target.set(value);
    }
  }

  private persist(): void {
    const prefs: StoredPrefs = {
      themeMode: this.themeMode(),
      accentId: this.accentId(),
      confirmBeforePost: this.confirmBeforePost(),
      delayedSend: this.delayedSend(),
      verifiedMode: this.verifiedMode(),
      readerFontSize: this.readerFontSize(),
      readerFontFamily: this.readerFontFamily(),
      readerTheme: this.readerTheme(),
      readerDictionary: this.readerDictionary(),
      readerDictionaryCustom: this.readerDictionaryCustom(),
      readerFontWeight: this.readerFontWeight(),
      readerLineHeight: this.readerLineHeight(),
      readerLetterSpacing: this.readerLetterSpacing(),
      readerWordSpacing: this.readerWordSpacing(),
      readerTextAlign: this.readerTextAlign(),
      readerPageFlip: this.readerPageFlip(),
      readerLibraryOpen: this.readerLibraryOpen(),
      readerLibraryCollapsed: [...this.readerLibraryCollapsed()],
      feedReader: this.feedReader(),
      autoRefreshTimeline: this.autoRefreshTimeline(),
      homeWindow: this.homeWindow(),
      showImages: this.showImages(),
      chatAudience: this.chatAudience(),
      aiMode: this.aiMode(),
      artStyle: this.artStyle(),
      rssCacheTtlHours: this.rssCacheTtlHours(),
      rssDensity: this.rssDensity(),
      rssScrollMarksRead: this.rssScrollMarksRead(),
      chatKind: this.chatKind(),
      feedMin: this.feedMin(),
      feedMax: this.feedMax(),
      ignoreFeedCooldown: this.ignoreFeedCooldown(),
      algoAudience: this.algoAudience(),
      algoCalm: this.algoCalm(),
      algoTags: this.algoTags(),
      favStyle: this.favStyle(),
      postNoun: this.postNoun(),
      customTerminology: this.customTerminology(),
      zenMode: this.zenMode(),
      analytics: this.analytics(),
      requireAltText: this.requireAltText(),
      thoughtfulPosting: this.thoughtfulPosting(),
      autoShowMiniComposer: this.autoShowMiniComposer(),
      warnOnPkmPublish: this.warnOnPkmPublish(),
      wizardSteps: this.wizardSteps(),
      customBg: this.customBg(),
      customLink: this.customLink(),
      customSidebar: this.customSidebar(),
      excludeUnknownLangTrends: this.excludeUnknownLangTrends(),
      uiLocale: this.uiLocale(),
      knownLanguages: this.knownLanguages(),
      hideForeignLangPosts: this.hideForeignLangPosts(),
      feedLanguages: this.feedLanguages(),
      learningLanguages: this.learningLanguages(),
      appendTranslation: this.appendTranslation(),
      autoTranslateMode: this.autoTranslateMode(),
      translateAllForeign: this.translateAllForeign(),
      autoTranslateUsesAi: this.autoTranslateUsesAi(),
      skipSameLanguageTranslation: this.skipSameLanguageTranslation(),
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    // Hidden providers live in their own account-scoped key, not the global blob.
    localStorage.setItem(
      scopedKey(HIDDEN_PROVIDERS_KEY_BASE),
      JSON.stringify(this.hiddenProviders()),
    );
    localStorage.setItem(scopedKey(DEFAULT_VISIBILITY_KEY_BASE), this.defaultVisibility());
    // Its own scoped key, not the shared blob: the vocabulary is per-account and
    // language-specific, so it must not follow the user to another login.
    localStorage.setItem(scopedKey(PKM_VOCABULARY_KEY_BASE), JSON.stringify(this.pkmVocabulary()));

    // Tell settings sync a synced key moved, so it schedules a debounced push.
    //
    // Only `mockingbird_client_prefs` above is actually synced — the three
    // account-scoped keys are not, because the settings document carries global
    // keys only. Marking dirty on any of them is deliberately imprecise: this
    // effect fires as one unit, distinguishing which half changed would mean
    // diffing the blob, and the cost of being wrong is one debounced request
    // that uploads identical bytes.
    //
    // Via the starter, not `ProfileSync` directly: this service is eager (theme
    // has to apply on every route) and a direct import would put the account
    // machinery in the initial bundle for every visitor. The call is a boolean
    // check until sync is confirmed on.
    this.profileSync.noteLocalChange();
  }

  /**
   * Load this account's PKM vocabulary.
   *
   * A *missing* key means "never configured" and takes the default. A key that
   * is present but has an empty list for a kind means the user switched that
   * kind off, and is honoured exactly as stored — which is the whole reason
   * this cannot be merged into the default on read.
   */
  private loadPkmVocabulary(): void {
    let raw: string | null;
    try {
      raw = localStorage.getItem(scopedKey(PKM_VOCABULARY_KEY_BASE));
    } catch {
      return;
    }
    if (!raw) {
      return;
    }
    try {
      this.pkmVocabulary.set(normalizeVocabulary(JSON.parse(raw) as Partial<PkmVocabulary>));
    } catch {
      // Corrupt value: keep the default rather than leaving the user with no
      // working tags at all.
    }
  }

  /**
   * Replace the PKM vocabulary, normalizing whatever the settings page
   * collected. The constructor's effect persists it; no explicit write here.
   */
  setPkmVocabulary(vocab: Partial<PkmVocabulary>): void {
    this.pkmVocabulary.set(normalizeVocabulary(vocab));
  }

  /** Restore the built-in words, for the settings page's reset affordance. */
  resetPkmVocabulary(): void {
    this.pkmVocabulary.set(DEFAULT_PKM_VOCABULARY);
  }

  /** Switch one publish-wizard step on or off. */
  setWizardStep(step: WizardStep, on: boolean): void {
    this.wizardSteps.update((steps) => ({ ...steps, [step]: on }));
  }

  /**
   * Load this account's cached posting default. Stored as a bare string (not
   * JSON) so a hand-inspected localStorage entry reads as `private` rather than
   * `"private"`; anything unrecognized falls back to `public`.
   */
  private loadDefaultVisibility(): void {
    let stored: string | null;
    try {
      stored = localStorage.getItem(scopedKey(DEFAULT_VISIBILITY_KEY_BASE));
    } catch {
      return;
    }
    const visibility = asVisibility(stored);
    if (visibility) {
      this.defaultVisibility.set(visibility);
    }
  }

  /**
   * Load the per-account hidden-provider filter. Prefers the account-scoped key;
   * falls back once to a legacy `hiddenProviders` still sitting in the global
   * prefs blob (migrating pre-scope installs so their current filter isn't lost),
   * then leaves the blob's copy to be dropped on the next persist.
   */
  private loadHiddenProviders(stored: StoredPrefs): void {
    const valid = (list: unknown): ProviderId[] =>
      Array.isArray(list) ? (list as ProviderId[]).filter((p) => PROVIDER_IDS.includes(p)) : [];
    const scoped = localStorage.getItem(scopedKey(HIDDEN_PROVIDERS_KEY_BASE));
    if (scoped !== null) {
      try {
        this.hiddenProviders.set(valid(JSON.parse(scoped)));
        return;
      } catch {
        // Corrupt scoped value: fall through to the legacy blob / default.
      }
    }
    if (Array.isArray(stored.hiddenProviders)) {
      this.hiddenProviders.set(valid(stored.hiddenProviders));
      // Consume the legacy blob copy for this account only, then strip it so no
      // other account inherits it on their first (unscoped) load.
      delete stored.hiddenProviders;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(stored));
      } catch {
        // If storage write fails, the next persist() still drops it.
      }
    }
  }

  private apply(): void {
    const mode = this.themeMode();
    const dark = mode === 'dark' || (mode === 'auto' && (this.darkQuery?.matches ?? false));
    this.resolvedTheme.set(dark ? 'dark' : 'light');
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-accent', this.accentId());
    root.setAttribute('data-feed-reader', this.feedReader() ? 'on' : 'off');
    root.setAttribute('data-images', this.showImages() ? 'on' : 'off');
    root.setAttribute('data-art', this.artStyle());
    root.style.setProperty('--reader-font-family', FONT_STACKS[this.readerFontFamily()]);
    root.style.setProperty('--reader-font-size', `${this.readerFontSize()}px`);
    root.style.setProperty('--reader-font-weight', `${this.readerFontWeight()}`);
    root.style.setProperty('--reader-line-height', `${this.readerLineHeight()}`);
    root.style.setProperty('--reader-letter-spacing', `${this.readerLetterSpacing()}px`);
    root.style.setProperty('--reader-word-spacing', `${this.readerWordSpacing()}px`);
    root.style.setProperty('--reader-text-align', this.readerTextAlign());
    // Article-only paper colour. `app` removes the variables so `.reader` falls
    // through to the page's own --bg/--fg rather than pinning either one.
    const paper = this.readerTheme();
    const colors = paper === 'app' ? null : READER_THEMES[paper];
    setOrRemove(root, '--reader-bg', colors?.bg ?? null);
    setOrRemove(root, '--reader-fg', colors?.fg ?? null);
    // Custom colors ride on top of the theme/accent as inline overrides;
    // clearing one falls back to whatever the palette defines.
    setOrRemove(root, '--bg', this.customBg());
    setOrRemove(root, '--accent', this.customLink());
    setOrRemove(root, '--accent-hover', this.customLink());
    setOrRemove(root, '--rail-bg', this.customSidebar());
  }
}

function setOrRemove(root: HTMLElement, prop: string, value: CustomColor): void {
  if (value) {
    root.style.setProperty(prop, value);
  } else {
    root.style.removeProperty(prop);
  }
}

function normalizeColor(color: CustomColor): CustomColor {
  return color && HEX_COLOR.test(color) ? color.toLowerCase() : null;
}
