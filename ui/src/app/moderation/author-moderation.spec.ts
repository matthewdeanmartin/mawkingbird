import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { Api } from '../platform/api/api';
import { Auth } from '../platform/session/auth';
import { AuthorModeration } from './author-moderation';
import { LocalModeration } from './local-moderation';
import { Account } from '../platform/api/models';
import { AnonymousCapabilities } from '../accounts/anonymous/anonymous-capabilities';
import { BlueskyGraph } from '../connections/bluesky/bluesky-graph';
import { BlueskySession } from '../connections/bluesky/bluesky-session';

const flooder = {
  id: '77',
  acct: 'flooder@elsewhere.example',
  username: 'flooder',
  url: 'https://elsewhere.example/@flooder',
} as Account;

describe('AuthorModeration', () => {
  let anonymous: boolean;
  let canManage: boolean;
  let linked: boolean;
  let api: {
    lookupAccount: ReturnType<typeof vi.fn>;
    muteAccount: ReturnType<typeof vi.fn>;
    block: ReturnType<typeof vi.fn>;
    unmuteAccount: ReturnType<typeof vi.fn>;
    resolveReplyMention: ReturnType<typeof vi.fn>;
  };
  let graph: { mute: ReturnType<typeof vi.fn> };

  function setUp(): AuthorModeration {
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        {
          provide: Auth,
          useValue: {
            get isAnonymous() {
              return anonymous;
            },
          },
        },
        {
          provide: AnonymousCapabilities,
          useValue: {
            get canManageRelationships() {
              return canManage;
            },
          },
        },
        { provide: BlueskySession, useValue: { linked: () => linked } },
        { provide: BlueskyGraph, useValue: graph },
      ],
    });
    const local = TestBed.inject(LocalModeration);
    local.useViewer(() => ({ key: 'v', anonymous, self: null }));
    return TestBed.inject(AuthorModeration);
  }

  beforeEach(() => {
    localStorage.clear();
    anonymous = false;
    canManage = true;
    linked = false;
    api = {
      lookupAccount: vi.fn(() => of({ ...flooder, id: 'home-5' })),
      muteAccount: vi.fn(() => of({})),
      block: vi.fn(() => of({})),
      unmuteAccount: vi.fn(() => of({})),
      resolveReplyMention: vi.fn(),
    };
    graph = { mute: vi.fn(() => of({})) };
  });

  it('mutes in the browser only for Anonymous', () => {
    anonymous = true;
    const moderation = setUp();
    moderation.mute({ account: flooder }, 3600).subscribe();
    expect(api.muteAccount).not.toHaveBeenCalled();
    expect(TestBed.inject(LocalModeration).isMuted(flooder)).toBe(true);
  });

  it('mutes a signed-in reader on their server, looking up an account read elsewhere', () => {
    const moderation = setUp();
    moderation.mute({ account: flooder }, null).subscribe();
    expect(api.lookupAccount).toHaveBeenCalledWith('flooder@elsewhere.example');
    expect(api.muteAccount).toHaveBeenCalledWith('home-5', undefined);
    expect(localStorage.getItem('mockingbird_anonymous_moderation')).toBeNull();
    // Hidden from what is on screen now, for this reader only.
    expect(moderation.isMuted({ account: flooder })).toBe(true);
  });

  it('uses the id as-is when the caller knows it is native', () => {
    const moderation = setUp();
    moderation.block({ account: flooder, native: true }).subscribe();
    expect(api.lookupAccount).not.toHaveBeenCalled();
    expect(api.block).toHaveBeenCalledWith('77');
  });

  it('mutes a Bluesky author through the linked session, and offers nothing without one', () => {
    const moderation = setUp();
    const author = { ...flooder, id: 'bsky:did:plc:abc' } as Account;
    expect(moderation.route({ account: author, provider: 'bluesky' })).toBeNull();
    linked = true;
    moderation.mute({ account: author, provider: 'bluesky' }, null).subscribe();
    expect(graph.mute).toHaveBeenCalledWith('did:plc:abc');
  });

  it('offers no mute for a source the reader cannot moderate', () => {
    const moderation = setUp();
    expect(moderation.route({ account: flooder, provider: 'twitter' })).toBeNull();
    canManage = false;
    expect(moderation.route({ account: flooder })).toBeNull();
  });
});
