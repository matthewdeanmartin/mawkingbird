import { Component, input, OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { ClientListPage } from './client-list-page';
import { ClientLists } from '../../lists/client-lists';
import { ProfileLists } from '../../providers/account/profile-lists';
import { ListFeedResolver } from '../../lists/list-feed-resolver';
import { PageDiagnostics } from '../../page-diagnostics';
import { Account, Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { translocoTesting } from '../../i18n/i18n.testing';
let mounted = 0;
@Component({ selector: 'app-status-card', template: 'Post content' })
class PostStub implements OnDestroy {
  readonly status = input.required<Status>();
  constructor() {
    mounted++;
  }
  ngOnDestroy() {
    mounted--;
  }
}
describe('ClientListPage shared local panels', () => {
  async function setup(kind = 'ready') {
    mounted = 0;
    const accounts = new Subject<Account[]>();
    const account = {
      id: 'member-id',
      acct: 'alice@example.test',
      username: 'alice',
      display_name: 'Alice with a long display name',
    } as Account;
    const resolve = vi.fn(() => (kind === 'pending' ? accounts : of([account])));
    const merge = vi.fn(() => of({ statuses: [{ id: 'post' } as Status] }));
    const list =
      kind === 'missing'
        ? null
        : {
            id: 'local',
            title: 'A long local list title',
            memberHandles: kind === 'empty' ? [] : [account.acct],
          };
    await TestBed.configureTestingModule({
      imports: [ClientListPage, translocoTesting()],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'local' })) } },
        { provide: ClientLists, useValue: { get: () => list } },
        {
          provide: ProfileLists,
          useValue: { load: vi.fn(async () => undefined), get: () => null },
        },
        {
          provide: ListFeedResolver,
          useValue: { resolveHandles: resolve, mergeMemberTimelines: merge },
        },
        { provide: PageDiagnostics, useValue: { info: vi.fn(), error: vi.fn() } },
      ],
    })
      .overrideComponent(ClientListPage, {
        remove: { imports: [StatusCard] },
        add: { imports: [PostStub] },
      })
      .compileComponents();
    const fixture = TestBed.createComponent(ClientListPage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, resolve, merge, accounts, account };
  }
  it('switches local panels without refetching and preserves the existing post unmount lifecycle', async () => {
    const { fixture, el, resolve, merge } = await setup();
    expect(mounted).toBe(1);
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    tabs[1].click();
    await fixture.whenStable();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(mounted).toBe(0);
    expect(el.querySelector('a.member-link')?.getAttribute('href')).toBe('/accounts/member-id');
    expect(el.querySelector('mb-metadata')?.textContent).toContain('@alice@example.test');
    tabs[0].click();
    await fixture.whenStable();
    expect(mounted).toBe(1);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
  it('retains pending state across tab changes and shows resolved members when the read completes', async () => {
    const { fixture, el, accounts, account } = await setup('pending');
    el.querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click();
    await fixture.whenStable();
    expect(el.querySelector('[role=tabpanel]:not([hidden])')?.textContent).toContain('Loading');
    accounts.next([account]);
    accounts.complete();
    await fixture.whenStable();
    expect(el.querySelector('[role=tabpanel]:not([hidden])')?.textContent).toContain(
      account.display_name,
    );
  });
  it('preserves an empty local list without starting member resolution', async () => {
    const { el, resolve } = await setup('empty');
    expect(el.textContent).toContain('No members yet');
    expect(resolve).not.toHaveBeenCalled();
  });
  it('keeps the missing-list route as a native link and shows no tab panels', async () => {
    const { el, resolve } = await setup('missing');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/feeds');
    expect(el.querySelector('mb-tabs')).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});
