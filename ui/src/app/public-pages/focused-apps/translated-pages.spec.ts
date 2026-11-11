import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { toolPageLoader } from '../../app.routes';
import { toolLanguage } from '../focused-tools';
import { FOCUSED_TOOLS } from '../focused-tools-all';

const TRANSLATED = FOCUSED_TOOLS.filter((tool) => toolLanguage(tool) !== 'en');

/**
 * Every page in a language other than English, signed out, as a search
 * visitor first sees it: written in its language, a link to its English
 * version, and every sign-in coming back to that page rather than the English
 * one. The prerender checks cover the
 * heading and hreflang at build time; the sign-in return is only checked here.
 */
describe('Translated tool pages', () => {
  it('has German and Japanese pages to check', () => {
    expect(TRANSLATED.filter((tool) => toolLanguage(tool) === 'de').length).toBeGreaterThan(15);
    expect(TRANSLATED.filter((tool) => toolLanguage(tool) === 'ja').length).toBeGreaterThan(15);
  });

  for (const tool of TRANSLATED) {
    it(`/${tool.path} is in its language and signs in back to itself`, async () => {
      const component = (await toolPageLoader(tool)()) as Type<unknown>;
      TestBed.configureTestingModule({
        // Keep the tools themselves deferred, as in the prerender.
        deferBlockBehavior: DeferBlockBehavior.Manual,
        imports: [component],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                data: { lang: toolLanguage(tool), inShell: false },
                pathFromRoot: [{ routeConfig: null }, { routeConfig: { path: tool.path } }],
                queryParamMap: convertToParamMap({}),
                paramMap: convertToParamMap({}),
              },
              queryParamMap: of(convertToParamMap({})),
              paramMap: of(convertToParamMap({})),
            },
          },
        ],
      });
      await TestBed.compileComponents();
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;

      expect(root.querySelector('main')?.getAttribute('lang')).toBe(toolLanguage(tool));
      expect(root.querySelector('h1')?.textContent).toContain(tool.prerenderCheck.heading);
      const english = FOCUSED_TOOLS.find((entry) => entry.id === tool.translationOf)!;
      expect(root.querySelector(`a[hreflang="en"][href="/${english.path}"]`)?.textContent).toBe(
        'English',
      );
      const signIns = [...root.querySelectorAll<HTMLAnchorElement>('a[href^="/login/"]')];
      for (const link of signIns) {
        const next = new URL(link.href, 'https://mawkingbird.com').searchParams.get('next');
        expect(next, `${tool.path} sign-in`).toBe(`/${tool.path}`);
      }
    });
  }
});
