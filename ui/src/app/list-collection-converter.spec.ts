import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { ListCollectionConverter, ConversionResult } from './list-collection-converter';
import { Account, Collection, CollectionItem, CollectionWithAccounts } from './models';

function account(id: string): Account {
  return { id, username: `u${id}`, acct: `u${id}`, display_name: `User ${id}` } as Account;
}

function item(accountId: string): CollectionItem {
  return {
    id: `item-${accountId}`,
    account_id: accountId,
    state: 'accepted',
    created_at: '2026-01-01T00:00:00Z',
  };
}

function collection(id: string, name: string, accountIds: string[] = []): Collection {
  return {
    id,
    account_id: 'me',
    name,
    description: '',
    discoverable: false,
    sensitive: false,
    local: true,
    item_count: accountIds.length,
    items: accountIds.map(item),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    uri: `https://example.social/collections/${id}`,
  };
}

describe('ListCollectionConverter', () => {
  let http: HttpTestingController;
  let converter: ListCollectionConverter;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    converter = TestBed.inject(ListCollectionConverter);
    TestBed.inject(Auth).account.set(account('me'));
  });

  afterEach(() => http.verify());

  it('reuses a same-name collection, adds only missing users, and skips a failed add', () => {
    let result: ConversionResult | undefined;
    converter.convertListToCollection('L1', 'Friends').subscribe((value) => (result = value));

    http.expectOne('/api/v1/lists/L1/accounts').flush([account('1'), account('2'), account('3')]);
    http
      .expectOne('/api/v1/accounts/me/collections')
      .flush({ collections: [collection('C1', 'Friends')] });
    const data: CollectionWithAccounts = {
      collection: collection('C1', 'Friends', ['1']),
      accounts: [account('1')],
    };
    http.expectOne('/api/v1/collections/C1').flush(data);

    http.expectOne('/api/v1/collections/C1/items').flush('', { status: 422, statusText: 'Nope' });
    const add = http.expectOne('/api/v1/collections/C1/items');
    expect(add.request.body).toEqual({ account_id: '3' });
    add.flush({ collection_item: item('3') });

    // The failed add above was a 422, which is how Mastodon says 'you do not
    // follow them' — the flag the page uses to offer the fix.
    expect(result).toEqual({ targetId: 'C1', added: 1, existing: 1, failed: 1, needsFollow: true });
  });

  it('creates a same-name collection when one does not exist', () => {
    let result: ConversionResult | undefined;
    converter.convertListToCollection('L2', 'New people').subscribe((value) => (result = value));

    http.expectOne('/api/v1/lists/L2/accounts').flush([account('9')]);
    http.expectOne('/api/v1/accounts/me/collections').flush({ collections: [] });
    const create = http.expectOne('/api/v1/collections');
    expect(create.request.body).toMatchObject({
      name: 'New people',
      sensitive: false,
      discoverable: false,
    });
    create.flush({ collection: collection('C9', 'New people') });
    http.expectOne('/api/v1/collections/C9/items').flush({ collection_item: item('9') });

    expect(result).toEqual({
      targetId: 'C9',
      added: 1,
      existing: 0,
      failed: 0,
      needsFollow: false,
    });
  });

  it('reuses a same-name list and caps collection conversion at the first 25 users', () => {
    const ids = Array.from({ length: 27 }, (_, index) => String(index + 1));
    const data: CollectionWithAccounts = {
      collection: collection('C2', 'Mutuals', ids),
      accounts: ids.map(account),
    };
    let result: ConversionResult | undefined;
    converter.convertCollectionToList(data).subscribe((value) => (result = value));

    http.expectOne('/api/v1/lists').flush([{ id: 'L9', title: 'Mutuals' }]);
    http.expectOne('/api/v1/lists/L9/accounts').flush([account('1')]);
    for (const id of ids.slice(1, 25)) {
      const add = http.expectOne('/api/v1/lists/L9/accounts');
      expect(add.request.body).toEqual({ account_ids: [id] });
      add.flush({});
    }
    http.expectNone((request) => request.body?.account_ids?.includes('26'));

    expect(result).toEqual({
      targetId: 'L9',
      added: 24,
      existing: 1,
      failed: 0,
      needsFollow: false,
    });
  });

  it('creates a same-name list when one does not exist', () => {
    const data: CollectionWithAccounts = {
      collection: collection('C3', 'Fresh', []),
      accounts: [],
    };
    let result: ConversionResult | undefined;
    converter.convertCollectionToList(data).subscribe((value) => (result = value));

    http.expectOne('/api/v1/lists').flush([]);
    const create = http.expectOne('/api/v1/lists');
    expect(create.request.body.get('title')).toBe('Fresh');
    create.flush({ id: 'L3', title: 'Fresh' });
    http.expectOne('/api/v1/lists/L3/accounts').flush([]);

    expect(result).toEqual({
      targetId: 'L3',
      added: 0,
      existing: 0,
      failed: 0,
      needsFollow: false,
    });
  });
});
