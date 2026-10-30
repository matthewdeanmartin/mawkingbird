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
}

export const FOCUSED_TOOLS: readonly FocusedTool[] = tools as FocusedTool[];
