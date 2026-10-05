import { DOCUMENT } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { PageTitleStrategy } from './a11y/page-title-strategy';
import { FEATURES_DESCRIPTION, SITE_DESCRIPTION } from './seo';

@Component({ template: 'page' })
class Page {}

describe('route SEO metadata', () => {
  beforeEach(() => {
    document.head
      .querySelectorAll(
        'meta[name="robots"], meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]',
      )
      .forEach((node) => node.remove());
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'features',
            component: Page,
            title: 'Features',
            data: { seoIndexable: true, seoDescription: FEATURES_DESCRIPTION },
          },
          { path: 'login', component: Page, title: 'Sign in' },
          {
            path: 'home',
            component: Page,
            title: 'Home',
            data: { seoIndexable: true, seoCanonicalPath: '/' },
          },
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
  });

  it('sets a clean canonical and unique share metadata for public pages', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/features?code=private#reading');
    await router.navigateByUrl('/features');
    const doc = TestBed.inject(DOCUMENT);
    const meta = TestBed.inject(Meta);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://mawkingbird.com/features/',
    );
    expect(meta.getTag('property="og:url"')?.content).toBe('https://mawkingbird.com/features/');
    expect(meta.getTag('name="description"')?.content).toBe(FEATURES_DESCRIPTION);
    expect(meta.getTag('name="robots"')?.content).toBe('index, follow');
    expect(doc.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
  });

  it('clears public canonicals and descriptions when navigating to a utility route', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/features');
    await router.navigateByUrl('/login?code=private');
    const doc = TestBed.inject(DOCUMENT);
    const meta = TestBed.inject(Meta);
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull();
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, follow');
    expect(meta.getTag('name="description"')?.content).toBe(SITE_DESCRIPTION);
    expect(meta.getTag('property="og:title"')?.content).toContain('Sign in');
    expect(meta.getTag('property="og:url"')?.content).not.toContain('private');
  });

  it('keeps the home destination indexable with the front door canonical', async () => {
    await TestBed.inject(Router).navigateByUrl('/home?code=private#feed');
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('index, follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://mawkingbird.com/',
    );
    expect(TestBed.inject(Meta).getTag('property="og:url"')?.content).toBe(
      'https://mawkingbird.com/',
    );
    await TestBed.inject(Router).navigateByUrl('/login');
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex, follow');
  });

  it('keeps preview public pages out of the index without a production canonical', async () => {
    const base = document.createElement('base');
    base.setAttribute('href', '/canary/');
    document.head.prepend(base);
    try {
      await TestBed.inject(Router).navigateByUrl('/features');
      expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex, follow');
      expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    } finally {
      base.remove();
    }
  });
});
