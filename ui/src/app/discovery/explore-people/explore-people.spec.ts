import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { ExplorePeople, resetPeopleTab } from './explore-people';

/** Explore → People: Search | Suggested | Directory | More (spec/sprint/explore-2026-11.md). */
describe('ExplorePeople', () => {
  let fixture: ComponentFixture<ExplorePeople>;

  beforeEach(() => {
    localStorage.clear();
    resetPeopleTab();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    // As on the real route: the embedded search is held to people.
    TestBed.inject(ActivatedRoute).snapshot.data = { peopleOnly: true };
  });

  function render(): HTMLElement {
    fixture = TestBed.createComponent(ExplorePeople);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function tabs(host: HTMLElement): string[] {
    return [...host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim() ?? '');
  }

  function open(host: HTMLElement, label: string): void {
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (button) => button.textContent?.trim() === label,
    )!;
    tab.click();
    fixture.detectChanges();
  }

  it('opens on a people-only search, with a tab for each other way', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const host = render();
    expect(tabs(host)).toEqual(['Search', 'Directory', 'More']);
    expect(host.querySelector('app-search')).not.toBeNull();
    expect(host.querySelector('.type-toolbar')).toBeNull();
    // Only the open tab is rendered, so the directory costs nothing until opened.
    expect(host.querySelector('app-directory')).toBeNull();
  });

  it('lists the remaining ways under More', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const host = render();
    open(host, 'More');
    expect(host.querySelector('app-search')).toBeNull();
    expect([...host.querySelectorAll('.doc-title')].map((el) => el.textContent?.trim())).toEqual([
      'Offsite directories',
      'Look for your contacts',
      'Import a follow list',
    ]);
  });

  it('adds Suggested for a signed-in Mastodon account', () => {
    TestBed.inject(Auth).setToken('token');
    const host = render();
    expect(tabs(host)).toEqual(['Search', 'Suggested', 'Directory', 'More']);
    open(host, 'Suggested');
    expect(host.querySelector('app-server-suggestions')).not.toBeNull();
  });

  it('comes back on the tab last open, as after Back from a profile', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    open(render(), 'More');
    fixture.destroy();
    const host = render();
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe(
      'More',
    );
  });
});
