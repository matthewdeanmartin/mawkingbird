import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account, Status } from '../../models';
import { EndorsedList } from './endorsed-list';

function makeAccount(id: string): Account {
  return { id, username: `u${id}`, acct: `u${id}`, display_name: `User ${id}` } as Account;
}

function makeStatus(id: string, accountId: string, createdAt: string): Status {
  return { id, created_at: createdAt, account: makeAccount(accountId) } as Status;
}

interface Internals {
  loading(): boolean;
  feedLoading(): boolean;
  members(): Account[];
  feed(): Status[];
  error(): string;
  tab(): 'feed' | 'members';
}

function internals(f: ComponentFixture<EndorsedList>): Internals {
  return f.componentInstance as unknown as Internals;
}

describe('EndorsedList', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ accountId: 'O' })) },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function setUp(): ComponentFixture<EndorsedList> {
    const fixture = TestBed.createComponent(EndorsedList);
    fixture.detectChanges();
    return fixture;
  }

  it('loads endorsements as members and merges their timelines into the feed', () => {
    const fixture = setUp();

    // Owner account (non-fatal header lookup) + endorsements.
    http.expectOne('/api/v1/accounts/O').flush(makeAccount('O'));
    http.expectOne('/api/v1/accounts/O/endorsements').flush([makeAccount('A'), makeAccount('B')]);

    expect(internals(fixture).loading()).toBe(false);
    expect(
      internals(fixture)
        .members()
        .map((m) => m.id),
    ).toEqual(['A', 'B']);

    // One statuses request per member → merged newest-first.
    http
      .expectOne((r) => r.url === '/api/v1/accounts/A/statuses')
      .flush([makeStatus('1', 'A', '2026-01-01T00:00:00Z')]);
    http
      .expectOne((r) => r.url === '/api/v1/accounts/B/statuses')
      .flush([makeStatus('2', 'B', '2026-02-01T00:00:00Z')]);

    expect(
      internals(fixture)
        .feed()
        .map((s) => s.id),
    ).toEqual(['2', '1']);
  });

  it('shows no feed request when there are no endorsements', () => {
    const fixture = setUp();
    http.expectOne('/api/v1/accounts/O').flush(makeAccount('O'));
    http.expectOne('/api/v1/accounts/O/endorsements').flush([]);

    expect(internals(fixture).members()).toEqual([]);
    expect(internals(fixture).feed()).toEqual([]);
    // No /statuses requests are made — http.verify() in afterEach asserts this.
  });

  it('surfaces an error when endorsements fail to load', () => {
    const fixture = setUp();
    http.expectOne('/api/v1/accounts/O').flush(makeAccount('O'));
    http
      .expectOne('/api/v1/accounts/O/endorsements')
      .flush('', { status: 500, statusText: 'Server Error' });

    expect(internals(fixture).error()).toContain('Could not load');
    expect(internals(fixture).loading()).toBe(false);
  });
});
