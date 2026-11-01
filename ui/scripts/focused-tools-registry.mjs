import { readFile, readdir } from 'node:fs/promises';

// The tool page registry as one list, the same shape the app's
// focused-tools-all.ts builds: English entries from focused-tools.json, and
// each translation from tool-translations/ (its path in paths.json, its words
// in <lang>.json), inheriting everything else from its English original.
const app = new URL('../src/app/', import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));

export async function loadFocusedTools() {
  const english = await readJson(new URL('focused-tools.json', app));
  const paths = await readJson(new URL('tool-translations/paths.json', app));
  const copies = {};
  for (const lang of Object.keys(paths))
    copies[lang] = await readJson(new URL(`tool-translations/${lang}.json`, app));
  return english.flatMap((tool) => [
    tool,
    ...Object.keys(paths)
      .filter((lang) => paths[lang][tool.id])
      .map((lang) => {
        const copy = copies[lang][tool.id];
        return {
          ...tool,
          id: `${tool.id}-${lang}`,
          path: paths[lang][tool.id],
          title: copy.title,
          description: copy.description,
          sources: tool.sources ?? tool.path,
          prerenderCheck: { ...copy.prerenderCheck, tool: tool.prerenderCheck.tool },
          lang,
          translationOf: tool.id,
        };
      }),
  ]);
}

/** Every file the registry is read from, for dating the pages it lists. */
export async function registrySources() {
  const files = await readdir(new URL('tool-translations/', app));
  return [
    'src/app/focused-tools.json',
    ...files.map((file) => `src/app/tool-translations/${file}`),
  ];
}

/** The languages tool pages are translated into; each has an index at /<lang>/. */
export async function translatedLanguages() {
  return Object.keys(await readJson(new URL('tool-translations/paths.json', app)));
}

/** A language's folder in URLs: its code in lower case (zh-Hant -> zh-hant). */
export function languageFolder(lang) {
  return lang.toLowerCase();
}
