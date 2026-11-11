import { HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { BlueskySession } from './bluesky-session';
import { BlueskyStarterPacks, starterPackPath } from './bluesky-starter-packs';

const PACK = 'at://did:plc:owner/app.bsky.graph.starterpack/3pack';
const LIST = 'at://did:plc:owner/app.bsky.graph.list/3list';
const person = (n: number) => ({ did: `did:plc:p${n}`, handle: `p${n}.bsky.social` });

/** Bluesky starter packs: a pack record pointing at a list of members. */
describe('BlueskyStarterPacks', () => {
  let publicGet: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let request: ReturnType<typeof vi.fn>;
  let packs: BlueskyStarterPacks;

  beforeEach(() => {
    publicGet = vi.fn((nsid: string, params: HttpParams) => {
      if (nsid === 'app.bsky.graph.getStarterPack') {
        return of({
          starterPack: {
            uri: PACK,
            record: { name: 'Birders', list: LIST, createdAt: 'x' },
            creator: { did: 'did:plc:owner', handle: 'owner.example' },
            list: { uri: LIST, listItemCount: 3 },
            joinedAllTimeCount: 12,
          },
        });
      }
      // getList, two pages
      return of(
        params.get('cursor')
          ? { items: [{ subject: person(3) }] }
          : { items: [{ subject: person(1) }, { subject: person(2) }], cursor: 'next' },
      );
    });
    get = vi.fn(() => of({ actors: [person(9)], suggestions: [person(8)] }));
    request = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BlueskyApi,
          useValue: {
            publicGet,
            get,
            request,
            resolveHandle: () => of({ did: 'did:plc:owner' }),
          },
        },
        { provide: BlueskySession, useValue: { session: () => ({ did: 'did:plc:me' }) } },
      ],
    });
    packs = TestBed.inject(BlueskyStarterPacks);
  });

  it('turns a bsky.app starter pack link into its at-uri and its Mawkingbird page', async () => {
    await expect(
      packs.uriFromAddress('https://bsky.app/starter-pack/owner.example/3pack'),
    ).resolves.toBe(PACK);
    expect(starterPackPath(PACK)).toEqual(['/bluesky/starter-packs', 'did:plc:owner', '3pack']);
    await expect(packs.uriFromAddress('https://example.com/x')).rejects.toThrow(
      'not a Bluesky starter pack address',
    );
  });

  it('loads a pack with every member, across list pages, without an account', async () => {
    const pack = await packs.load(PACK);

    expect(pack.record.name).toBe('Birders');
    expect(pack.members.map((m) => m.did)).toEqual(['did:plc:p1', 'did:plc:p2', 'did:plc:p3']);
    expect(pack.joinedAllTimeCount).toBe(12);
    expect(get).not.toHaveBeenCalled(); // public reads only
  });

  it('creates the list, its members and the pack in one atomic write', async () => {
    const uri = await packs.create('Birders', 'Birds and the people who watch them', [
      'did:plc:p1',
      'did:plc:p2',
      'did:plc:p1',
    ]);

    const [nsid, body] = request.mock.calls[0] as [
      string,
      {
        repo: string;
        writes: { collection: string; rkey: string; value: Record<string, unknown> }[];
      },
    ];
    expect(nsid).toBe('com.atproto.repo.applyWrites');
    expect(body.repo).toBe('did:plc:me');
    const [list, ...rest] = body.writes;
    const pack = rest.pop()!;
    expect(list.collection).toBe('app.bsky.graph.list');
    expect(list.value['purpose']).toBe('app.bsky.graph.defs#referencelist');
    // Duplicates collapse to one list item each.
    expect(rest.map((w) => w.value['subject'])).toEqual(['did:plc:p1', 'did:plc:p2']);
    const listUri = `at://did:plc:me/app.bsky.graph.list/${list.rkey}`;
    expect(rest.every((w) => w.value['list'] === listUri)).toBe(true);
    expect(pack.collection).toBe('app.bsky.graph.starterpack');
    expect(pack.value).toMatchObject({
      name: 'Birders',
      description: 'Birds and the people who watch them',
      list: listUri,
    });
    expect(uri).toBe(`at://did:plc:me/app.bsky.graph.starterpack/${pack.rkey}`);
    // Record keys are valid TIDs.
    expect(body.writes.every((w) => /^[2-7a-z]{13}$/.test(w.rkey))).toBe(true);
  });

  it('asks Bluesky for suggestions and for accounts similar to one', async () => {
    await expect(packs.suggestions()).resolves.toEqual([person(9)]);
    await expect(packs.similarTo('did:plc:p1')).resolves.toEqual([person(8)]);
    expect(get.mock.calls.map(([nsid]) => nsid)).toEqual([
      'app.bsky.actor.getSuggestions',
      'app.bsky.graph.getSuggestedFollowsByActor',
    ]);
  });
});
