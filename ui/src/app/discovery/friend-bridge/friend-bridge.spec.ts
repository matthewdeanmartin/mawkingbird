import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { FriendBridge } from './friend-bridge';

describe('FriendBridge', () => {
  beforeEach(() => localStorage.clear());

  /** The route as either twin sees it: the path sits on the route or on its parent. */
  async function page(path: string, data: Record<string, unknown> = {}): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [FriendBridge],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data,
              pathFromRoot: [
                { routeConfig: null },
                { routeConfig: { path } },
                { routeConfig: { path: '' } },
              ],
            },
          },
        },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FriendBridge);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('at /bluesky-to-mastodon, reads Bluesky and signs in back to the same page', async () => {
    const root = await page('bluesky-to-mastodon');
    expect(root.querySelector('h1')?.textContent).toContain(
      'Find your Bluesky follows on Mastodon',
    );
    const links = [...root.querySelectorAll('.sign-in-choices a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual([
      '/login/mastodon?next=%2Fbluesky-to-mastodon',
      '/login/bluesky?next=%2Fbluesky-to-mastodon',
    ]);
    expect(root.querySelector('.questions a')?.getAttribute('href')).toBe('/mastodon-to-bluesky');
    expect(root.querySelector('app-friend-bridge-workbench')).toBeNull();
  });

  it('at /mastodon-to-bluesky, reads Mastodon and points back the other way', async () => {
    const root = await page('mastodon-to-bluesky');
    expect(root.querySelector('h1')?.textContent).toContain(
      'Find your Mastodon follows on Bluesky',
    );
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fmastodon-to-bluesky',
    );
    expect(root.querySelector('.questions a')?.getAttribute('href')).toBe('/bluesky-to-mastodon');
  });

  it('signed in, shows the finder instead of the pitch', async () => {
    const root = await page('bluesky-to-mastodon', { inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});
