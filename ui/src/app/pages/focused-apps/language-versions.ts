import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbPopover } from '../../design-system/popover/popover';
import {
  PageAlternate,
  PageLanguage,
  TOOL_PAGES,
  toolLanguage,
  toolVersions,
} from '../../focused-tools';
import { TOOLS_INDEX_ALTERNATES } from '../../seo';
import { feedBuilderAlternates, feedBuilderPageAt } from '../feed-builder/feed-builder-registry';
import { AppOnlyLinkRel } from '../../public-page-urls';

/** Each language named in itself, so a reader finds their own. */
const ENDONYMS: Record<PageLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  pl: 'Polski',
  pt: 'Português',
  uk: 'Українська',
  hi: 'हिन्दी',
  nl: 'Nederlands',
  id: 'Bahasa Indonesia',
  ru: 'Русский',
  sv: 'Svenska',
  vi: 'Tiếng Việt',
  tr: 'Türkçe',
  'zh-Hant': '繁體中文',
};

interface Version {
  lang: PageLanguage;
  path: string;
  name: string;
  current: boolean;
}

/**
 * The page's language versions as one compact menu: the button names the
 * current language, the menu lists every version in its own name. Tool pages
 * read their versions from the registry, the tool indexes from
 * TOOLS_INDEX_ALTERNATES, topic pages from the Feed Builder registry. Nothing
 * renders for a page in one language only.
 *
 * The menu's links stay in the document while it is closed (a popover is
 * hidden, not removed), so the prerender carries a crawlable link to every
 * version beside the `hreflang` tags that say the same thing.
 */
@Component({
  selector: 'app-language-versions',
  imports: [RouterLink, AppOnlyLinkRel, MbPopover],
  template: `@if (versions.length > 1) {
    <mb-popover [label]="currentName" layout="list">
      <ul>
        @for (version of versions; track version.path) {
          <li>
            <a
              [routerLink]="'/' + version.path"
              [attr.hreflang]="version.lang"
              [attr.lang]="version.lang"
              [attr.aria-current]="version.current ? 'page' : null"
              >{{ version.name }}</a
            >
          </li>
        }
      </ul>
    </mb-popover>
  }`,
  styles: `
    :host {
      display: contents;
    }
    /* Next to "Open the app", not mid-header. */
    mb-popover {
      margin-inline-start: auto;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    a {
      display: block;
      min-height: 32px;
      padding: 6px 10px;
      border-radius: 4px;
      color: var(--text);
      text-decoration: none;
    }
    a:hover,
    a:focus-visible {
      background: var(--hover);
    }
    a:focus-visible {
      outline: 2px solid var(--text);
      outline-offset: -2px;
    }
    a[aria-current] {
      font-weight: 600;
    }
    @media (pointer: coarse) {
      a {
        min-height: 44px;
      }
    }
  `,
})
export class LanguageVersions {
  protected readonly versions = versionsAt(
    (inject(ActivatedRoute).snapshot?.pathFromRoot ?? [])
      .map((route) => route.routeConfig?.path)
      .filter((path): path is string => !!path)
      .join('/'),
  );
  protected readonly currentName = this.versions.find((version) => version.current)?.name ?? '';
}

/** Every version of the page at this path, the current one marked. */
function versionsAt(path: string): Version[] {
  const named = (alternates: PageAlternate[]) =>
    alternates.map(({ lang, path: versionPath }) => ({
      lang,
      path: versionPath,
      name: ENDONYMS[lang],
      current: versionPath === path,
    }));
  if (TOOLS_INDEX_ALTERNATES.some((index) => index.path === path))
    return named(TOOLS_INDEX_ALTERNATES);
  const topicPage = feedBuilderPageAt(path);
  if (topicPage) return named(feedBuilderAlternates(topicPage.topic));
  const tool = TOOL_PAGES.find((entry) => entry.path === path);
  if (!tool) return [];
  return named(
    toolVersions(tool).map((version) => ({ lang: toolLanguage(version), path: version.path })),
  );
}
