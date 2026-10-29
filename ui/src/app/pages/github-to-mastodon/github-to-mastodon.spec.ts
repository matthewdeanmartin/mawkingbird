import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedGitHubConnection } from '../../testing/seed-storage';
import { GitHubFriendDiscovery } from '../settings/import-export/github-friend-discovery';
import { GitHubFriendsWorkbench } from './github-friends-workbench';
import { GithubToMastodon } from './github-to-mastodon';

describe('GithubToMastodon', () => {
  beforeEach(() => localStorage.clear());

  it('signed out, explains the steps and signs in back to this page', async () => {
    TestBed.configureTestingModule({
      imports: [GithubToMastodon],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(GithubToMastodon);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.steps li')).toHaveLength(3);
    expect(root.querySelector('.sign-in-choices a')?.getAttribute('href')).toBe(
      '/login/mastodon?next=%2Fgithub-to-mastodon',
    );
  });
});

describe('GitHubFriendsWorkbench', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(GitHubFriendsWorkbench);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('asks for GitHub first, with the connector and without its Settings chrome', () => {
    const root = render();
    expect(root.querySelector('app-connection-github')).not.toBeNull();
    expect(root.querySelector('.conn-back')).toBeNull();
    expect(root.querySelector('app-github-friends-import')).toBeNull();
  });

  it('once connected, shows the finder and holds the next steps until a search runs', () => {
    seedGitHubConnection('ghp_test', {
      login: 'viewer',
      avatar_url: '',
      html_url: 'https://github.com/viewer',
      name: 'Viewer',
    });
    const fixture = TestBed.createComponent(GitHubFriendsWorkbench);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#github-friends')).not.toBeNull();
    expect(root.querySelector('app-focused-next-steps')).toBeNull();

    TestBed.inject(GitHubFriendDiscovery).callCount.set(1);
    fixture.detectChanges();
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();
  });
});
