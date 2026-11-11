import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, TitleStrategy, provideRouter } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import en from '../../../public/i18n/en.json';
import de from '../../../public/i18n/de.json';
import { PageTitleStrategy } from '../shell/a11y/page-title-strategy';
import { TranslocoLocaleSync } from './locale';
import { translocoTesting } from './i18n.testing';
import { PageLanguageState, provideRouteLanguage, routeTranslate } from './page-language';

@Component({ template: 'page' })
class Plain {}

/** A page pinned to its route's language, with pipe-rendered and code-built text. */
@Component({
  imports: [TranslocoPipe],
  providers: [provideRouteLanguage()],
  template: `<p class="pipe">{{ 'mediaDownload.title' | transloco }}</p>
    <p class="code">{{ built() }}</p>`,
})
class Pinned {
  protected built = routeTranslate('mediaDownload.saved', { count: 3 });
}

const alternates = [
  { lang: 'en', path: 'download-mastodon-images' },
  { lang: 'de', path: 'mastodon-bilder-herunterladen' },
];

describe('page language', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.head.querySelectorAll('link[rel="alternate"]').forEach((node) => node.remove());
    TestBed.configureTestingModule({
      imports: [translocoTesting({ langs: { en, de } })],
      providers: [
        provideRouter([
          {
            path: 'mastodon-bilder-herunterladen',
            component: Pinned,
            title: 'Bilder',
            data: { seoIndexable: true, lang: 'de', seoAlternates: alternates },
          },
          {
            path: 'download-mastodon-images',
            component: Pinned,
            title: 'Images',
            data: { seoIndexable: true, lang: 'en', seoAlternates: alternates },
          },
          // The signed-in twin: same language, but the shell is not indexable.
          { path: 'shell-twin', component: Pinned, title: 'Twin', data: { lang: 'de' } },
          { path: 'settings', component: Plain, title: 'Settings' },
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
  });

  afterEach(() => {
    document.documentElement.lang = 'en';
    document.head.querySelectorAll('link[rel="alternate"]').forEach((node) => node.remove());
  });

  const hreflangs = () =>
    [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')].map(
      (link) => `${link.getAttribute('hreflang')} ${link.getAttribute('href')}`,
    );

  it('declares a public page’s language and links its other language versions', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/mastodon-bilder-herunterladen');
    expect(document.documentElement.lang).toBe('de');
    expect(TestBed.inject(PageLanguageState).lang()).toBe('de');
    expect(hreflangs()).toEqual([
      'en https://mawkingbird.com/download-mastodon-images/',
      'de https://mawkingbird.com/mastodon-bilder-herunterladen/',
      'x-default https://mawkingbird.com/download-mastodon-images/',
    ]);

    // Leaving for an ordinary page takes all of it away again.
    await router.navigateByUrl('/settings');
    expect(TestBed.inject(PageLanguageState).lang()).toBeNull();
    expect(hreflangs()).toEqual([]);

    // The signed-in twin is not indexable: the interface language keeps the document.
    await router.navigateByUrl('/shell-twin');
    expect(TestBed.inject(PageLanguageState).lang()).toBeNull();
  });

  it('renders a German page in German for a visitor whose interface is English', async () => {
    const router = TestBed.inject(Router);
    const host = TestBed.createComponent(RouterHost);
    await router.navigateByUrl('/mastodon-bilder-herunterladen');
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();
    const el = host.nativeElement as HTMLElement;
    expect(el.querySelector('.pipe')?.textContent).toBe('Medien herunterladen');
    expect(el.querySelector('.code')?.textContent).toBe('3 Dateien gespeichert.');

    // The same component on the English page follows the interface, as before.
    await router.navigateByUrl('/download-mastodon-images');
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();
    expect(el.querySelector('.pipe')?.textContent).toBe('Download media');
    expect(el.querySelector('.code')?.textContent).toBe('Saved 3 files.');
  });

  it('keeps <html lang> on the page’s language until the page goes', () => {
    TestBed.inject(TranslocoLocaleSync);
    const page = TestBed.inject(PageLanguageState);
    TestBed.tick();
    const interfaceLang = document.documentElement.lang;
    page.lang.set('de');
    TestBed.tick();
    expect(document.documentElement.lang).toBe('de');
    page.lang.set(null);
    TestBed.tick();
    expect(document.documentElement.lang).toBe(interfaceLang);
  });
});

@Component({
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class RouterHost {}
