import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterLink, Routes } from '@angular/router';
import { describe, expect, it } from 'vitest';
import {
  AppOnlyLinkRel,
  PublicPageUrlSerializer,
  providePublicPageUrls,
  publicRoutePaths,
} from './public-page-urls';

@Component({ template: '' })
class Blank {}

const routes: Routes = [
  { path: '', pathMatch: 'full', component: Blank, data: { seoIndexable: true } },
  { path: 'features', component: Blank, data: { seoIndexable: true } },
  { path: 'for/creators', component: Blank, data: { seoIndexable: true } },
  { path: 'follow/:slug', component: Blank, resolve: { seoIndexable: () => true } },
  { path: 'login', component: Blank },
  { path: 'tags/:tag', component: Blank },
  {
    path: '',
    children: [
      { path: 'about', component: Blank, data: { seoIndexable: true } },
      { path: 'home', component: Blank, data: { seoIndexable: true, seoCanonicalPath: '/' } },
    ],
  },
];

describe('public page URLs', () => {
  it('collects indexable routes, including nested and parameterised ones', () => {
    expect(publicRoutePaths(routes)).toEqual(['features', 'for/creators', 'follow/:slug', 'about']);
  });

  it('adds the trailing slash to public pages only', () => {
    const serializer = new PublicPageUrlSerializer(routes);
    const url = (value: string) => serializer.serialize(serializer.parse(value));
    expect(url('/features')).toBe('/features/');
    expect(url('/for/creators#top')).toBe('/for/creators/#top');
    expect(url('/follow/science-fiction?x=1')).toBe('/follow/science-fiction/?x=1');
    expect(url('/about')).toBe('/about/');
    expect(url('/')).toBe('/');
    // App routes keep their form; /login is a registered OAuth redirect address.
    expect(url('/login')).toBe('/login');
    expect(url('/login?next=%2Ffeatures')).toBe('/login?next=%2Ffeatures');
    expect(url('/tags/Math')).toBe('/tags/Math');
    expect(url('/home')).toBe('/home');
    expect(url('/features/extra')).toBe('/features/extra');
  });

  it('routes a slashed address to the same page', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), providePublicPageUrls(routes)],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/for/creators/');
    expect(router.url).toBe('/for/creators/');
    await router.navigateByUrl('/login');
    expect(router.url).toBe('/login');
  });

  it('links public pages with a slash and asks crawlers not to follow app links', async () => {
    @Component({
      imports: [RouterLink, AppOnlyLinkRel],
      template: `
        <a id="public" routerLink="/features">Features</a>
        <a id="home" routerLink="/">Open</a>
        <a id="app" routerLink="/login" [queryParams]="{ next: '/features' }">Sign in</a>
        <a id="tag" [routerLink]="['/tags', 'Math']">#Math</a>
        <a id="blank" routerLink="/tags/Math" target="_blank" rel="noopener">#Math</a>
        <a id="blankPublic" routerLink="/features" target="_blank" rel="noopener">Features</a>
      `,
    })
    class Links {}
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), providePublicPageUrls(routes)],
    });
    const fixture = TestBed.createComponent(Links);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const link = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLAnchorElement;
    expect(link('public').getAttribute('href')).toBe('/features/');
    expect(link('public').getAttribute('rel')).toBeNull();
    expect(link('home').getAttribute('rel')).toBeNull();
    expect(link('app').getAttribute('href')).toBe('/login?next=%2Ffeatures');
    expect(link('app').getAttribute('rel')).toBe('nofollow');
    expect(link('tag').getAttribute('href')).toBe('/tags/Math');
    expect(link('tag').getAttribute('rel')).toBe('nofollow');
    expect(link('blank').getAttribute('rel')).toBe('noopener nofollow');
    expect(link('blankPublic').getAttribute('rel')).toBe('noopener');
  });
});
