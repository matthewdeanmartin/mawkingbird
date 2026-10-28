import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { TwitterFriendDiscovery } from '../settings/import-export/twitter-friend-discovery';
import { TwitterImportNextSteps } from './twitter-import-next-steps';
import { TwitterToMastodon } from './twitter-to-mastodon';

describe('TwitterToMastodon', () => {
  async function render(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [TwitterToMastodon],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
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
    expect(root.querySelector('h1')?.textContent).toContain('Import your Twitter follows');
  });

  it('leaves header and account menu to the shell when signed in', async () => {
    expect((await render({ inShell: true })).querySelector('header')).toBeNull();
  });
});

describe('TwitterImportNextSteps', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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
