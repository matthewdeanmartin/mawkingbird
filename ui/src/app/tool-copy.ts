import type { ResolveFn } from '@angular/router';
import {
  ENGLISH_TOOLS,
  FocusedTool,
  PageLanguage,
  TOOL_PAGES,
  ToolCopy,
  ToolPage,
  TranslatedLanguage,
  toolLanguage,
} from './focused-tools';

/**
 * Each translation's words, loaded with the first page that needs them rather
 * than with the app (see focused-tools.ts). One line per language.
 */
const COPY: Record<TranslatedLanguage, () => Promise<Record<string, ToolCopy>>> = {
  de: () => import('./tool-translations/de.json').then((m) => m.default),
  es: () => import('./tool-translations/es.json').then((m) => m.default),
  fr: () => import('./tool-translations/fr.json').then((m) => m.default),
  it: () => import('./tool-translations/it.json').then((m) => m.default),
  ja: () => import('./tool-translations/ja.json').then((m) => m.default),
  ko: () => import('./tool-translations/ko.json').then((m) => m.default),
  pl: () => import('./tool-translations/pl.json').then((m) => m.default),
  pt: () => import('./tool-translations/pt.json').then((m) => m.default),
  'zh-Hant': () => import('./tool-translations/zh-Hant.json').then((m) => m.default),
};

/** A tool page with its words: the English entry, or the translation's. */
export async function withCopy(page: ToolPage): Promise<FocusedTool> {
  const lang = toolLanguage(page);
  const original = ENGLISH_TOOLS.find((tool) => tool.id === (page.translationOf ?? page.id));
  if (!original) throw new Error(`No English tool for ${page.id}`);
  if (lang === 'en') return original;
  const copy = (await COPY[lang]())[original.id];
  return {
    ...page,
    title: copy.title,
    description: copy.description,
    prerenderCheck: { ...copy.prerenderCheck, tool: original.prerenderCheck.tool },
  };
}

/** Every tool page in one language, with its words: what a language's index lists. */
export function toolsIn(lang: PageLanguage): Promise<FocusedTool[]> {
  return Promise.all(
    TOOL_PAGES.filter((page) => toolLanguage(page) === lang).map((page) => withCopy(page)),
  );
}

/** A translated tool route's title, resolved when the route is visited. */
export function toolTitle(page: ToolPage): ResolveFn<string> {
  return () => withCopy(page).then((tool) => tool.title);
}

/** A translated tool route's meta description, resolved likewise. */
export function toolDescription(page: ToolPage): ResolveFn<string> {
  return () => withCopy(page).then((tool) => tool.description);
}

/** A language index route's tools, resolved likewise. */
export function toolsResolver(lang: PageLanguage): ResolveFn<FocusedTool[]> {
  return () => toolsIn(lang);
}
