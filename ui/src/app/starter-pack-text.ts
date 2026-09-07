import { inject, Pipe, PipeTransform } from '@angular/core';
import { UiLocale } from './i18n/locale';
import messages from './starter-pack-ui.json';

/** This small, hand-maintained dictionary belongs only to starter packs. */
const dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>> = messages;

export function packLanguage(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0];
}

export function starterPackText(
  key: string,
  language: string,
  params: Record<string, unknown> = {},
): string {
  const template = dictionaries[packLanguage(language)]?.[key] ?? dictionaries['en'][key] ?? key;
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
