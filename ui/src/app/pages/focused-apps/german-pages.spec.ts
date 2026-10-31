import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { FOCUSED_TOOL_PAGES } from '../../app.routes';
import { FOCUSED_TOOLS, toolLanguage } from '../../focused-tools';

const GERMAN = FOCUSED_TOOLS.filter((tool) => toolLanguage(tool) === 'de');

/**
 * Every German page, signed out, as a search visitor first sees it: German
 * words, a link to its English version, and every sign-in coming back to the
 * German page rather than the English one. The prerender checks cover the
 * heading and hreflang at build time; the sign-in return is only checked here.
 */
describe('German tool pages', () => {
  it('has German pages to check', () => {
    expect(GERMAN.length).toBeGreaterThan(15);
  });

  for (const tool of GERMAN) {
    it(`/${tool.path} is German and signs in back to itself`, async () => {
      const component = (await FOCUSED_TOOL_PAGES[tool.path]()) as Type<unknown>;
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
                data: { lang: 'de', inShell: false },
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

      expect(root.querySelector('main')?.getAttribute('lang')).toBe('de');
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
