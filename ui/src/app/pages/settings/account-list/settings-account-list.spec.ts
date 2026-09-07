import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { Account } from '../../../models';
import { SettingsAccountList } from './settings-account-list';

interface SettingsAccountListInternals {
  kind: WritableSignal<'mutes' | 'blocks' | 'domains'>;
  accounts: WritableSignal<Account[]>;
  domains: WritableSignal<string[]>;
  domainInput: WritableSignal<string>;
  domainError: WritableSignal<string>;
  canBlockDomain(): boolean;
  blockDomain(): void;
  unblockDomain(domain: string): void;
  canAmnesty(): boolean;
  isDomains(): boolean;
  showPager(): boolean;
  undo(acc: Account): void;
  amnestyAction(): string;
  amnestyLabelKey(): string;
  asking: WritableSignal<boolean>;
  askAmnesty(): void;
  page: WritableSignal<number>;
  lastPage(): number | null;
  canNext(): boolean;
  canPrev(): boolean;
  next(): void;
  prev(): void;
  last(): void;
  first(): void;
  isAlsoOther(id: string): boolean;
  canUnfollow(id: string): boolean;
  unfollow(acc: Account): void;
  alsoApply(acc: Account): void;
  convert(acc: Account): void;
  show(kind: 'mutes' | 'blocks' | 'domains'): void;
}

function internals(fixture: ComponentFixture<SettingsAccountList>): SettingsAccountListInternals {
  return fixture.componentInstance as unknown as SettingsAccountListInternals;
}

function makeAccount(id: string): Account {
  return {
    id,
    username: `user${id}`,
    acct: `user${id}`,
    display_name: `User ${id}`,
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
  };
}

describe('SettingsAccountList', () => {
  let httpMock: HttpTestingController;

  function configure(kind: 'mutes' | 'blocks' | 'domains'): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { data: of({ kind }) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Settle one page fetch and the `/relationships` lookup that follows it.
   *
   * Every page asks, in one call for the whole page, which of these accounts is
   * on the *other* list too — that is what the row badge reads. `nextMaxId` adds
   * the `Link` header the pager walks; omitting it means "this is the last page".
   */
  function flushPage(
    accounts: Account[],
    nextMaxId?: string,
    alsoOther: string[] = [],
    options: { expectRelationships?: boolean; following?: string[] } = {},
  ): void {
    const req = httpMock.expectOne((r) => r.url === '/api/v1/mutes' || r.url === '/api/v1/blocks');
    req.flush(
      accounts,
      nextMaxId
        ? { headers: { Link: `</api/v1/mutes?max_id=${nextMaxId}>; rel="next"` } }
        : undefined,
    );
    // Pages walked past on the way to "Last" are never displayed, so they ask
    // nothing about relationships — only the page that lands does.
    if (!accounts.length || options.expectRelationships === false) {
      return;
    }
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush(
        accounts.map((a) => ({
          id: a.id,
          muting: alsoOther.includes(a.id),
          blocking: alsoOther.includes(a.id),
          following: (options.following ?? []).includes(a.id),
        })),
      );
  }

  it('loads muted accounts for kind=mutes', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushPage([makeAccount('1')]);
    expect(internals(fixture).accounts().length).toBe(1);

    const tabs = fixture.nativeElement.querySelectorAll(
      '.restriction-tabs .tab',
    ) as NodeListOf<HTMLButtonElement>;
    expect(Array.from(tabs, (tab) => tab.textContent?.trim())).toEqual([
      'Mute',
      'Block',
      'Domains',
    ]);
    internals(fixture).show('blocks');
    flushPage([makeAccount('2')]);
    expect(internals(fixture).kind()).toBe('blocks');
  });

  it('offers the amnesty matching the list it is showing', () => {
    configure('blocks');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushPage([makeAccount('1')]);

    expect(internals(fixture).amnestyAction()).toBe('block-amnesty');
    // Asserted through the rendered button rather than the key, so this keeps
    // testing what the reader sees rather than the indirection behind it. The
    // amnesty row only renders once the page has accounts, hence the extra pass.
    fixture.detectChanges();
    const amnesty = (fixture.nativeElement as HTMLElement).querySelector('.amnesty-row .btn');
    expect(amnesty?.textContent?.trim()).toBe('Unblock everyone');
  });

  it('asks before running an amnesty, and issues no request until confirmed', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushPage([makeAccount('1')]);

    internals(fixture).askAmnesty();
    fixture.detectChanges();

    expect(internals(fixture).asking()).toBe(true);
    // The point of the dialog: opening it changes nothing. Any reads the
    // preview makes are fine; a write would not be.
    expect(httpMock.match((r) => r.method === 'POST')).toEqual([]);
    for (const read of httpMock.match(() => true)) {
      read.flush([]);
    }
  });

  it('unblocks and removes the row for kind=blocks', () => {
    configure('blocks');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    const acc = makeAccount('9');
    flushPage([acc]);

    internals(fixture).undo(acc);
    const req = httpMock.expectOne('/api/v1/accounts/9/unblock');
    expect(req.request.method).toBe('POST');
    req.flush({});
    expect(internals(fixture).accounts()).toEqual([]);
  });

  // ------------------------------------------------------------------ paging
  // The bug this replaced: the page rendered whatever the first unpaginated read
  // returned (40) while amnesty walked every page and reported 280. Accounts 41
  // onward were unreachable.

  it('pages forward with the Link cursor and stops when it runs out', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushPage([makeAccount('1')], 'rel-40');

    // A `rel="next"` means there is more, so Next is live and the end is unknown.
    expect(internals(fixture).canNext()).toBe(true);
    expect(internals(fixture).lastPage()).toBeNull();

    internals(fixture).next();
    flushPage([makeAccount('2')]);

    expect(internals(fixture).page()).toBe(1);
    expect(
      internals(fixture)
        .accounts()
        .map((a) => a.id),
    ).toEqual(['2']);
    // No Link on that page: this is the end, and Next must go dead.
    expect(internals(fixture).lastPage()).toBe(1);
    expect(internals(fixture).canNext()).toBe(false);
  });

  it('serves an already-seen page from cache instead of re-fetching', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushPage([makeAccount('1')], 'rel-40');
    internals(fixture).next();
    flushPage([makeAccount('2')]);

    internals(fixture).prev();

    // Page 1 came back with no request at all — the microcache doing its job,
    // which is what keeps clicking through a 280-entry list from pounding the
    // server on every Prev.
    expect(internals(fixture).page()).toBe(0);
    expect(
      internals(fixture)
        .accounts()
        .map((a) => a.id),
    ).toEqual(['1']);
    httpMock.verify();
  });

  it('walks to the end for Last, because Link pagination has no random access', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushPage([makeAccount('1')], 'rel-40');

    internals(fixture).last();
    // Page 2 is fetched on the way past — walked over, never shown, so it asks
    // nothing about relationships. Page 3 ends the walk and is the one displayed.
    flushPage([makeAccount('2')], 'rel-80', [], { expectRelationships: false });
    flushPage([makeAccount('3')]);

    expect(internals(fixture).page()).toBe(2);
    expect(
      internals(fixture)
        .accounts()
        .map((a) => a.id),
    ).toEqual(['3']);
  });

  // ------------------------------------------------- convert / also-apply
  // Converting a mute to a block is a decision you cannot make without knowing
  // whether the block already exists, so the row carries both the badge and the
  // two escalations.

  it('flags rows that are on the other list too', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushPage([makeAccount('1'), makeAccount('2')], undefined, ['2']);

    expect(internals(fixture).isAlsoOther('1')).toBe(false);
    expect(internals(fixture).isAlsoOther('2')).toBe(true);
  });

  it('also-block keeps the mute, so the row stays put and gains the badge', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    const acc = makeAccount('7');
    flushPage([acc]);

    internals(fixture).alsoApply(acc);
    httpMock.expectOne('/api/v1/accounts/7/block').flush({});

    // No unmute: "block them as well" means both restrictions, not a swap.
    expect(
      internals(fixture)
        .accounts()
        .map((a) => a.id),
    ).toEqual(['7']);
    expect(internals(fixture).isAlsoOther('7')).toBe(true);
  });

  it('convert blocks first and only then unmutes, so a failure leaves them restricted', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    const acc = makeAccount('7');
    flushPage([acc]);

    internals(fixture).convert(acc);

    // Block goes out first and the mute is still in place until it succeeds.
    httpMock.expectOne('/api/v1/accounts/7/block').flush({});
    expect(
      internals(fixture)
        .accounts()
        .map((a) => a.id),
    ).toEqual(['7']);

    httpMock.expectOne('/api/v1/accounts/7/unmute').flush({});
    expect(internals(fixture).accounts()).toEqual([]);
  });

  // -------------------------------------------------------------- unfollow
  // Muting does not unfollow, so "muted but still followed" is ordinary — and
  // this page is where you notice it.

  it('offers Unfollow only for muted accounts you actually follow', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushPage([makeAccount('1'), makeAccount('2')], undefined, [], { following: ['2'] });

    expect(internals(fixture).canUnfollow('1')).toBe(false);
    expect(internals(fixture).canUnfollow('2')).toBe(true);
  });

  it('never offers Unfollow on the block list, where the server already did it', () => {
    configure('blocks');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    // Even if the relationship still claims a follow, blocking forces an
    // unfollow server-side, so the button would be a no-op.
    flushPage([makeAccount('1')], undefined, [], { following: ['1'] });

    expect(internals(fixture).canUnfollow('1')).toBe(false);
  });

  it('unfollow leaves the mute alone and keeps the row', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    const acc = makeAccount('5');
    flushPage([acc], undefined, [], { following: ['5'] });

    internals(fixture).unfollow(acc);
    const req = httpMock.expectOne('/api/v1/accounts/5/unfollow');
    expect(req.request.method).toBe('POST');
    req.flush({});

    // Still muted, still listed — only the follow went away.
    expect(
      internals(fixture)
        .accounts()
        .map((a) => a.id),
    ).toEqual(['5']);
    expect(internals(fixture).canUnfollow('5')).toBe(false);
  });

  it('drops the Unfollow button once a block makes it moot', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    const acc = makeAccount('5');
    flushPage([acc], undefined, [], { following: ['5'] });
    expect(internals(fixture).canUnfollow('5')).toBe(true);

    internals(fixture).alsoApply(acc);
    httpMock.expectOne('/api/v1/accounts/5/block').flush({});

    // The block already unfollowed them server-side.
    expect(internals(fixture).canUnfollow('5')).toBe(false);
  });

  it('convert skips the block when they are already blocked', () => {
    configure('mutes');
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    const acc = makeAccount('7');
    flushPage([acc], undefined, ['7']);

    internals(fixture).convert(acc);

    // Nothing to add — only the mute needs lifting.
    httpMock.expectOne('/api/v1/accounts/7/unmute').flush({});
    expect(internals(fixture).accounts()).toEqual([]);
  });
});

describe('SettingsAccountList domains tab', () => {
  let httpMock: HttpTestingController;

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { data: of({ kind: 'domains' }) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  /** Settle the domain list read. Domains need no relationships lookup. */
  function flushDomains(domains: string[], nextMaxId?: string): void {
    const req = httpMock.expectOne((r) => r.url === '/api/v1/domain_blocks');
    req.flush(
      domains,
      nextMaxId
        ? { headers: { Link: `</api/v1/domain_blocks?max_id=${nextMaxId}>; rel="next"` } }
        : undefined,
    );
  }

  function start(domains: string[] = ['nsfw.social']): ComponentFixture<SettingsAccountList> {
    configure();
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushDomains(domains);
    return fixture;
  }

  it('loads blocked domains from the route kind', () => {
    const fixture = start(['nsfw.social', 'artalley.social']);
    expect(internals(fixture).isDomains()).toBe(true);
    expect(internals(fixture).domains()).toEqual(['nsfw.social', 'artalley.social']);
  });

  it('never asks the account endpoints while on domains', () => {
    start();
    // Asserted here rather than left to `httpMock.verify()` in afterEach. That
    // verify does catch the regression, but only as "unexpected request" from a
    // hook — which names neither this test nor the endpoints it is about. This
    // states the claim where it can be read.
    expect(httpMock.match((r) => r.url === '/api/v1/mutes' || r.url === '/api/v1/blocks')).toEqual(
      [],
    );
  });

  it('blocks a domain as form data and reloads the list', () => {
    const fixture = start([]);
    internals(fixture).domainInput.set('nsfw.social');
    internals(fixture).blockDomain();

    const post = httpMock.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/v1/domain_blocks',
    );
    // FormData is the one encoding both the mock's Form() and real Mastodon take.
    expect(post.request.body).toBeInstanceOf(FormData);
    expect((post.request.body as FormData).get('domain')).toBe('nsfw.social');
    post.flush({});

    // A block can drop followers, so the list is re-read rather than patched.
    flushDomains(['nsfw.social']);
    expect(internals(fixture).domains()).toEqual(['nsfw.social']);
    expect(internals(fixture).domainInput()).toBe('');
  });

  it('unblocks via the query string and drops the row', () => {
    const fixture = start(['nsfw.social', 'artalley.social']);
    internals(fixture).unblockDomain('nsfw.social');

    const del = httpMock.expectOne(
      (r) => r.method === 'DELETE' && r.url === '/api/v1/domain_blocks',
    );
    expect(del.request.params.get('domain')).toBe('nsfw.social');
    del.flush({});

    expect(internals(fixture).domains()).toEqual(['artalley.social']);
  });

  it('reduces a pasted handle to its domain', () => {
    const fixture = start([]);
    internals(fixture).domainInput.set('@someone@nsfw.social');
    internals(fixture).blockDomain();

    const post = httpMock.expectOne((r) => r.method === 'POST');
    expect((post.request.body as FormData).get('domain')).toBe('nsfw.social');
    post.flush({});
    flushDomains(['nsfw.social']);
  });

  it('reduces a pasted profile URL to its domain', () => {
    const fixture = start([]);
    internals(fixture).domainInput.set('https://Nsfw.Social/@alice');
    internals(fixture).blockDomain();

    const post = httpMock.expectOne((r) => r.method === 'POST');
    expect((post.request.body as FormData).get('domain')).toBe('nsfw.social');
    post.flush({});
    flushDomains(['nsfw.social']);
  });

  it('refuses to send something that is not a domain', () => {
    const fixture = start([]);
    for (const bad of ['', '   ', 'localhost', 'two words']) {
      internals(fixture).domainInput.set(bad);
      expect(internals(fixture).canBlockDomain()).toBe(false);
    }
    internals(fixture).domainInput.set('nsfw.social');
    expect(internals(fixture).canBlockDomain()).toBe(true);
  });

  it('surfaces a rejected block rather than failing silently', () => {
    const fixture = start([]);
    internals(fixture).domainInput.set('nsfw.social');
    internals(fixture).blockDomain();
    httpMock
      .expectOne((r) => r.method === 'POST')
      .flush({ error: 'Validation failed' }, { status: 422, statusText: 'Unprocessable' });

    expect(internals(fixture).domainError()).toContain('nsfw.social');
    // The typed value survives so it can be corrected rather than retyped.
    expect(internals(fixture).domainInput()).toBe('nsfw.social');
  });

  it('offers no amnesty on domains', () => {
    const fixture = start();
    expect(internals(fixture).canAmnesty()).toBe(false);
  });

  it('hides the pager for a single page of domains', () => {
    const fixture = start(['nsfw.social']);
    expect(internals(fixture).showPager()).toBe(false);
  });

  it('pages domains when the Link header offers more', () => {
    configure();
    const fixture = TestBed.createComponent(SettingsAccountList);
    fixture.detectChanges();
    flushDomains(['a.social'], '16194');

    expect(internals(fixture).showPager()).toBe(true);
    internals(fixture).next();
    flushDomains(['b.social']);
    expect(internals(fixture).domains()).toEqual(['b.social']);
    expect(internals(fixture).page()).toBe(1);
  });

  it('switching away from domains loads the account list instead', () => {
    const fixture = start();
    internals(fixture).show('blocks');

    httpMock.expectOne((r) => r.url === '/api/v1/blocks').flush([]);
    expect(internals(fixture).domains()).toEqual([]);
  });
});
