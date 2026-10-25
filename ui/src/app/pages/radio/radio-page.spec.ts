import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { RadioPage } from './radio-page';

@Component({ selector: 'app-status-card', template: '{{ status().id }}' })
class CardStub {
  readonly status = input.required<Status>();
}

describe('RadioPage', () => {
  const audio = { id: 'audio', media_attachments: [{ type: 'audio' }] } as Status;
  let api: {
    lookupAccount: ReturnType<typeof vi.fn>;
    getAccountStatuses: ReturnType<typeof vi.fn>;
    homeTimelinePage: ReturnType<typeof vi.fn>;
    listTimeline: ReturnType<typeof vi.fn>;
    lists: ReturnType<typeof vi.fn>;
  };
  let auth: { isAnonymous: boolean; isBlueskyPrimary: boolean };

  beforeEach(() => {
    auth = { isAnonymous: false, isBlueskyPrimary: false };
    api = {
      lookupAccount: vi.fn(() => of({ id: 'account' })),
      getAccountStatuses: vi.fn((_: string, opts: { maxId?: string }) =>
        of(opts.maxId ? [] : [audio]),
      ),
      homeTimelinePage: vi.fn(() => of({ statuses: [audio], nextMaxId: null })),
      listTimeline: vi.fn((_: string, cursor?: string) => of(cursor ? [] : [audio])),
      lists: vi.fn(() => of([{ id: 'list', title: 'Music' }])),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: api },
        { provide: Auth, useValue: auth },
      ],
    });
    TestBed.overrideComponent(RadioPage, {
      remove: { imports: [StatusCard] },
      add: { imports: [CardStub] },
    });
  });

  it('waits for an explicit action, resolves an account, and discovers only its media', async () => {
    const fixture = TestBed.createComponent(RadioPage);
    fixture.detectChanges();
    expect(api.lookupAccount).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('select[mbControl]')).toBeTruthy();
    const page = fixture.componentInstance;
    page.handle.set('@music@server.example');
    page.discover();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.lookupAccount).toHaveBeenCalledWith('music@server.example');
    expect(api.getAccountStatuses).toHaveBeenNthCalledWith(1, 'account', {
      maxId: undefined,
      limit: 40,
      onlyMedia: true,
      excludeReblogs: true,
    });
    expect(page.scan.posts()).toEqual([audio]);
    expect(fixture.nativeElement.textContent).toContain('Reached the end');
  });

  it('uses the home pagination cursor and loads lists only on selection', async () => {
    const fixture = TestBed.createComponent(RadioPage);
    const page = fixture.componentInstance;
    expect(api.lists).not.toHaveBeenCalled();
    page.chooseSource('home');
    page.discover();
    await fixture.whenStable();
    expect(api.homeTimelinePage).toHaveBeenCalledWith(undefined);
    page.chooseSource('list');
    expect(page.lists()).toEqual([{ id: 'list', title: 'Music' }]);
    page.listId.set('list');
    page.discover();
    await fixture.whenStable();
    expect(api.listTimeline).toHaveBeenCalledWith('list', undefined, 40);
    expect(api.listTimeline).toHaveBeenCalledWith('list', 'audio', 40);
  });

  it('cancels account resolution when leaving and prevents anonymous API calls', () => {
    const pending = new Subject<{ id: string }>();
    api.lookupAccount.mockReturnValue(pending);
    const fixture = TestBed.createComponent(RadioPage);
    fixture.componentInstance.handle.set('music');
    fixture.componentInstance.discover();
    fixture.destroy();
    expect(pending.observed).toBe(false);
    expect(api.getAccountStatuses).not.toHaveBeenCalled();
    auth.isAnonymous = true;
    const anonymous = TestBed.createComponent(RadioPage);
    anonymous.detectChanges();
    anonymous.componentInstance.chooseSource('list');
    anonymous.componentInstance.discover();
    expect(api.lists).not.toHaveBeenCalled();
    expect(anonymous.nativeElement.textContent).toContain('Sign in');
  });
});
