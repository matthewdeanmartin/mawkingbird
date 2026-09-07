import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { PageTitleStrategy } from './page-title-strategy';
import { environment } from '../../environments/environment';

@Component({ template: 'page' })
class Page {}

/**
 * In a single-page app the document title is often the only thing that tells a
 * screen reader a navigation happened at all — nothing else about the document
 * changes identity. The property under test: every route produces a title, and
 * routes that declare one say what page you are on before saying the brand.
 *
 * Driven through the real router rather than a hand-built snapshot, because the
 * resolved title lives on `data` under a router-private key; faking that shape
 * would test the fake.
 */
describe('PageTitleStrategy', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'bookmarks', title: 'Bookmarks', component: Page },
          { path: 'untitled', component: Page },
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
  });

  async function go(path: string): Promise<string> {
    await TestBed.inject(Router).navigateByUrl(path);
    return TestBed.inject(Title).getTitle();
  }

  it('puts the page name before the brand', async () => {
    expect(await go('/bookmarks')).toBe(`Bookmarks · ${environment.brand}`);
  });

  it('falls back to the bare brand when a route declares no title', async () => {
    // Angular's default strategy leaves the previous route's title in place
    // here, so a screen reader would hear the wrong page name.
    expect(await go('/untitled')).toBe(environment.brand);
  });

  it('replaces a previous page title rather than leaving it stale', async () => {
    await go('/bookmarks');
    expect(await go('/untitled')).toBe(environment.brand);
  });
});
