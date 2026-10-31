import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { Auth } from '../../auth';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { NetworkSearch } from './network-search';
import { SearchLauncher } from './search-launcher';

describe('NetworkSearch', () => {
  beforeEach(() => localStorage.clear());

  async function page(path: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [NetworkSearch],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {},
              pathFromRoot: [{ routeConfig: null }, { routeConfig: { path } }],
            },
          },
        },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(NetworkSearch);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('/mastodon-search puts a search box first and needs no sign-in', async () => {
    const root = await page('mastodon-search');
    expect(root.querySelector('h1')?.textContent).toContain('Search Mastodon');
    // Before the real box loads, a plain form does the job (and is what prerenders).
    const fallback = root.querySelector<HTMLFormElement>('form.search-fallback');
    expect(fallback?.getAttribute('action')).toBe('search');
    expect(fallback?.querySelector<HTMLInputElement>('input[name="type"]')?.value).toBe('statuses');
    expect(root.querySelector('.sign-in-choices')).toBeNull();
    expect(root.querySelector('.questions a')?.getAttribute('href')).toBe('/bluesky-search');
  });

  it('/bluesky-search presets Bluesky', async () => {
    const root = await page('bluesky-search');
    expect(root.querySelector('h1')?.textContent).toContain('Search Bluesky');
    const fallback = root.querySelector<HTMLFormElement>('form.search-fallback')!;
    expect(fallback.querySelector<HTMLInputElement>('input[name="type"]')?.value).toBe(
      'bluesky-posts',
    );
    expect(root.querySelector('.questions a')?.getAttribute('href')).toBe('/mastodon-search');
  });
});

describe('SearchLauncher', () => {
  let navigate: MockInstance<Router['navigate']>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SearchLauncher],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  function render(network: 'mastodon' | 'bluesky') {
    const fixture = TestBed.createComponent(SearchLauncher);
    fixture.componentRef.setInput('network', network);
    fixture.componentRef.setInput('root', `/${network}-search`);
    fixture.detectChanges();
    const launcher = fixture.componentInstance as unknown as {
      query: { set(v: string): void };
      type: { set(v: string): void };
      search(): void;
    };
    return { fixture, launcher, root: fixture.nativeElement as HTMLElement };
  }

  it('hands a Mastodon search straight to the search page', () => {
    const { launcher } = render('mastodon');
    launcher.query.set('  coffee  ');
    launcher.search();
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'coffee', type: 'statuses' },
    });
  });

  it('offers a sign-in that comes back to the tool page', () => {
    const { root } = render('mastodon');
    expect(root.querySelector('.better a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fmastodon-search',
    );
  });

  it('says nothing about signing in to someone already signed in', () => {
    TestBed.inject(Auth).setToken('search-account');
    const { root } = render('mastodon');
    expect(root.querySelector('.better a')).toBeNull();
    expect(root.querySelector('.better')?.textContent).toContain('full-text search');
  });

  it('presets Bluesky, and searches people without an account', () => {
    const { launcher } = render('bluesky');
    launcher.type.set('accounts');
    launcher.query.set('coffee');
    launcher.search();
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'coffee', type: 'bluesky-posts', bskyType: 'accounts' },
    });
  });

  it('holds a Bluesky post search until the visitor signs in with Bluesky, and says why', () => {
    const { fixture, launcher, root } = render('bluesky');
    launcher.type.set('statuses');
    launcher.query.set('coffee');
    fixture.detectChanges();
    launcher.search();
    expect(navigate).not.toHaveBeenCalled();
    expect(root.querySelector('.better')?.textContent).toContain(
      'Bluesky only lets signed-in accounts search posts',
    );
    expect(root.querySelector('.better a')?.getAttribute('href')).toBe(
      '/login/bluesky?next=%2Fbluesky-search',
    );
  });

  it('lets a Bluesky account search posts', () => {
    vi.spyOn(TestBed.inject(BlueskySession), 'linked').mockReturnValue(true);
    const { launcher } = render('bluesky');
    launcher.query.set('coffee');
    launcher.search();
    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'coffee', type: 'bluesky-posts', bskyType: 'statuses' },
    });
  });
});
