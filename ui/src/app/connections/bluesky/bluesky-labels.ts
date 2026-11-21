/**
 * Bluesky content labels → what a reader sees, as bsky.app decides it.
 *
 * Pure and API-free on purpose: StatusVisibility calls this for every card and
 * must not pull the Bluesky client into the root bundle. BlueskyModeration
 * fills the inputs (preferences and labeler definitions) from the account.
 *
 * The global label values and their defaults mirror `@atproto/api`'s
 * `LABELS` constant; that package is not a dependency, so they are restated
 * here. Custom values come from each subscribed labeler's own definitions.
 */

/** A label as the AppView hydrates it on posts and profiles. */
export interface BskyLabel {
  val: string;
  /** DID of whoever applied it: the author (a self-label) or a moderation service. */
  src?: string;
  /** What it is attached to: a record at-uri, or a DID for the whole account. */
  uri?: string;
  /** A negation withdraws an earlier label with the same value. */
  neg?: boolean;
}

/** A reader's setting for one label value. `show` is the legacy name for `ignore`. */
export type BskyLabelVisibility = 'ignore' | 'show' | 'warn' | 'hide';

/** `com.atproto.label.defs#labelValueDefinition`, the fields applied here. */
export interface BskyLabelDefinition {
  identifier: string;
  /** What a warning covers: the whole post, only its media, or nothing. */
  blurs: 'content' | 'media' | 'none';
  severity: 'inform' | 'alert' | 'none';
  defaultSetting?: BskyLabelVisibility;
  adultOnly?: boolean;
  /** Reader-facing name, from the definition's locales. */
  name?: string;
}

/** Everything the decision needs, gathered from the account's preferences. */
export interface BskyLabelInputs {
  /** `adultContentPref.enabled`. Off means adult-only labels hide, without exception. */
  adultContent: boolean;
  /**
   * `contentLabelPref` entries keyed by {@link labelPrefKey}: a global value
   * (no labeler) or a value scoped to the labeler that defines it.
   */
  prefs: ReadonlyMap<string, BskyLabelVisibility>;
  /** Custom label definitions, keyed by {@link labelDefKey}. */
  defs: ReadonlyMap<string, BskyLabelDefinition>;
  /** Subscribed labelers. Labels from anyone else are ignored. */
  labelers: readonly string[];
}

/** How a card should treat a post after its labels. */
export interface BskyLabelDecision {
  /** Leave the post out entirely. */
  hide: boolean;
  /** Collapse the whole post behind a warning naming these labels. */
  warn: string[];
  /** Blur the media until the reader reveals it. */
  blurMedia: boolean;
}

/** Bluesky's own moderation service; its labels always apply. */
const BSKY_MODERATION = 'did:plc:ar7c4by46qjdydhdevvrndac';

/**
 * The global label values. `!`-prefixed ones are system labels the reader
 * cannot configure; an author's own `!hide`/`!warn` is ignored (`noSelf`).
 */
const GLOBAL: Readonly<
  Record<string, BskyLabelDefinition & { fixed?: boolean; noSelf?: boolean }>
> = {
  '!hide': {
    identifier: '!hide',
    blurs: 'content',
    severity: 'alert',
    defaultSetting: 'hide',
    fixed: true,
    noSelf: true,
    name: 'Hidden by moderators',
  },
  '!warn': {
    identifier: '!warn',
    blurs: 'content',
    severity: 'none',
    defaultSetting: 'warn',
    fixed: true,
    noSelf: true,
    name: 'Content warning',
  },
  porn: {
    identifier: 'porn',
    blurs: 'media',
    severity: 'none',
    defaultSetting: 'hide',
    adultOnly: true,
    name: 'Adult content',
  },
  sexual: {
    identifier: 'sexual',
    blurs: 'media',
    severity: 'none',
    defaultSetting: 'warn',
    adultOnly: true,
    name: 'Sexually suggestive',
  },
  nudity: {
    identifier: 'nudity',
    blurs: 'media',
    severity: 'none',
    defaultSetting: 'ignore',
    name: 'Non-sexual nudity',
  },
  'graphic-media': {
    identifier: 'graphic-media',
    blurs: 'media',
    severity: 'none',
    defaultSetting: 'warn',
    adultOnly: true,
    name: 'Graphic media',
  },
};
/** The legacy name for `graphic-media`. */
const ALIASES: Readonly<Record<string, string>> = { gore: 'graphic-media' };

export function labelPrefKey(value: string, labelerDid?: string): string {
  return `${labelerDid ?? ''}|${value}`;
}

export function labelDefKey(labelerDid: string, identifier: string): string {
  return `${labelerDid}|${identifier}`;
}

/** Inputs before the account's preferences have loaded: bsky.app's defaults. */
export const DEFAULT_LABEL_INPUTS: BskyLabelInputs = {
  adultContent: false,
  prefs: new Map(),
  defs: new Map(),
  labelers: [],
};

/** Labels minus the ones a later negation withdrew. */
function effective(labels: readonly BskyLabel[]): BskyLabel[] {
  const withdrawn = new Set(
    labels.filter((l) => l.neg).map((l) => `${l.src ?? ''}|${l.uri ?? ''}|${l.val}`),
  );
  return labels.filter((l) => !l.neg && !withdrawn.has(`${l.src ?? ''}|${l.uri ?? ''}|${l.val}`));
}

/**
 * Decide one post (or account) from its labels.
 *
 * `authorDid` identifies self-labels. Labels from sources the reader has not
 * subscribed to are ignored, as the AppView would not even send them had it
 * been asked correctly. A value the reader set to `ignore` does nothing;
 * `warn` blurs what its definition blurs; `hide` leaves the post out. An
 * adult-only value always hides when adult content is off.
 */
export function decideLabels(
  labels: readonly BskyLabel[] | undefined,
  authorDid: string,
  inputs: BskyLabelInputs,
): BskyLabelDecision {
  const decision: BskyLabelDecision = { hide: false, warn: [], blurMedia: false };
  if (!labels?.length) return decision;
  const trusted = new Set([BSKY_MODERATION, ...inputs.labelers]);
  for (const label of effective(labels)) {
    const src = label.src ?? authorDid;
    const self = src === authorDid;
    if (!self && !trusted.has(src)) continue;
    const value = ALIASES[label.val] ?? label.val;
    const global = GLOBAL[value];
    const custom = global || self ? undefined : inputs.defs.get(labelDefKey(src, value));
    const def = global ?? custom;
    if (!def) continue; // An undefined custom value informs nobody: bsky.app skips it too.
    if (global?.noSelf && self) continue;

    let setting: BskyLabelVisibility =
      (global?.fixed
        ? undefined
        : inputs.prefs.get(labelPrefKey(value, custom ? src : undefined))) ??
      def.defaultSetting ??
      'warn';
    if (def.adultOnly && !inputs.adultContent) setting = 'hide';
    if (setting === 'ignore' || setting === 'show') continue;
    if (setting === 'hide') {
      decision.hide = true;
      continue;
    }
    if (def.blurs === 'content') decision.warn.push(def.name ?? value);
    else if (def.blurs === 'media') decision.blurMedia = true;
  }
  decision.warn = [...new Set(decision.warn)];
  return decision;
}

/**
 * A labeler's own definitions, from `app.bsky.labeler.getServices` with
 * `detailed=true`. The English name is preferred, then the first locale.
 */
export function definitionsOf(
  labelerDid: string,
  definitions: readonly {
    identifier: string;
    blurs?: string;
    severity?: string;
    defaultSetting?: string;
    adultOnly?: boolean;
    locales?: { lang: string; name: string }[];
  }[],
): [string, BskyLabelDefinition][] {
  return definitions.map((d) => {
    const locale = d.locales?.find((l) => l.lang.startsWith('en')) ?? d.locales?.[0];
    return [
      labelDefKey(labelerDid, d.identifier),
      {
        identifier: d.identifier,
        blurs: (['content', 'media', 'none'] as const).find((b) => b === d.blurs) ?? 'none',
        severity: (['inform', 'alert', 'none'] as const).find((s) => s === d.severity) ?? 'none',
        defaultSetting: (['ignore', 'show', 'warn', 'hide'] as const).find(
          (s) => s === d.defaultSetting,
        ),
        adultOnly: !!d.adultOnly,
        ...(locale?.name ? { name: locale.name } : {}),
      },
    ];
  });
}

/** The global labels a reader may set, in bsky.app's order. */
export const CONFIGURABLE_LABELS: readonly BskyLabelDefinition[] = [
  'porn',
  'sexual',
  'graphic-media',
  'nudity',
].map((id) => GLOBAL[id]);

/**
 * What the reader has a label set to now, as the settings page shows it:
 * `show` and `ignore` read the same, and an adult-only label is `hide` while
 * adult content is off.
 */
export function currentVisibility(
  def: BskyLabelDefinition,
  inputs: Pick<BskyLabelInputs, 'adultContent' | 'prefs'>,
  labelerDid?: string,
): 'ignore' | 'warn' | 'hide' {
  if (def.adultOnly && !inputs.adultContent) return 'hide';
  const value =
    inputs.prefs.get(labelPrefKey(def.identifier, labelerDid)) ?? def.defaultSetting ?? 'warn';
  return value === 'show' ? 'ignore' : value;
}
