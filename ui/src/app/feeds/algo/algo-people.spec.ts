import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Relationship, Status } from '../../platform/api/models';
import { AlgoPeople } from './algo-people';

describe('Algo People browser sample', () => {
  it('reads at most five Home pages, then filters observed authors', async () => {
    let calls = 0;
    const api = {
      homeTimelinePage: () => {
        calls++;
        const status = {
          id: String(100 - calls),
          account: { id: 'friend', followers_count: 5 },
        } as Status;
        return of({ statuses: [status], nextMaxId: status.id, cursorSource: 'last-status' });
      },
      relationships: () =>
        of([{ id: 'friend', following: true, followed_by: true } as Relationship]),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    TestBed.overrideComponent(AlgoPeople, { set: { template: '' } });
    const fixture = TestBed.createComponent(AlgoPeople);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      loading: () => boolean;
      posts: () => Status[];
      pages: () => number;
      selected: { set: (category: string) => void };
      visible: () => Status[];
    };
    await vi.waitFor(() => expect(page.loading()).toBe(false));
    expect(calls).toBe(5);
    expect(page.pages()).toBe(5);
    page.selected.set('mutuals');
    expect(page.visible()).toHaveLength(5);
    page.selected.set('celebrities');
    expect(page.visible()).toHaveLength(0);
  });
});
