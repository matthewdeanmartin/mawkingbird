import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import {
  MENU_BUDGET,
  MenuMeasure,
  menuOptions,
  overBudgetMessage,
  printMenuReport,
} from '../../menu-budget';
import { Account, Relationship } from '../../models';
import { Profile } from './profile';

/**
 * The profile ••• menu stays scannable. Each case is the busiest realistic
 * menu for that kind of profile; a red result lists every option it counted.
 */

const me = { id: 'me', username: 'me', acct: 'me', url: 'https://home.example/@me' } as Account;
const zoe = {
  id: 'z1',
  username: 'zoe',
  acct: 'zoe@far.example',
  display_name: 'Zoe',
  url: 'https://far.example/@zoe',
  fields: [],
  followers_count: 3,
  following_count: 4,
  statuses_count: 5,
} as unknown as Account;

const measured: MenuMeasure[] = [];

describe('profile ••• menu budget', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterAll(() => printMenuReport(measured));

  function measure(scenario: string, account: Account, relationship: Partial<Relationship>) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: account.id })),
            queryParamMap: of(convertToParamMap({})),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    });
    const auth = TestBed.inject(Auth);
    auth.kind.set('mastodon');
    auth.token.set('menu-budget-token');
    auth.setAccount(me);
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
    http.expectOne(`/api/v1/accounts/${account.id}`).flush(account);
    // Answer whatever the profile loads alongside, with a full relationship.
    for (const request of http.match(() => true)) {
      const url = request.request.url;
      if (url.endsWith('/relationships')) {
        request.flush([{ id: account.id, ...relationship }]);
      } else if (url.endsWith('/collections')) {
        request.flush({ collections: [] });
      } else {
        request.flush([]);
      }
    }
    fixture.detectChanges();
    for (const request of http.match(() => true)) request.flush([]);
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector(
      '.account-danger-panel, details.account-danger-menu > div',
    );
    expect(panel).not.toBeNull();
    const row = { menu: 'Profile', scenario, options: menuOptions(panel!) };
    measured.push(row);
    return row;
  }

  it(`stays within ${MENU_BUDGET} options: someone you follow who follows you`, () => {
    const row = measure('someone you follow who follows you', zoe, {
      following: true,
      followed_by: true,
      showing_reblogs: true,
    });
    expect(row.options.length, overBudgetMessage(row)).toBeLessThanOrEqual(MENU_BUDGET);
  });

  it(`stays within ${MENU_BUDGET} options: someone you don't follow`, () => {
    const row = measure("someone you don't follow", zoe, { following: false, followed_by: false });
    expect(row.options.length, overBudgetMessage(row)).toBeLessThanOrEqual(MENU_BUDGET);
  });

  it(`stays within ${MENU_BUDGET} options: your own profile`, () => {
    const row = measure('your own profile', { ...zoe, ...me, fields: [] } as Account, {});
    expect(row.options.length, overBudgetMessage(row)).toBeLessThanOrEqual(MENU_BUDGET);
  });
});
