import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { FindFriends } from './find-friends';

/**
 * The page a stranger reaches in their first five minutes.
 *
 * What is asserted here is *order and grouping*, because that is the whole
 * change: every row on this page already worked, and the page still failed a new
 * visitor by leading with the options that need prior knowledge.
 */
describe('FindFriends', () => {
  let anonymous: boolean;

  function setUp(): ComponentFixture<FindFriends> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            get isAnonymous() {
              return anonymous;
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(FindFriends);
    fixture.detectChanges();
    return fixture;
  }

  function rowTitles(fixture: ComponentFixture<FindFriends>): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.doc-title')].map(
      (el) => el.textContent?.trim() ?? '',
    );
  }

  beforeEach(() => {
    anonymous = true;
  });

  function advanced(fixture: ComponentFixture<FindFriends>): ComponentFixture<FindFriends> {
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (el) => el.textContent?.trim() === 'Advanced',
    )!;
    button.click();
    fixture.detectChanges();
    return fixture;
  }

  it('leads with ready-made sets, not with search', () => {
    const fixture = setUp();
    expect(rowTitles(fixture)).toEqual([
      'Starter packs',
      'Collections',
      'Invite your friends',
      'Offsite directories',
    ]);
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.doc-row')].map(
      (el) => el.getAttribute('href'),
    );
    expect(links).toEqual([
      '/bundled-starter-kits?kind=packs',
      '/bundled-starter-kits?kind=collections',
      '/invites',
      '/offsite-directories',
    ]);
  });

  it('puts everything needing prior knowledge under Advanced', () => {
    const fixture = setUp();
    expect((fixture.nativeElement as HTMLElement).querySelector('.ff-interests')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href^="/search"]')).toBeNull();
    advanced(fixture);
    expect(rowTitles(fixture)).toEqual([
      'Search for people by name',
      'Search posts for anything else',
      'Profile directory',
      'Look for your contacts',
      'Import a follow list',
    ]);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.discovery-tabs button.active')
        ?.textContent?.trim(),
    ).toBe('Advanced');
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.discovery-tabs button')!
      .click();
    fixture.detectChanges();
    expect(rowTitles(fixture)).toHaveLength(4);
    expect((fixture.nativeElement as HTMLElement).querySelector('.ff-interests')).toBeNull();
  });

  it('offers interest links that run a post search', () => {
    const fixture = advanced(setUp());
    const chips = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.ff-interest')];
    expect(chips.length).toBeGreaterThan(4);
    const href = chips[0]?.getAttribute('href') ?? '';
    expect(href).toContain('/search');
    expect(href).toContain('type=statuses');
  });

  it('offers contacts and follow-list import to anonymous visitors too', () => {
    expect(rowTitles(advanced(setUp()))).toEqual(
      expect.arrayContaining(['Look for your contacts', 'Import a follow list']),
    );
  });

  it('warns a signed-out visitor that follows stay in this browser', () => {
    expect((advanced(setUp()).nativeElement as HTMLElement).textContent).toContain(
      'kept in this browser',
    );
  });
});
