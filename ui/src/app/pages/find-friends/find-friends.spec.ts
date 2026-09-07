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

  it('leads with ready-made sets, not with search', () => {
    // Ready-made sets are the only option that works with no name in mind and
    // no leaving the site. "Search for people" led before, which asks a
    // brand-new visitor to already know who they are looking for.
    //
    // One row, not two: our starter kits and snapshots of other people's
    // collections list together on the page this links to. The distinction is
    // real but it is ours, and it was being put to a newcomer before they had
    // seen a single face.
    expect(rowTitles(setUp())[0]).toBe('Ready-made sets of people');
  });

  it('puts everything needing prior knowledge under Advanced', () => {
    const fixture = setUp();
    const headings = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.ff-heading'),
    ].map((el) => el.textContent?.trim());
    expect(headings).toContain('Advanced');

    // Off-site directories are the clearest case: following someone found there
    // means reading a handle elsewhere, coming back, and searching by hand.
    const titles = rowTitles(fixture);
    const advancedStart = titles.indexOf('Search for people by name');
    expect(advancedStart).toBeGreaterThan(0);
    expect(titles.indexOf('Offsite directories')).toBeGreaterThan(advancedStart);
    // ...and starter kits stay above all of it.
    expect(titles.indexOf('Starter kits')).toBeLessThan(advancedStart);
  });

  it('offers interest links that run a post search', () => {
    // These answer "what would I even type", which is the question that stops
    // people at an empty search box. Plain links into /search, so there is no
    // second search implementation to keep working.
    const chips = [...(setUp().nativeElement as HTMLElement).querySelectorAll('.ff-interest')];

    expect(chips.length).toBeGreaterThan(4);
    const href = chips[0]?.getAttribute('href') ?? '';
    expect(href).toContain('/search');
    expect(href).toContain('type=statuses');
  });

  it('offers contacts and follow-list import to anonymous visitors too', () => {
    // These used to be hidden while signed out, on the assumption that both
    // needed a server account. Neither does: account search works anonymously
    // and anonymous follows are kept in this browser. Hiding them put the two
    // tools that build a timeline out of reach of the one person with an empty
    // one — someone who just chose "continue without logging in".
    const titles = rowTitles(setUp());
    expect(titles).toContain('Look for your contacts');
    expect(titles).toContain('Import a follow list');
  });

  it('warns a signed-out visitor that follows stay in this browser', () => {
    // The honest caveat that makes offering it correct: nothing is written to a
    // server account, because there is no server account.
    expect((setUp().nativeElement as HTMLElement).textContent).toContain('kept in this browser');
  });
});
