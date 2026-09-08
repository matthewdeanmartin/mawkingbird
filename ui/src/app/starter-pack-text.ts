import { inject, Pipe, PipeTransform } from '@angular/core';
import { UiLocale } from './i18n/locale';
import messages from './starter-pack-ui.json';

/** This small, hand-maintained dictionary belongs only to starter packs. */
const dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>> = messages;

export function packLanguage(code: string): string {
  try {
    const locale = new Intl.Locale(code.replaceAll('_', '-'));
    // Keep Traditional Chinese distinct from the catalogue's generic Chinese.
    const script =
      locale.script ?? (locale.language === 'zh' ? locale.maximize().script : undefined);
    return script ? `${locale.language}-${script}` : locale.language;
  } catch {
    return code.toLowerCase().split(/[-_]/)[0];
  }
}

export function starterPackText(
  key: string,
  language: string,
  params: Record<string, unknown> = {},
): string {
  const normalized = packLanguage(language);
  const template =
    dictionaries[normalized]?.[key] ??
    dictionaries[normalized.split('-')[0]]?.[key] ??
    dictionaries['en'][key] ??
    key;
  return template.replace(/{{\s*(\w+)\s*}}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/** Explicit pack language never changes Transloco's active language or saved preferences. */
@Pipe({ name: 'packText', pure: false })
export class StarterPackTextPipe implements PipeTransform {
  private readonly locale = inject(UiLocale);

  transform(key: string, language?: string, params?: Record<string, unknown>): string {
    return starterPackText(key, language ?? this.locale.active(), params);
  }
}
