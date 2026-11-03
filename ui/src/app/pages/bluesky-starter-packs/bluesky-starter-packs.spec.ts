import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyGraph } from '../../providers/bluesky/bluesky-graph';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BlueskyStarterPacks } from '../../providers/bluesky/bluesky-starter-packs';
import { BskyProfile } from '../../providers/bluesky/bluesky-types';
import { BlueskyPeopleList } from './bluesky-people-list';
import { BlueskyProfileDiscovery } from './bluesky-profile-discovery';
import { BlueskyStarterPackPage } from './bluesky-starter-pack-page';
import { BlueskyStarterPacksPage } from './bluesky-starter-packs-page';

const PACK = 'at://did:plc:owner/app.bsky.graph.starterpack/3pack';
const followed = { following: 'at://follow' };
const people: BskyProfile[] = [
  { did: 'did:plc:a', handle: 'a.bsky.social', displayName: 'Ana' },
  { did: 'did:plc:b', handle: 'b.bsky.social', viewer: followed },
  { did: 'did:plc:me', handle: 'me.bsky.social' },
] as BskyProfile[];

const settle = () => new Promise((r) => setTimeout(r, 0));

/**
 * Bluesky starter packs in Mawkingbird: new UI with no Mastodon counterpart.
 * Readable by anyone; following needs a linked Bluesky account.
 */
describe('Bluesky starter packs UI', () => {
  let linked: ReturnType<typeof signal<boolean>>;
  let follow: ReturnType<typeof vi.fn>;
  let packs: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    linked = signal(true);
    follow = vi.fn(() => of({ following: true }));
    packs = {
      uriFor: vi.fn().mockResolvedValue(PACK),
      uriFromAddress: vi.fn().mockResolvedValue(PACK),
      load: vi.fn().mockResolvedValue({
        uri: PACK,
        record: { name: 'Birders', description: 'Birds', list: 'l', createdAt: 'x' },
        creator: { did: 'did:plc:owner', handle: 'owner.example' },
        listItemCount: 3,
        joinedAllTimeCount: 12,
        members: people,
      }),
      byActor: vi
        .fn()
        .mockResolvedValue([
          { uri: PACK, record: { name: 'Birders' }, creator: {}, listItemCount: 3 },
        ]),
      ownLists: vi
        .fn()
        .mockResolvedValue([
          { uri: 'at://did:plc:me/app.bsky.graph.list/l1', name: 'Friends', listItemCount: 2 },
        ]),
      listMembers: vi.fn().mockResolvedValue(people.slice(0, 2)),
      create: vi.fn().mockResolvedValue('at://did:plc:me/app.bsky.graph.starterpack/new'),
      suggestions: vi.fn().mockResolvedValue([people[0]]),
      similarTo: vi.fn().mockResolvedValue([{ did: 'did:plc:z', handle: 'z.bsky.social' }]),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: BlueskySession,
          useValue: { linked, session: () => (linked() ? { did: 'did:plc:me' } : null) },
        },
        { provide: BlueskyGraph, useValue: { follow, unfollow: vi.fn(() => of({})) } },
        { provide: BlueskyStarterPacks, useValue: packs },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ actor: 'owner.example', rkey: '3pack' }) },
          },
        },
      ],
    });
  });

  describe('people list', () => {
    it('follows from a row and follows everyone not yet followed, never yourself', async () => {
      const f = TestBed.createComponent(BlueskyPeopleList);
      f.componentRef.setInput('people', people);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      const buttons = [...el.querySelectorAll('button')];
      expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Follow', 'Following']);

      await expect(f.componentInstance.followAll()).resolves.toBe(1);
      expect(follow.mock.calls).toEqual([['did:plc:a']]);
      f.detectChanges();
      expect([...el.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual([
        'Following',
        'Following',
      ]);
    });

    it('reports a failed follow by name', async () => {
      follow.mockReturnValue(throwError(() => new Error('no')));
      const f = TestBed.createComponent(BlueskyPeopleList);
      f.componentRef.setInput('people', people);
      f.detectChanges();
      const failed: string[] = [];
      f.componentInstance.failed.subscribe((name) => failed.push(name));

      (f.nativeElement as HTMLElement).querySelector('button')!.click();
      await settle();

      expect(failed).toEqual(['Ana']);
    });

    it('shows no Follow buttons without a linked Bluesky account', () => {
      linked.set(false);
      const f = TestBed.createComponent(BlueskyPeopleList);
      f.componentRef.setInput('people', people);
      f.detectChanges();
      expect((f.nativeElement as HTMLElement).querySelector('button')).toBeNull();
    });
  });

  describe('pack page', () => {
    async function render() {
      const f = TestBed.createComponent(BlueskyStarterPackPage);
      f.detectChanges();
      await settle();
      f.detectChanges();
      return f;
    }

    it('shows the pack, its counts, and Follow all for those not yet followed', async () => {
      const f = await render();
      const text = (f.nativeElement as HTMLElement).textContent!;

      expect(packs['uriFor']).toHaveBeenCalledWith('owner.example', '3pack');
      expect(text).toContain('Birders');
      expect(text).toContain('A Bluesky starter pack by @owner.example');
      expect(text).toContain('3 people · 12 joined through it');
      expect(text).toContain('Follow all 1');
      const link = (f.nativeElement as HTMLElement).querySelector('a[target="_blank"]');
      expect(link?.getAttribute('href')).toBe('https://bsky.app/starter-pack/owner.example/3pack');
    });

    it('offers similar accounts after a single follow', async () => {
      const f = await render();
      const ana = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Follow',
      )!;

      ana.click();
      await settle();
      f.detectChanges();

      expect(packs['similarTo']).toHaveBeenCalledWith('did:plc:a');
      expect((f.nativeElement as HTMLElement).textContent).toContain('Similar to Ana');
      expect((f.nativeElement as HTMLElement).textContent).toContain('@z.bsky.social');
    });

    it('asks to link Bluesky before following', async () => {
      linked.set(false);
      const text = ((await render()).nativeElement as HTMLElement).textContent!;
      expect(text).toContain('Link Bluesky to follow people from this pack.');
      expect(text).not.toContain('Follow all');
    });
  });

  describe('hub', () => {
    async function render() {
      const f = TestBed.createComponent(BlueskyStarterPacksPage);
      f.detectChanges();
      await settle();
      f.detectChanges();
      return f;
    }

    it('opens a pack from its bsky.app link', async () => {
      const f = await render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const page = f.componentInstance as unknown as {
        address: { set(v: string): void };
        open(): Promise<void>;
      };
      page.address.set('https://bsky.app/starter-pack/owner.example/3pack');

      await page.open();

      expect(navigate).toHaveBeenCalledWith(['/bluesky/starter-packs', 'did:plc:owner', '3pack']);
    });

    it('lists your packs and suggestions, and makes a pack from a list', async () => {
      const f = await render();
      const text = (f.nativeElement as HTMLElement).textContent!;
      expect(text).toContain('Birders');
      expect(text).toContain('Friends (2 people)');
      expect(text).toContain('Suggested for you');
      expect(text).toContain('Ana');

      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const page = f.componentInstance as unknown as {
        name: { set(v: string): void };
        listUri: { set(v: string): void };
        create(): Promise<void>;
      };
      page.name.set('Pals');
      page.listUri.set('at://did:plc:me/app.bsky.graph.list/l1');
      await page.create();

      expect(packs['create']).toHaveBeenCalledWith('Pals', '', ['did:plc:a', 'did:plc:b']);
      expect(navigate).toHaveBeenCalledWith(['/bluesky/starter-packs', 'did:plc:me', 'new']);
    });

    it('still opens packs without a linked account, and says what linking adds', async () => {
      linked.set(false);
      const text = ((await render()).nativeElement as HTMLElement).textContent!;
      expect(text).toContain('Open a starter pack');
      expect(text).toContain('Link Bluesky to see your own packs');
      expect(packs['suggestions']).not.toHaveBeenCalled();
    });
  });

  describe('profile discovery', () => {
    it('lists the account’s packs, and similar accounts once followed', async () => {
      const f = TestBed.createComponent(BlueskyProfileDiscovery);
      f.componentRef.setInput('did', 'did:plc:owner');
      f.componentRef.setInput('name', 'Owner');
      f.detectChanges();
      await settle();
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Starter packs by Owner');
      expect(el.querySelector('a')?.getAttribute('href')).toBe(
        '/bluesky/starter-packs/did:plc:owner/3pack',
      );
      expect(packs['similarTo']).not.toHaveBeenCalled();

      f.componentRef.setInput('followedTick', 1);
      f.detectChanges();
      await settle();
      f.detectChanges();
      expect(el.textContent).toContain('Similar to Owner');
    });
  });
});
