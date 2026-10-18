import { Injectable, signal } from '@angular/core';
import { BUILD_INFO } from './build-info';
import { isCanaryBuild, isTestBuild } from './build-flavor';

const STORAGE_KEY = 'mockingbird_feature_flags';
const DEV_BUILD_HASH = 'development';

export type FeatureFlagId =
  | 'pastebin'
  | 'links'
  | 'write'
  | 'unified-share'
  | 'mawkingbird-plus'
  | 'connector-mastodon'
  | 'connector-bluesky'
  | 'connector-twitter'
  | 'connector-mataroa'
  | 'connector-blogger'
  | 'connector-hugo'
  | 'connector-openrouter'
  | 'connector-raindrop'
  | 'connector-github'
  | 'connector-dropbox'
  | 'connector-link-shortener'
  | 'connector-cors-proxy'
  | 'connector-rss'
  | 'proxy-mawkingbird-plus'
  | 'proxy-allorigins'
  | 'proxy-corssh'
  | 'proxy-corsfix'
  | 'proxy-corslol';
/**
 * How far down the rollout ladder a feature has been released.
 *
 * Read as "on at this rung and below": `production` is everywhere, `canary` is
 * canary and test, `test` is test only. `off` is nowhere.
 */
export type FeatureFlagState = 'production' | 'canary' | 'test' | 'off';

/**
 * Flags are grouped only for display — a group is a heading on the settings
 * page, never a unit you can switch. An outage is per-vendor, so the switch is
 * per-vendor too.
 */
export type FeatureFlagGroup = 'features' | 'connectors' | 'proxies';

export interface FeatureFlagDefinition {
  id: FeatureFlagId;
  /**
   * Translation keys, not English.
   *
   * The strings a reader sees live in the `// i18n` declarations above
   * {@link FEATURE_FLAGS}, which `scripts/extract-i18n.mjs` reads into
   * `public/i18n/en.json`. Holding English here would put ~50 user-visible
   * strings outside the translation pipeline, where `check-i18n.mjs` cannot see
   * them and no locale could ever cover them.
   */
  labelKey: string;
  descriptionKey: string;
  defaultState: FeatureFlagState;
  group: FeatureFlagGroup;
}

interface StoredFeatureFlags {
  publishedHash: string;
  states: Partial<Record<FeatureFlagId, FeatureFlagState>>;
}

/**
 * A connector flag's description says what stops working, not what the service
 * is — the catalog already sells the service, and someone reading this screen
 * is deciding whether turning it off will cost them something.
 */
/** English for every flag label and description; see scripts/extract-i18n.mjs. */
// i18n flags.pastebin.label: Pastebin
// i18n flags.pastebin.description: Create, manage, and follow posts published through external paste services.
// i18n flags.links.label: Links
// i18n flags.links.description: Shorten URLs through Dub, Short.io or T.LY, and manage the links you have created.
// i18n flags.write.label: Write
// i18n flags.write.description: The writing workspace at /write — drafts, editor and notes side by side, plus zen mode.
// i18n flags.unifiedShare.label: Unified share menu
// i18n flags.unifiedShare.description: Collapse Boost, Quote and Share into one button on every post, opening a menu instead. Frees a slot on an action bar that already wraps on narrow screens.
// i18n flags.mawkingbirdPlus.label: Mawkingbird Plus
// i18n flags.mawkingbirdPlus.description: The Mawkingbird account tab in Settings, where you sign in to your Mawkingbird account.
// i18n flags.connectorMastodon.label: Mastodon
// i18n flags.connectorMastodon.description: Mastodon attached to a Bluesky-primary account: Explore, trends and tag timelines, read anonymously or signed in.
// i18n flags.connectorBluesky.label: Bluesky
// i18n flags.connectorBluesky.description: Bluesky posts in your timeline, replies and likes, and Bluesky DMs in Chat.
// i18n flags.connectorTwitter.label: Twitter
// i18n flags.connectorTwitter.description: Following and reading public Twitter accounts through a scraper service.
// i18n flags.connectorMataroa.label: Blog (Mataroa)
// i18n flags.connectorMataroa.description: Publishing blog posts and optionally including them on your profile.
// i18n flags.connectorBlogger.label: Blog (Blogger)
// i18n flags.connectorBlogger.description: Publishing posts and drafts to a Google Blogger blog.
// i18n flags.connectorHugo.label: Blog (Hugo)
// i18n flags.connectorHugo.description: Publishing posts to a Hugo site in a GitHub repository.
// i18n flags.connectorOpenrouter.label: OpenRouter
// i18n flags.connectorOpenrouter.description: AI search queries, hashtag suggestions and translation for read-only providers.
// i18n flags.connectorRaindrop.label: Raindrop.io
// i18n flags.connectorRaindrop.description: Saving posts and their links to a Raindrop.io collection.
// i18n flags.connectorGithub.label: GitHub
// i18n flags.connectorGithub.description: Finding the people you follow on GitHub, and reading unread notifications.
// i18n flags.connectorDropbox.label: Dropbox
// i18n flags.connectorDropbox.description: Browsing an app-specific Dropbox folder.
// i18n flags.connectorLinkShortener.label: Link shortener
// i18n flags.connectorLinkShortener.description: Shortening URLs as you write, and the list of links you have made.
// i18n flags.connectorCorsProxy.label: CORS proxy
// i18n flags.connectorCorsProxy.description: Relaying requests for sites that refuse browsers. Turning this off also stops the connectors that depend on it.
// i18n flags.connectorRss.label: RSS feeds
// i18n flags.connectorRss.description: Subscribing to RSS and Atom feeds, and merging them into your home timeline.
// i18n flags.proxyMawkingbirdPlus.label: Mawkingbird Plus proxy
// i18n flags.proxyMawkingbirdPlus.description: Offer the supporter tier of the Mawkingbird proxy. Needs an account and a subscription; the free Mawkingbird proxy is unaffected either way.
// i18n flags.proxyAllorigins.label: AllOrigins proxy
// i18n flags.proxyAllorigins.description: Offer AllOrigins as a CORS proxy. Strips custom headers, so no API key can travel through it, and it is frequently very slow.
// i18n flags.proxyCorssh.label: CORS.SH proxy
// i18n flags.proxyCorssh.description: Offer CORS.SH as a CORS proxy. Requires a free key before it will answer.
// i18n flags.proxyCorsfix.label: Corsfix proxy
// i18n flags.proxyCorsfix.description: Offer Corsfix as a CORS proxy. Fast, but a deployed site must register its domain first or every request is refused.
// i18n flags.proxyCorslol.label: cors.lol proxy
// i18n flags.proxyCorslol.description: Offer cors.lol as a CORS proxy. No signup, but it rate-limits aggressively — often on the first request of a session.
export const FEATURE_FLAGS: readonly FeatureFlagDefinition[] = [
  {
    id: 'pastebin',
    labelKey: 'flags.pastebin.label',
    descriptionKey: 'flags.pastebin.description',
    defaultState: 'production',
    group: 'features',
  },
  {
    id: 'links',
    labelKey: 'flags.links.label',
    descriptionKey: 'flags.links.description',
    defaultState: 'production',
    group: 'features',
  },
  {
    id: 'write',
    labelKey: 'flags.write.label',
    descriptionKey: 'flags.write.description',
    defaultState: 'production',
    group: 'features',
  },
  {
    id: 'unified-share',
    labelKey: 'flags.unifiedShare.label',
    // Says what turning it on changes, since this one is off by default and the
    // question a reader has is "what will this do to my posts".
    descriptionKey: 'flags.unifiedShare.description',
    // `test`, not `production`: this changes the action bar on every post in the
    // app, which is the most-used surface there is. It earns its way up rather
    // than starting at the top.
    defaultState: 'test',
    group: 'features',
  },
  {
    id: 'mawkingbird-plus',
    labelKey: 'flags.mawkingbirdPlus.label',
    // Says what switching it off removes, per the convention above. Nothing
    // else in the app depends on an account, so this genuinely only hides the
    // one settings tab — signed-out users lose no functionality.
    descriptionKey: 'flags.mawkingbirdPlus.description',
    // `test`, not `canary`: canary is production, on live billing, and this tab
    // leads to a checkout. Until there is a live Stripe price it must not be
    // reachable anywhere a real customer can press the button.
    defaultState: 'test',
    group: 'features',
  },
  {
    id: 'connector-mastodon',
    labelKey: 'flags.connectorMastodon.label',
    descriptionKey: 'flags.connectorMastodon.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-bluesky',
    labelKey: 'flags.connectorBluesky.label',
    descriptionKey: 'flags.connectorBluesky.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-twitter',
    labelKey: 'flags.connectorTwitter.label',
    descriptionKey: 'flags.connectorTwitter.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-mataroa',
    labelKey: 'flags.connectorMataroa.label',
    descriptionKey: 'flags.connectorMataroa.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-blogger',
    labelKey: 'flags.connectorBlogger.label',
    descriptionKey: 'flags.connectorBlogger.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-hugo',
    labelKey: 'flags.connectorHugo.label',
    descriptionKey: 'flags.connectorHugo.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-openrouter',
    labelKey: 'flags.connectorOpenrouter.label',
    descriptionKey: 'flags.connectorOpenrouter.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-raindrop',
    labelKey: 'flags.connectorRaindrop.label',
    descriptionKey: 'flags.connectorRaindrop.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-github',
    labelKey: 'flags.connectorGithub.label',
    descriptionKey: 'flags.connectorGithub.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-dropbox',
    labelKey: 'flags.connectorDropbox.label',
    descriptionKey: 'flags.connectorDropbox.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-link-shortener',
    labelKey: 'flags.connectorLinkShortener.label',
    descriptionKey: 'flags.connectorLinkShortener.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-cors-proxy',
    labelKey: 'flags.connectorCorsProxy.label',
    descriptionKey: 'flags.connectorCorsProxy.description',
    defaultState: 'production',
    group: 'connectors',
  },
  {
    id: 'connector-rss',
    labelKey: 'flags.connectorRss.label',
    descriptionKey: 'flags.connectorRss.description',
    defaultState: 'production',
    group: 'connectors',
  },
  // ------------------------------------------------------------- proxies
  //
  // The four public CORS proxies, all defaulting to `off`.
  //
  // Not a judgement about the operators — they run free services and mostly do
  // what they say. It is that recommending them produced a bad experience often
  // enough that offering them by default was doing users a disservice. Between
  // them: AllOrigins strips custom headers (so no API key can pass) and was
  // measured at 26s for a 1s call, and returns 522s under load; cors.lol 429'd
  // on nearly every request including the first of a session; Corsfix needs the
  // deployed domain registered before it answers at all; CORS.SH needs a key you
  // must go and get. Each is a different way for a first-time setup to fail
  // while looking like the app is broken.
  //
  // What is left on by default is the Mawkingbird proxy — destination-scoped,
  // and answerable to whoever runs it — and "your own proxy", which nobody else
  // can rate-limit or shut off. Anyone who wants one of these four back can turn
  // its flag on; the entries and their honest measured copy stay in the catalog
  // for exactly that.
  {
    id: 'proxy-mawkingbird-plus',
    labelKey: 'flags.proxyMawkingbirdPlus.label',
    descriptionKey: 'flags.proxyMawkingbirdPlus.description',
    // Paired with `mawkingbird-plus` above, and for the same reason: offering a
    // proxy tier nobody can buy is worse than not offering it.
    defaultState: 'test',
    group: 'proxies',
  },
  {
    id: 'proxy-allorigins',
    labelKey: 'flags.proxyAllorigins.label',
    descriptionKey: 'flags.proxyAllorigins.description',
    defaultState: 'off',
    group: 'proxies',
  },
  {
    id: 'proxy-corssh',
    labelKey: 'flags.proxyCorssh.label',
    descriptionKey: 'flags.proxyCorssh.description',
    defaultState: 'off',
    group: 'proxies',
  },
  {
    id: 'proxy-corsfix',
    labelKey: 'flags.proxyCorsfix.label',
    descriptionKey: 'flags.proxyCorsfix.description',
    defaultState: 'off',
    group: 'proxies',
  },
  {
    id: 'proxy-corslol',
    labelKey: 'flags.proxyCorslol.label',
    descriptionKey: 'flags.proxyCorslol.description',
    defaultState: 'off',
    group: 'proxies',
  },
];

/**
 * The flag that governs a proxy catalog entry, or null when it has none.
 *
 * Only the third-party proxies are flagged. The Mawkingbird proxy and the
 * bring-your-own entry deliberately have no flag: the first is the default this
 * app stands behind, and the second is a URL the user typed, which is not ours
 * to switch off.
 */
export function proxyFeatureFlag(proxyId: string): FeatureFlagId | null {
  switch (proxyId) {
    case 'mawkingbird-plus':
      return 'proxy-mawkingbird-plus';
    case 'allorigins':
      return 'proxy-allorigins';
    case 'corssh':
      return 'proxy-corssh';
    case 'corsfix':
      return 'proxy-corsfix';
    case 'corslol':
      return 'proxy-corslol';
    default:
      return null;
  }
}

const VALID_STATES: readonly FeatureFlagState[] = ['production', 'canary', 'test', 'off'];

/** Flags in one group, in declaration order — for the settings page's sections. */
export function flagsInGroup(group: FeatureFlagGroup): readonly FeatureFlagDefinition[] {
  return FEATURE_FLAGS.filter((flag) => flag.group === group);
}

/**
 * Where a deployment sits on the rollout ladder.
 *
 * Ordered, and the order is the whole point: a channel runs everything enabled
 * at its own rung *and below*. `test` sees the most, production the least.
 */
const CHANNEL_RANK = { production: 0, canary: 1, test: 2 } as const;

/** Which channel this build is. */
export type DeploymentChannel = keyof typeof CHANNEL_RANK;

/**
 * The channel this build is running as.
 *
 * Note that `test` is a channel here but **canary and production are the same
 * environment** — canary is a release channel on production infrastructure,
 * against live billing. The ladder is about which features are *visible*, not
 * about which backend is in use; those are separate questions and conflating
 * them is how a feature ends up enabled somewhere it cannot work.
 */
export function deploymentChannel(baseUri: string = document.baseURI): DeploymentChannel {
  if (isTestBuild(baseUri)) {
    return 'test';
  }
  return isCanaryBuild(baseUri) ? 'canary' : 'production';
}

/**
 * Resolve a rollout state for one concrete deployment channel.
 *
 * A feature flagged `canary` is on in canary *and* test, because test is
 * further down the ladder — a feature that skipped test on its way to canary
 * would make the test deployment useless for exactly the features most worth
 * testing.
 */
export function isFeatureEnabled(state: FeatureFlagState, channel: DeploymentChannel): boolean {
  if (state === 'off') {
    return false;
  }
  return CHANNEL_RANK[channel] >= CHANNEL_RANK[state];
}

/**
 * Browser-local rollout overrides for experimental UI features.
 *
 * Overrides are intentionally tied to the commit SHA embedded in the published
 * build. A different deployment starts from the defaults declared above rather
 * than carrying an override forward into code it was not chosen for.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlags {
  readonly publishedHash = BUILD_INFO.commit ?? DEV_BUILD_HASH;
  readonly isCanary = isCanaryBuild();
  /** Which rung of the rollout ladder this build is on. */
  readonly channel = deploymentChannel();
  readonly definitions = FEATURE_FLAGS;

  private readonly states = signal<Record<FeatureFlagId, FeatureFlagState>>(this.defaults());

  constructor() {
    this.load();
  }

  state(id: FeatureFlagId): FeatureFlagState {
    return this.states()[id];
  }

  enabled(id: FeatureFlagId): boolean {
    return isFeatureEnabled(this.states()[id], this.channel);
  }

  /**
   * Why a flagged-off surface is greyed out, or null when it is on.
   *
   * Disabled connectors stay visible rather than disappearing: a connector that
   * silently vanishes is a support question, and the flag is browser-local, so
   * the person looking at the grey card is exactly the person who can turn it
   * back on. The settings page linked from the card is where they do that.
   */
  disabledReason(id: FeatureFlagId): string | null {
    if (this.enabled(id)) {
      return null;
    }
    return this.state(id) === 'canary'
      ? 'Disabled by a feature flag — it is being tried on the canary build first.'
      : 'Disabled by a feature flag.';
  }

  setState(id: FeatureFlagId, state: FeatureFlagState): void {
    if (!VALID_STATES.includes(state)) {
      return;
    }
    this.states.update((states) => ({ ...states, [id]: state }));
    this.persist();
  }

  private defaults(): Record<FeatureFlagId, FeatureFlagState> {
    return Object.fromEntries(FEATURE_FLAGS.map((flag) => [flag.id, flag.defaultState])) as Record<
      FeatureFlagId,
      FeatureFlagState
    >;
  }

  private load(): void {
    try {
      const stored = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? 'null',
      ) as StoredFeatureFlags | null;
      if (stored?.publishedHash === this.publishedHash && stored.states) {
        const states = this.defaults();
        for (const flag of FEATURE_FLAGS) {
          const state = stored.states[flag.id];
          if (state && VALID_STATES.includes(state)) {
            states[flag.id] = state;
          }
        }
        this.states.set(states);
        return;
      }
    } catch {
      // Corrupt or unavailable storage starts from this build's defaults.
    }
    this.persist();
  }

  private persist(): void {
    try {
      const stored: StoredFeatureFlags = {
        publishedHash: this.publishedHash,
        states: this.states(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Feature flags still work for this tab when localStorage is unavailable.
    }
  }
}
