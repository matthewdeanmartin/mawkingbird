import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ENGLISH_TOOLS, TOOL_PAGES, toolVersions } from '../focused-tools';
import { TOOLS_INDEX_ALTERNATES } from '../seo';
import { LanguageVersions } from './language-versions';

/** Renders the menu as it appears on the page at this route path. */
function render(path: string): HTMLElement {
  TestBed.configureTestingModule({
    imports: [LanguageVersions],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { pathFromRoot: [{ routeConfig: null }, { routeConfig: { path } }] },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LanguageVersions);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LanguageVersions', () => {
  it('lists every version of a tool page in one menu, the current one marked', () => {
    const page = TOOL_PAGES.find((entry) => entry.lang === 'ko' && toolVersions(entry).length > 2)!;
    const root = render(page.path);
    const links = [...root.querySelectorAll<HTMLAnchorElement>('mb-popover a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      toolVersions(page).map((version) => `/${version.path}`),
    );
    expect(root.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(
      `/${page.path}`,
    );
    // One trigger, named in the current language.
    expect(root.querySelectorAll('mb-popover button')).toHaveLength(1);
    expect(root.querySelector('mb-popover button')?.textContent?.trim()).toBe('한국어');
  });

  it('gives each tool index the set of indexes', () => {
    const root = render('tools');
    expect([...root.querySelectorAll('mb-popover a')].map((a) => a.getAttribute('href'))).toEqual(
      TOOLS_INDEX_ALTERNATES.map((index) => `/${index.path}`),
    );
    expect(root.querySelector('a[aria-current="page"]')?.textContent).toBe('English');
  });

  it('renders nothing for a page in one language only', () => {
    const solo = ENGLISH_TOOLS.find((tool) => toolVersions(tool).length === 1);
    const root = render(solo?.path ?? 'features');
    expect(root.querySelector('mb-popover')).toBeNull();
  });
});
