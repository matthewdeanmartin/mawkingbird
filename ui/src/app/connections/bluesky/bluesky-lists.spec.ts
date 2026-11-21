import { HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { BlueskyLists, BSKY_MOD_LIST } from './bluesky-lists';
import { BlueskySession } from './bluesky-session';
import { BSKY_CURATE_LIST } from './bluesky-types';

const ME = 'did:plc:me';

describe('BlueskyLists', () => {
  let request: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let deleteRecord: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    request = vi.fn(() => of({ uri: `at://${ME}/app.bsky.graph.list/new` }));
    deleteRecord = vi.fn(() => of({}));
    get = vi.fn((nsid: string, params: HttpParams) => {
      if (nsid === 'app.bsky.graph.getListsWithMembership') {
        return of({
          listsWithMembership: [
            { list: { uri: 'at://l1', name: 'Birds', purpose: BSKY_CURATE_LIST } },
            {
              list: { uri: 'at://l2', name: 'Spam', purpose: BSKY_MOD_LIST },
              listItem: { uri: `at://${ME}/app.bsky.graph.listitem/i2` },
            },
            {
              list: { uri: 'at://l3', name: 'Pack', purpose: 'app.bsky.graph.defs#referencelist' },
            },
          ],
        });
      }
      // getList pages: two items, then the end.
      return params.get('cursor')
        ? of({ items: [] })
        : of({
            items: [
              { uri: `at://${ME}/app.bsky.graph.listitem/a` },
              { uri: `at://${ME}/app.bsky.graph.listitem/b` },
            ],
            cursor: 'next',
          });
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: BlueskyApi, useValue: { get, request, deleteRecord } },
        { provide: BlueskySession, useValue: { session: () => ({ did: ME }) } },
      ],
    });
  });

  it('lists the reader’s curated and moderation lists with membership', async () => {
    const rows = await TestBed.inject(BlueskyLists).membership('did:plc:them');
    expect(rows.map((r) => [r.list.name, r.itemUri])).toEqual([
      ['Birds', null],
      ['Spam', `at://${ME}/app.bsky.graph.listitem/i2`],
    ]);
    const params = get.mock.calls[0][1] as HttpParams;
    expect(params.get('actor')).toBe('did:plc:them');
    expect(params.getAll('purposes')).toEqual(['curatelist', 'modlist']);
  });

  it('creates a list and adds a member as records in the reader’s repository', async () => {
    const lists = TestBed.inject(BlueskyLists);
    await lists.create('  Friends ', 'mod', 'people');
    expect(request.mock.calls[0][1]).toMatchObject({
      repo: ME,
      collection: 'app.bsky.graph.list',
      record: { name: 'Friends', purpose: BSKY_MOD_LIST, description: 'people' },
    });
    await lists.add('at://l1', 'did:plc:them');
    expect(request.mock.calls[1][1]).toMatchObject({
      collection: 'app.bsky.graph.listitem',
      record: { subject: 'did:plc:them', list: 'at://l1' },
    });
  });

  it('deletes a list together with its listitems', async () => {
    await TestBed.inject(BlueskyLists).deleteList(`at://${ME}/app.bsky.graph.list/l9`);
    const [nsid, body] = request.mock.calls[0] as [
      string,
      { writes: { collection: string; rkey: string }[] },
    ];
    expect(nsid).toBe('com.atproto.repo.applyWrites');
    expect(body.writes.map((w) => `${w.collection}/${w.rkey}`)).toEqual([
      'app.bsky.graph.listitem/a',
      'app.bsky.graph.listitem/b',
      'app.bsky.graph.list/l9',
    ]);
  });

  it('refuses a list with no name', async () => {
    await expect(TestBed.inject(BlueskyLists).create('  ', 'curate')).rejects.toThrow();
  });
});
