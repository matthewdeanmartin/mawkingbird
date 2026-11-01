import tools from './focused-tools.json';
import translatedPaths from './tool-translations/paths.json';

/**
 * The focused mini-apps (public tool pages; spec in ui/docs/seo.md), as one list.
 *
 * Everything that has to agree about a tool page reads this registry: the
 * browser routes and the shell's trimmed nav (via `FOCUSED_APPS`), the sign-in
 * `?next=` allowlist, the prerender table in `main.server.ts`, the features
 * page, and the build scripts that write the sitemap, its dates and the no-JS
 * links and check the prerendered HTML. The scripts are plain Node, which is
 * why the data is JSON rather than TypeScript.
 *
 * English tools are `focused-tools.json`. A translation is only what differs:
 * its path in `tool-translations/paths.json` and its words in
 * `tool-translations/<lang>.json`; group, sign-in and tab come from the
 * original. The paths load with the app, so routes, `hreflang` and the
 * language switch know every version; the words load with the page that
 * needs them (`tool-copy.ts`), so a new language costs the first load about
 * a kilobyte. `focused-tools-all.ts` has the full list, for the server and
 * specs; `scripts/focused-tools-registry.mjs` builds the same for the scripts.
 *
 * Two things stay in code because they are code: each page's lazy loader
 * (`app.routes.ts`) and its prerender component (`main.server.ts`). Both are
 * keyed by `path`; the route spec and the SEO build fail on a missing one.
 */
export interface ToolPage {
  /** Shell id for the mini-app; unique. A translation's is `<original>-<lang>`. */
  id: string;
  /** URL path without slashes; also the page's sitemap and canonical URL. */
  path: string;
  /** The heading it is listed under on /tools. */
  group: FocusedToolGroup;
  /**
   * Directory under `src/app/pages/` whose commits date the sitemap entry, when
   * it is not `path` (two URLs sharing one page component).
   */
  sources?: string;
  /** Who gets the shell twin: a Mastodon session, or either network. */
  signIn: 'mastodon' | 'any';
  /** The tool's own tab in the trimmed nav, before Invite. */
  tab: { id: string; labelKey: string; icon: string };
  /**
   * The language the page is written in; English when absent. The page renders
   * in it for every visitor (see `provideRouteLanguage`), and it becomes the
   * prerender's `<html lang>`.
   */
  lang?: PageLanguage;
  /**
   * For a page in another language, the `id` of the English tool it
   * translates. The two link to each other with `hreflang`. Only English
   * tools are listed on /tools and the features page.
   */
  translationOf?: string;
}

/** A tool page with its words: what a page title, meta tags and lists need. */
export interface FocusedTool extends ToolPage {
  /** Route title and prerendered `<title>` ("… · Mawkingbird"). */
  title: string;
  /** Meta description, identical in the browser and the prerender. */
  description: string;
  /** What `check-seo-build.mjs` expects of the prerendered page. */
  prerenderCheck: { heading: string; copy: string; tool: string };
}

/** A translation's own words (`tool-translations/<lang>.json`, by English id). */
export interface ToolCopy {
  title: string;
  description: string;
  prerenderCheck: { heading: string; copy: string };
}

/** Languages a public page can be written in. */
export type PageLanguage = 'en' | 'de' | 'es' | 'fr' | 'it' | 'ja' | 'ko' | 'pl' | 'pt' | 'zh-Hant';

/** A language's folder in URLs: its code in lower case (`zh-Hant` → `/zh-hant/`). */
export function languageFolder(lang: PageLanguage): string {
  return lang.toLowerCase();
}

/** The languages tool pages are translated into, from `paths.json`. */
export type TranslatedLanguage = Exclude<PageLanguage, 'en'>;

export type FocusedToolGroup = 'start' | 'languages' | 'search' | 'people' | 'post' | 'account';

/** The /tools headings, in page order. */
export const FOCUSED_TOOL_GROUPS: readonly { id: FocusedToolGroup; title: string }[] = [
  { id: 'start', title: 'Start on Mastodon' },
  { id: 'languages', title: 'Your languages' },
  { id: 'search', title: 'Search' },
  { id: 'people', title: 'Find your people' },
  { id: 'post', title: 'Post' },
  { id: 'account', title: 'Look after your account' },
];

/** The English originals: what /tools and the features page list. */
export const ENGLISH_TOOLS: readonly FocusedTool[] = tools as FocusedTool[];

/** Each translated language's paths, by English id. */
export const TRANSLATED_PATHS = translatedPaths as Record<
  TranslatedLanguage,
  Record<string, string>
>;

/** A translated page, from its original and its path. */
export function translatedPage(
  original: ToolPage,
  lang: TranslatedLanguage,
  path: string,
): ToolPage {
  const { id, group, sources, signIn, tab } = original;
  return {
    id: `${id}-${lang}`,
    path,
    group,
    sources: sources ?? original.path,
    signIn,
    tab,
    lang,
    translationOf: id,
  };
}

/** Every tool page, each English original followed by its translations. */
export const TOOL_PAGES: readonly ToolPage[] = ENGLISH_TOOLS.flatMap((tool) => [
  tool,
  ...(Object.keys(TRANSLATED_PATHS) as TranslatedLanguage[])
    .filter((lang) => TRANSLATED_PATHS[lang][tool.id])
    .map((lang) => translatedPage(tool, lang, TRANSLATED_PATHS[lang][tool.id])),
]);

/** The language a tool page is written in. */
export function toolLanguage(tool: ToolPage): PageLanguage {
  return tool.lang ?? 'en';
}

/**
 * Every language version of a tool, the original first: what `hreflang`
 * links. One entry when the tool has no translations.
 */
export function toolVersions(tool: ToolPage): ToolPage[] {
  const originalId = tool.translationOf ?? tool.id;
  return TOOL_PAGES.filter((entry) => (entry.translationOf ?? entry.id) === originalId);
}

/**
 * The tool page a route is on, from the paths of its steps (the signed-in twin
 * nests the page under the tool's path), in any language.
 */
export function toolPageAt(paths: readonly string[]): ToolPage | undefined {
  return TOOL_PAGES.find((page) => paths.includes(page.path));
}

/** The English path of the tool a page translates (its own, when English). */
export function originalPath(page: ToolPage): string | undefined {
  return ENGLISH_TOOLS.find((tool) => tool.id === (page.translationOf ?? page.id))?.path;
}

/** One language version of a page, for `hreflang`. */
export interface PageAlternate {
  lang: PageLanguage;
  /** Path without slashes, as in the registry. */
  path: string;
}

/** The `hreflang` set for a tool page: empty when it exists in one language only. */
export function toolAlternates(tool: ToolPage): PageAlternate[] {
  const versions = toolVersions(tool);
  return versions.length > 1
    ? versions.map((version) => ({ lang: toolLanguage(version), path: version.path }))
    : [];
}

/** Where a tool's page component lives (`TOOL_PAGE_MODULES`, `main.server.ts`). */
export interface ToolPageModule {
  load: () => Promise<unknown>;
  /** The English page's class; a translation's adds its language (`CrosspostFr`). */
  component: string;
  /** One class renders every language (from a copy file), so no subclasses. */
  oneForAll?: true;
}

/** The class a page in this language uses: `Crosspost`, `CrosspostFr`, `CrosspostZhHant`. */
export function toolComponentName(
  page: Pick<ToolPageModule, 'component' | 'oneForAll'>,
  lang: PageLanguage,
): string {
  if (lang === 'en' || page.oneForAll) return page.component;
  return (
    page.component +
    lang
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join('')
  );
}
