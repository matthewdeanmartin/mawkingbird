import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { ExplorePeople } from './explore-people';

/** Explore → People (spec/sprint/explore-2026-11.md, Sprint 4). */
describe('ExplorePeople', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    // As on the real route: the embedded search is held to people.
    TestBed.inject(ActivatedRoute).snapshot.data = { peopleOnly: true };
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(ExplorePeople);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('searches people only, then lists the other ways to find someone', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const host = render();
    expect(host.querySelector('app-search')).not.toBeNull();
    expect(host.querySelector('.type-toolbar')).toBeNull();
    expect(
      [...host.querySelectorAll('.ep-more .doc-title')].map((el) => el.textContent?.trim()),
    ).toEqual([
      'Profile directory',
      'Offsite directories',
      'Look for your contacts',
      'Import a follow list',
    ]);
    // Suggestions need a signed-in Mastodon account to suggest for.
    expect(host.querySelector('app-server-suggestions')).toBeNull();
  });

  it('adds the server’s own suggestions for a signed-in Mastodon account', () => {
    TestBed.inject(Auth).setToken('token');
    expect(render().querySelector('app-server-suggestions')).not.toBeNull();
  });
});
