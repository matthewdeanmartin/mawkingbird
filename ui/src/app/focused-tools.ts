import tools from './focused-tools.json';

/**
 * The focused mini-apps (public tool pages; spec in ui/docs/seo.md), as one list.
 *
 * Everything that has to agree about a tool page reads `focused-tools.json`: the
 * browser routes and the shell's trimmed nav (via `FOCUSED_APPS`), the sign-in
 * `?next=` allowlist, the prerender table in `main.server.ts`, the features
 * page, and the build scripts that write the sitemap, its dates and the no-JS
 * links and check the prerendered HTML. The scripts are plain Node, which is
 * why the list is JSON rather than TypeScript.
 *
 * Two things stay in code because they are code: each page's lazy loader
 * (`app.routes.ts`) and its prerender component (`main.server.ts`). Both are
 * keyed by `path`; the route spec and the SEO build fail on a missing one.
 */
export interface FocusedTool {
  /** Shell id for the mini-app; unique. */
  id: string;
  /** URL path without slashes; also the page's sitemap and canonical URL. */
  path: string;
  /** Route title and prerendered `<title>` ("… · Mawkingbird"). */
  title: string;
  /** Meta description, identical in the browser and the prerender. */
  description: string;
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
  /** What `check-seo-build.mjs` expects of the prerendered page. */
  prerenderCheck: { heading: string; copy: string; tool: string };
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

/** Languages a public page can be written in. */
export type PageLanguage = 'en' | 'de';

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

export const FOCUSED_TOOLS: readonly FocusedTool[] = tools as FocusedTool[];

/** The language a tool page is written in. */
export function toolLanguage(tool: FocusedTool): PageLanguage {
  return tool.lang ?? 'en';
}

/** The English originals: what /tools and the features page list. */
export const ENGLISH_TOOLS: readonly FocusedTool[] = FOCUSED_TOOLS.filter(
  (tool) => toolLanguage(tool) === 'en',
);

/**
 * Every language version of a tool, the original first: what `hreflang`
 * links. One entry when the tool has no translations.
 */
export function toolVersions(tool: FocusedTool): FocusedTool[] {
  const original = tool.translationOf
    ? FOCUSED_TOOLS.find((entry) => entry.id === tool.translationOf)
    : tool;
  if (!original) return [tool];
  return [original, ...FOCUSED_TOOLS.filter((entry) => entry.translationOf === original.id)];
}

/** One language version of a page, for `hreflang`. */
export interface PageAlternate {
  lang: PageLanguage;
  /** Path without slashes, as in the registry. */
  path: string;
}

/** The `hreflang` set for a tool page: empty when it exists in one language only. */
export function toolAlternates(tool: FocusedTool): PageAlternate[] {
  const versions = toolVersions(tool);
  return versions.length > 1
    ? versions.map((version) => ({ lang: toolLanguage(version), path: version.path }))
    : [];
}
