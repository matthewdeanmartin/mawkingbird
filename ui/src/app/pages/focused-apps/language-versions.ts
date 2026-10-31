import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FOCUSED_TOOLS, PageLanguage, toolLanguage, toolVersions } from '../../focused-tools';

/** Each language named in itself, so a reader finds their own. */
const ENDONYMS: Record<PageLanguage, string> = { en: 'English', de: 'Deutsch' };

/**
 * Links to this tool page in its other languages ("Deutsch" on the English
 * page, "English" on the German one), from the registry. Empty when the page
 * exists in one language only. Crawlable links in the prerender, alongside
 * the `hreflang` tags that say the same thing to search engines.
 */
@Component({
  selector: 'app-language-versions',
  imports: [RouterLink],
  template: `@for (version of others; track version.path) {
    <a
      class="language-switch"
      [routerLink]="'/' + version.path"
      [attr.hreflang]="version.lang"
      [attr.lang]="version.lang"
      >{{ version.name }}</a
    >
  }`,
  styles: `
    :host {
      display: contents;
    }
    .language-switch {
      margin-inline-start: auto;
      color: var(--muted);
    }
    .language-switch:hover {
      color: var(--accent);
    }
  `,
})
export class LanguageVersions {
  protected readonly others = otherVersions(
    (inject(ActivatedRoute).snapshot?.pathFromRoot ?? [])
      .map((route) => route.routeConfig?.path)
      .filter((path): path is string => !!path)
      .join('/'),
  );
}

function otherVersions(path: string): { lang: PageLanguage; path: string; name: string }[] {
  const tool = FOCUSED_TOOLS.find((entry) => entry.path === path);
  if (!tool) return [];
  return toolVersions(tool)
    .filter((version) => version.id !== tool.id)
    .map((version) => ({
      lang: toolLanguage(version),
      path: version.path,
      name: ENDONYMS[toolLanguage(version)],
    }));
}
