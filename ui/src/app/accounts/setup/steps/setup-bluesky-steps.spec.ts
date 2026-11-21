import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from '../../../connections/bluesky/bluesky-api';
import { BlueskySession } from '../../../connections/bluesky/bluesky-session';
import { BlueskyStarterPacks } from '../../../connections/bluesky/bluesky-starter-packs';
import { Auth } from '../../../platform/session/auth';
import { SetupState } from '../setup-state';
import { SetupBlueskyProfile } from './setup-bluesky-profile';
import { SetupBlueskyIntro } from './setup-bluesky-intro';
import { SetupBlueskyFollow } from './setup-bluesky-follow';

describe('Bluesky setup steps', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    localStorage.clear();
    api = {
      getProfile: vi.fn(() => of({ did: 'did:plc:new', handle: 'new.bsky.social' })),
      getOwnProfileRecord: vi.fn(() =>
        of({
          uri: 'at://did:plc:new/app.bsky.actor.profile/self',
          cid: 'cid-1',
          value: { $type: 'app.bsky.actor.profile', pronouns: 'they/them' },
        }),
      ),
      putProfile: vi.fn(() => of({ uri: 'u', cid: 'c' })),
      uploadBlob: vi.fn(),
      resolveHandle: vi.fn(() => of({ did: 'did:plc:friend' })),
      post: vi.fn(() => of({ uri: 'at://did:plc:new/app.bsky.feed.post/1', cid: 'p1' })),
      setPinnedPost: vi.fn(() => of({ uri: 'u', cid: 'c' })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideHttpClientTesting(),
        SetupState,
        { provide: BlueskyApi, useValue: api },
        {
          provide: BlueskySession,
          useValue: {
            updateProfileSnapshot: vi.fn(),
            linked: () => true,
            session: () => ({ did: 'did:plc:new' }),
          },
        },
        {
          provide: Auth,
          useValue: { refreshBlueskyAccount: vi.fn(), kind: () => 'bluesky', sessions: () => [] },
        },
      ],
    });
  });

  it('saves name and bio into the profile record, keeping its other fields', async () => {
    const fixture = TestBed.createComponent(SetupBlueskyProfile);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as unknown as {
      displayName: { set(v: string): void };
      description: { set(v: string): void };
    };
    cmp.displayName.set(' New Person ');
    cmp.description.set('I post about birds.');

    await TestBed.inject(SetupState).commit?.();

    expect(api['putProfile']).toHaveBeenCalledWith(
      {
        $type: 'app.bsky.actor.profile',
        pronouns: 'they/them',
        displayName: 'New Person',
        description: 'I post about birds.',
      },
      'cid-1',
    );
  });

  it('writes nothing when Next is pressed on an unchanged profile', async () => {
    TestBed.createComponent(SetupBlueskyProfile).detectChanges();
    await TestBed.inject(SetupState).commit?.();
    expect(api['putProfile']).not.toHaveBeenCalled();
  });

  it('posts the intro with mention facets and pins it on request', async () => {
    const fixture = TestBed.createComponent(SetupBlueskyIntro);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as unknown as {
      text: { set(v: string): void };
      phase(): string;
      post(): Promise<void>;
      pin(): Promise<void>;
    };
    cmp.text.set('Hello! Thanks @friend.bsky.social');

    await cmp.post();
    const record = api['post'].mock.calls[0][0] as { text: string; facets?: unknown[] };
    expect(record.text).toBe('Hello! Thanks @friend.bsky.social');
    expect(record.facets?.length).toBe(1);
    expect(cmp.phase()).toBe('posted');

    await cmp.pin();
    expect(api['setPinnedPost']).toHaveBeenCalledWith({
      uri: 'at://did:plc:new/app.bsky.feed.post/1',
      cid: 'p1',
    });
    expect(cmp.phase()).toBe('pinned');
  });

  it('keeps the text and explains when the post fails', async () => {
    api['post'].mockReturnValue(throwError(() => new Error('no')));
    const fixture = TestBed.createComponent(SetupBlueskyIntro);
    const cmp = fixture.componentInstance as unknown as {
      text: { set(v: string): void };
      phase(): string;
      error(): string;
      post(): Promise<void>;
    };
    cmp.text.set('Hello');
    await cmp.post();
    expect(cmp.phase()).toBe('write');
    expect(cmp.error()).toContain('didn’t post');
  });

  it('offers Bluesky’s suggestions to follow', async () => {
    const suggestions = vi.fn(async () => [{ did: 'did:plc:a', handle: 'a.bsky.social' }]);
    TestBed.overrideProvider(BlueskyStarterPacks, { useValue: { suggestions } });
    const fixture = TestBed.createComponent(SetupBlueskyFollow);
    await fixture.whenStable();
    expect(suggestions).toHaveBeenCalledWith(30);
  });
});
