import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { ClientPrefs } from '../../client-prefs';
import { UiLocale } from '../../i18n/locale';
import { LanguageLanding } from './language-landing';
import { LanguageChecklist } from './language-checklist';
import { LANGUAGE_LANDING_COPY } from './language-landing.copy';

/** The route snapshot a registry path produces, standalone or as the shell twin. */
function routeFor(path: string, inShell: boolean, lang: string) {
  const own = { routeConfig: { path: inShell ? '' : path } };
  const parent = { routeConfig: { path } };
  return {
    snapshot: {
      data: { inShell, lang },
      pathFromRoot: inShell ? [{ routeConfig: null }, parent, own] : [{ routeConfig: null }, own],
    },
  };
}

describe('LanguageLanding', () => {
  async function render(path: string, inShell: boolean, lang: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [LanguageLanding],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeFor(path, inShell, lang) },
        // The checklist reads the account when it renders inside the shell.
        { provide: Api, useValue: { verifyCredentials: () => new Subject() } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(LanguageLanding);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('pitches German readers in German, and signs in back to the page', async () => {
    const root = await render('de/mastodon-auf-deutsch', false, 'de');
    expect(root.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(root.querySelector('h1')?.textContent).toBe('Mastodon auf Deutsch');
    expect(root.querySelectorAll('.claims li').length).toBeGreaterThan(3);
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fde%2Fmastodon-auf-deutsch',
    );
    expect(root.querySelector('app-language-checklist')).toBeNull();
  });

  it('offers the checklist instead of the pitch inside the shell, by the parent path', async () => {
    const root = await render('learn-english-with-mastodon', true, 'en');
    expect(root.querySelector('h1')?.textContent).toBe('Learn English with Mastodon');
    expect(root.querySelector('.claims')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
    expect(root.querySelector('header')).toBeNull();
  });
});

describe('LanguageChecklist', () => {
  let fixture: ComponentFixture<LanguageChecklist>;
  let root: HTMLElement;
  let api: {
    verifyCredentials: ReturnType<typeof vi.fn>;
    updateCredentials: ReturnType<typeof vi.fn>;
  };

  function setUp(page: string, update = () => of({})): void {
    api = {
      verifyCredentials: vi.fn(() => of({ source: { language: 'en' } })),
      updateCredentials: vi.fn(update),
    };
    TestBed.configureTestingModule({
      imports: [LanguageChecklist],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Api, useValue: api },
      ],
    });
    fixture = TestBed.createComponent(LanguageChecklist);
    fixture.componentRef.setInput('copy', LANGUAGE_LANDING_COPY[page]);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  const labels = () =>
    [...root.querySelectorAll('mb-checkbox')].map((box) => ({
      text: box.querySelector('label')?.textContent?.trim(),
      checked: (box.querySelector('input') as HTMLInputElement).checked,
    }));

  it('changes nothing until Apply, and shows the server value it would change', () => {
    setUp('de/mastodon-auf-deutsch');
    const prefs = TestBed.inject(ClientPrefs);
    const choose = vi.spyOn(TestBed.inject(UiLocale), 'choose');
    expect(labels().find((l) => l.text === 'Ich lerne Englisch')?.checked).toBe(false);
    expect(labels().find((l) => l.text === 'Oberfläche auf Deutsch')?.checked).toBe(true);
    expect(root.textContent).toContain('Auf deinem Server en → de');
    expect(choose).not.toHaveBeenCalled();
    expect(prefs.hideForeignLangPosts()).toBe(false);
    expect(api.updateCredentials).not.toHaveBeenCalled();
  });

  it('applies every ticked setting through the same services as Settings', async () => {
    setUp('de/mastodon-auf-deutsch');
    const prefs = TestBed.inject(ClientPrefs);
    const choose = vi.spyOn(TestBed.inject(UiLocale), 'choose');
    await (fixture.componentInstance as unknown as { apply(): Promise<void> }).apply();
    fixture.detectChanges();

    expect(choose).toHaveBeenCalledWith('de');
    expect(prefs.knownLanguages()).toEqual(expect.arrayContaining(['de', 'en']));
    expect(prefs.hideForeignLangPosts()).toBe(true);
    expect(prefs.excludeUnknownLangTrends()).toBe(true);
    expect(prefs.learningLanguages()).not.toContain('en');
    const form = api.updateCredentials.mock.calls[0][0] as FormData;
    expect(form.get('source[language]')).toBe('de');
    expect(prefs.postingLanguage()).toBe('de');
    expect(root.querySelector('#done-title')?.textContent).toBe('Erledigt');
    expect(root.querySelector('a[href="/home"]')?.textContent?.trim()).toBe('Zu deiner Startseite');
  });

  it('sets up a learner without touching the languages they read', async () => {
    setUp('learn-english-with-mastodon');
    const prefs = TestBed.inject(ClientPrefs);
    const choose = vi.spyOn(TestBed.inject(UiLocale), 'choose');
    await (fixture.componentInstance as unknown as { apply(): Promise<void> }).apply();
    expect(prefs.learningLanguages()).toContain('en');
    expect(choose).not.toHaveBeenCalled();
    expect(api.updateCredentials).not.toHaveBeenCalled();
    expect(prefs.hideForeignLangPosts()).toBe(false);
  });

  it('says so when the server refuses the posting language, and applies the rest', async () => {
    setUp('mastodon-in-english', () => throwError(() => new Error('403')));
    const prefs = TestBed.inject(ClientPrefs);
    await (fixture.componentInstance as unknown as { apply(): Promise<void> }).apply();
    fixture.detectChanges();
    expect(root.querySelector('mb-notice')?.textContent).toContain("couldn't be saved");
    expect(prefs.hideForeignLangPosts()).toBe(true);
    const applied = [...root.querySelectorAll('.applied li')].map((li) => li.textContent);
    expect(applied).not.toContain('My posts are in English');
    expect(applied).toContain("Hide posts in languages I don't read");
  });
});
