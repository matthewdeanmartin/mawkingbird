import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { SubmittedReports } from './report-history';
import { Auth } from '../auth';
import { Server } from '../server';

describe('SubmittedReports', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { account: signal(null) } },
        { provide: Server, useValue: { baseUrl: signal('https://example.social') } },
      ],
    });
  });
  afterEach(() => localStorage.clear());
  it('keeps account and post receipts separate from other account scopes', () => {
    const store = TestBed.inject(SubmittedReports);
    const scope = store.scope();
    store.record({ accountId: 'a', username: 'alice', category: 'spam' }, scope);
    store.record(
      { accountId: 'a', username: 'alice', statusId: '42', category: 'violation' },
      scope,
    );
    store.record({ accountId: 'b', username: 'bob', category: 'other' }, scope + '_other');
    expect(store.entries()).toHaveLength(2);
    expect(store.entries()[0].statusId).toBe('42');
    expect(store.entries().some((r) => r.username === 'bob')).toBe(false);
    expect(store.entries().every((r) => !('comment' in r))).toBe(true);
  });
});
