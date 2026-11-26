import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { TwitterFriendDiscovery } from '../../settings/import-export/twitter-friend-discovery';
import { TwitterImportNextSteps } from './twitter-import-next-steps';
import { TwitterToMastodon } from './twitter-to-mastodon';

describe('TwitterToMastodon', () => {
  async function render(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [TwitterToMastodon],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        // As the real route: the tool's path is what its Invite link is built from.
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data, pathFromRoot: [{ routeConfig: { path: 'twitter-to-mastodon' } }] },
          },
        },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(TwitterToMastodon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stands alone when signed out, with its own way into the app', async () => {
    const root = await render({});
    expect(root.querySelector('header')?.textContent).toContain('Open the app');
    expect(root.querySelector('header a[mbButton]')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Ftwitter-to-mastodon',
    );
    expect(root.querySelector('h1')?.textContent).toContain('Import your Twitter follows');
  });

  it('leaves header and account menu to the shell when signed in', async () => {
    const root = await render({ inShell: true });
    expect(root.querySelector('header')).toBeNull();
    expect(root.querySelector('main > app-open-app a')?.getAttribute('href')).toBe('/unbird');
  });
});

describe('TwitterImportNextSteps', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        // As on the tool page: its path is what the Invite link is built from.
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {},
              pathFromRoot: [{ routeConfig: { path: 'twitter-to-mastodon' } }],
            },
          },
        },
      ],
    });
  });

  it('waits for a search before pointing anywhere else', () => {
    const fixture = TestBed.createComponent(TwitterImportNextSteps);
    fixture.componentRef.setInput('signedIn', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.next-steps')).toBeNull();

    TestBed.inject(TwitterFriendDiscovery).callCount.set(1);
    fixture.detectChanges();

    const links = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/home', '/follow', '/twitter-to-mastodon/invite', '/features']);
  });
});
