import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { LanguageSelect } from './language-select';

function setup(value = '') {
  const fixture = TestBed.createComponent(LanguageSelect);
  fixture.componentRef.setInput('value', value);
  const chosen: string[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => chosen.push(v));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const select = el.querySelector('select')!;
  const codesIn = (label: string) =>
    [...el.querySelectorAll<HTMLOptGroupElement>('optgroup')]
      .find((g) => g.label === label)
      ?.querySelectorAll('option') ?? [];
  const codes = (label: string) => [...codesIn(label)].map((o) => (o as HTMLOptionElement).value);
  return { fixture, el, select, chosen, codes };
}

describe('LanguageSelect', () => {
  beforeEach(() => localStorage.clear());

  it('offers the reader’s declared languages and every app language', () => {
    TestBed.inject(ClientPrefs).setKnownLanguages(['eo']);
    const { codes } = setup();
    expect(codes('Your languages')).toContain('eo');
    // Malay and Indonesian are app localizations, so they are always offered.
    const all = [...codes('Your languages'), ...codes('Languages Mawkingbird is translated into')];
    expect(all).toContain('ms');
    expect(all).toContain('id');
  });

  it('opens the finder from "All languages…" without changing the choice', () => {
    const { fixture, el, select, chosen } = setup('de');
    select.value = '__more__';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(chosen).toEqual([]);
    expect(select.value).toBe('de');
    expect(el.querySelector('app-language-finder-dialog')).not.toBeNull();
  });

  it('lists a language picked in the finder as the current choice', () => {
    const { codes } = setup('tok');
    expect(codes('Chosen')).toEqual(['tok']);
  });

  it('emits a choice and can rename the empty option', () => {
    const { fixture, select, chosen, el } = setup();
    select.value = 'ms';
    select.dispatchEvent(new Event('change'));
    expect(chosen).toEqual(['ms']);
    fixture.componentRef.setInput('anyLabel', 'Everyone');
    fixture.detectChanges();
    expect(el.querySelector('option')?.textContent?.trim()).toBe('Everyone');
  });
});
