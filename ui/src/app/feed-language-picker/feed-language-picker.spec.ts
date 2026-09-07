import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../../public/i18n/en.json';
import { ClientPrefs } from '../client-prefs';
import { FeedLanguagePicker } from './feed-language-picker';

describe('FeedLanguagePicker', () => {
  let prefs: ClientPrefs;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [FeedLanguagePicker] });
    prefs = TestBed.inject(ClientPrefs);
    // A trilingual reader, so the cap is reachable in these tests.
    prefs.setKnownLanguages(['en', 'eo', 'fr', 'de']);
  });

  function render(): ComponentFixture<FeedLanguagePicker> {
    const fixture = TestBed.createComponent(FeedLanguagePicker);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * The menu's rows, opening it first if it is closed. Idempotent on purpose —
   * the button toggles, so a helper that always clicked would close the menu on
   * its second call.
   */
  function rows(fixture: ComponentFixture<FeedLanguagePicker>): HTMLButtonElement[] {
    const el = fixture.nativeElement as HTMLElement;
    if (!el.querySelector('.lang-menu')) {
      (el.querySelector('.lang-button') as HTMLButtonElement).click();
      fixture.detectChanges();
    }
    return [...el.querySelectorAll<HTMLButtonElement>('.lang-menu .lang-row')];
  }

  /** A row's label without the ✓ gutter that marks the current selection. */
  function labelOf(row: Element): string {
    return (row.textContent ?? '').replace('✓', '').trim();
  }

  function rowFor(fixture: ComponentFixture<FeedLanguagePicker>, label: string): HTMLButtonElement {
    const match = rows(fixture).find((r) => labelOf(r) === label);
    if (!match) {
      throw new Error(`No menu row for ${label}`);
    }
    return match;
  }

  it('starts on All languages and offers the languages the user knows', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.lang-button')!.textContent).toContain('All');

    const labels = rows(fixture).map(labelOf);
    expect(labels).toContain('All languages');
    expect(labels).toContain('Every language I know');
    expect(labels).toContain('Esperanto');
    expect(labels).toContain('English');
  });

  it('narrowing to one language turns the filter on and names it', () => {
    const fixture = render();
    rowFor(fixture, 'Esperanto').click();
    fixture.detectChanges();

    expect(prefs.feedLanguages()).toEqual(['eo']);
    // Choosing a language must actually filter, or the control does nothing.
    expect(prefs.hideForeignLangPosts()).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.lang-button')!.textContent,
    ).toContain('Esperanto');
  });

  it('names a pair, and falls back to a count past two', () => {
    const fixture = render();
    rowFor(fixture, 'English').click();
    rowFor(fixture, 'Esperanto').click();
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('.lang-button')!;
    expect(button.textContent).toContain('English + Esperanto');

    rowFor(fixture, 'French').click();
    fixture.detectChanges();
    expect(button.textContent).toContain('3 languages');
  });

  it('caps the selection at three and disables the rest', () => {
    const fixture = render();
    for (const name of ['English', 'Esperanto', 'French']) {
      rowFor(fixture, name).click();
      fixture.detectChanges();
    }
    expect(prefs.feedLanguages()).toEqual(['en', 'eo', 'fr']);

    const german = rowFor(fixture, 'German');
    expect(german.disabled).toBe(true);
    german.click();
    fixture.detectChanges();
    // Still three: a quadrilingual reader is told to use "All" instead.
    expect(prefs.feedLanguages()).toEqual(['en', 'eo', 'fr']);
  });

  it('deselecting the last language falls back to every known language, not an empty feed', () => {
    const fixture = render();
    rowFor(fixture, 'Esperanto').click();
    fixture.detectChanges();
    rowFor(fixture, 'Esperanto').click();
    fixture.detectChanges();

    expect(prefs.feedLanguages()).toEqual([]);
    expect(prefs.hideForeignLangPosts()).toBe(true);
  });

  it('All languages clears both the narrowing and the filter', () => {
    const fixture = render();
    rowFor(fixture, 'Esperanto').click();
    fixture.detectChanges();
    rowFor(fixture, 'All languages').click();
    fixture.detectChanges();

    expect(prefs.feedLanguages()).toEqual([]);
    expect(prefs.hideForeignLangPosts()).toBe(false);
  });
  /**
   * Regression: the button read `feedLanguagePicker.myLanguages` in production.
   *
   * {@link FeedLanguagePicker.label} is a `computed()` that calls the
   * *imperative* `translate()`. In production the dictionary arrives over HTTP
   * after first paint, so that first evaluation returned the key — and because
   * a `computed()` caches until a dependency changes, and none of `label`'s
   * other dependencies change on their own, the key stayed on screen forever.
   *
   * Every other spec here is blind to this: `translocoTesting()` preloads
   * `en.json` synchronously, so `translate()` never has a chance to miss. This
   * one reproduces the real ordering by rendering against an *empty* dictionary
   * and only then loading English, the way the HTTP loader does.
   */
  it('picks up its label when the dictionary lands after first paint', () => {
    const transloco = TestBed.inject(TranslocoService);
    // First paint with nothing loaded: this is where the key used to stick.
    transloco.setTranslation({}, 'en', { merge: false });
    prefs.setFeedLanguages([]);
    prefs.setHideForeignLangPosts(true);

    const fixture = render();
    const button = () =>
      (fixture.nativeElement as HTMLElement).querySelector('.lang-button')!.textContent ?? '';
    expect(button()).toContain('feedLanguagePicker.myLanguages');

    // The dictionary arrives; the label must follow it.
    transloco.setTranslation(en, 'en', { merge: false });
    fixture.detectChanges();
    expect(button()).toContain('My languages');
    expect(button()).not.toContain('feedLanguagePicker');
  });
});
