import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../../models';
import { SettingsFollows } from './settings-follows';
import { Auth } from '../../../auth';
import { AnonymousFollows } from '../../../providers/anonymous/anonymous-follows';

interface SettingsFollowsInternals {
  requests: WritableSignal<Account[]>;
  authorize(acc: Account): void;
  reject(acc: Account): void;
  retry(follow: ReturnType<AnonymousFollows['follows']>[number]): void;
}

function internals(fixture: ComponentFixture<SettingsFollows>): SettingsFollowsInternals {
  return fixture.componentInstance as unknown as SettingsFollowsInternals;
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

describe('SettingsFollows', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(accounts: Account[]): ComponentFixture<SettingsFollows> {
    const fixture = TestBed.createComponent(SettingsFollows);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/follow_requests').flush(accounts);
    return fixture;
  }

  it('loads pending follow requests', () => {
    const fixture = setUp([makeAccount('1'), makeAccount('2')]);
    expect(internals(fixture).requests().length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
      'Approve follow requests',
    );
  });

  it('accepting a request removes the row', () => {
    const acc = makeAccount('5');
    const fixture = setUp([acc]);
    internals(fixture).authorize(acc);
    const req = httpMock.expectOne('/api/v1/follow_requests/5/authorize');
    expect(req.request.method).toBe('POST');
    req.flush({});
    expect(internals(fixture).requests()).toEqual([]);
  });

  it('shows local Anonymous follows and clears backoff without a server request', () => {
    const auth = TestBed.inject(Auth);
    auth.enterAnonymous('https://home.example');
    const follows = TestBed.inject(AnonymousFollows);
    const target = { ...makeAccount('5'), url: 'https://social.example/@user5' };
    follows.follow(target, 'https://home.example');
    follows.markRouteFailure(follows.follows()[0].key, 'read-api');

    const fixture = TestBed.createComponent(SettingsFollows);
    fixture.detectChanges();
    expect(internals(fixture).requests()).toEqual([follows.follows()[0].account]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Retrying around: read-api',
    );

    internals(fixture).retry(follows.follows()[0]);
    fixture.detectChanges();
    expect(follows.hasBackoff(follows.follows()[0])).toBe(false);
    httpMock.expectNone(() => true);
  });
});
