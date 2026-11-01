import {
  ENGLISH_TOOLS,
  FocusedTool,
  TOOL_PAGES,
  ToolCopy,
  TranslatedLanguage,
  toolLanguage,
} from './focused-tools';
import de from './tool-translations/de.json';
import es from './tool-translations/es.json';
import fr from './tool-translations/fr.json';
import it from './tool-translations/it.json';
import ja from './tool-translations/ja.json';
import ko from './tool-translations/ko.json';
import pl from './tool-translations/pl.json';
import pt from './tool-translations/pt.json';
import zhHant from './tool-translations/zh-Hant.json';

/**
 * Every tool page with its words, at once: for the server's prerender table
 * and the specs, never the browser bundle (it would carry every language).
 * The browser loads one language's words at a time (`tool-copy.ts`).
 */
export const TOOL_COPY: Record<TranslatedLanguage, Record<string, ToolCopy>> = {
  de,
  es,
  fr,
  it,
  ja,
  ko,
  pl,
  pt,
  'zh-Hant': zhHant,
};

export const FOCUSED_TOOLS: readonly FocusedTool[] = TOOL_PAGES.map((page) => {
  const lang = toolLanguage(page);
  const original = ENGLISH_TOOLS.find((tool) => tool.id === (page.translationOf ?? page.id))!;
  if (lang === 'en') return original;
  const copy = TOOL_COPY[lang][original.id];
  return {
    ...page,
    title: copy.title,
    description: copy.description,
    prerenderCheck: { ...copy.prerenderCheck, tool: original.prerenderCheck.tool },
  };
});
