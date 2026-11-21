import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from '../../../connections/bluesky/bluesky-api';
import { BlueskyChatApi } from '../../../connections/bluesky/bluesky-chat-api';
import { BlueskySession } from '../../../connections/bluesky/bluesky-session';
import { BlueskyNewGroup, parseHandles } from './bluesky-new-group';
import { BlueskyJoinGroup } from './bluesky-join-group';
import { ActivatedRoute } from '@angular/router';

describe('parseHandles', () => {
  it('splits on spaces and commas, drops @ and repeats', () => {
    expect(parseHandles(' @Ana.test, bo.test  ana.test\ncy.test ')).toEqual([
      'ana.test',
      'bo.test',
      'cy.test',
    ]);
  });
});

describe('New Bluesky group', () => {
  let chat: Record<string, ReturnType<typeof vi.fn>>;
  let resolveHandle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    chat = { createGroup: vi.fn(() => of({ convo: { id: 'g1' } })) };
    resolveHandle = vi.fn((handle: string) =>
      handle === 'nobody.test'
        ? throwError(() => new Error('no'))
        : of({ did: `did:plc:${handle}` }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlueskyChatApi, useValue: chat },
        { provide: BlueskyApi, useValue: { resolveHandle } },
      ],
    });
  });

  function component() {
    const fixture = TestBed.createComponent(BlueskyNewGroup);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      name: { set(v: string): void };
      members: { set(v: string): void };
      error(): string;
      create(): Promise<void>;
      created: { subscribe(fn: (c: unknown) => void): void };
      link: { set(v: string): void };
      badLink(): boolean;
      openLink(): void;
    };
  }

  it('resolves the handles and creates the group, then hands it over', async () => {
    const cmp = component();
    const created = vi.fn();
    cmp.created.subscribe(created);
    cmp.name.set(' Birders ');
    cmp.members.set('@ana.test, bo.test');
    await cmp.create();
    expect(chat['createGroup']).toHaveBeenCalledWith('Birders', [
      'did:plc:ana.test',
      'did:plc:bo.test',
    ]);
    expect(created).toHaveBeenCalledWith({ id: 'g1' });
  });

  it('names handles it couldn’t find and creates nothing', async () => {
    const cmp = component();
    cmp.name.set('G');
    cmp.members.set('ana.test nobody.test');
    await cmp.create();
    expect(chat['createGroup']).not.toHaveBeenCalled();
    expect(cmp.error()).toContain('@nobody.test');
  });

  it('opens a pasted join link, and refuses anything else', () => {
    const cmp = component();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    cmp.link.set('https://example.com/nope');
    cmp.openLink();
    expect(cmp.badLink()).toBe(true);
    cmp.link.set('https://bsky.app/chat/AbC123');
    cmp.openLink();
    expect(navigate).toHaveBeenCalledWith(['/bsky/chat', 'AbC123']);
  });
});

describe('Join a Bluesky group', () => {
  let chat: Record<string, ReturnType<typeof vi.fn>>;
  const preview = {
    convoId: 'g1',
    code: 'AbC123',
    name: 'Birders',
    owner: { did: 'did:plc:ana', handle: 'ana.test' },
    memberCount: 3,
    memberLimit: 50,
    requireApproval: false,
  };

  function render(previewValue: object) {
    chat = {
      joinLinkPreview: vi.fn(() => of({ joinLinkPreviews: [previewValue] })),
      requestJoin: vi.fn(() => of({ status: 'joined', convo: { id: 'g1' } })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlueskyChatApi, useValue: chat },
        { provide: BlueskySession, useValue: { linked: () => true } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['code', 'AbC123']]) } },
        },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(BlueskyJoinGroup);
    fixture.detectChanges();
    return { fixture, navigate };
  }

  it('shows the group and joins straight into its chat', async () => {
    const { fixture, navigate } = render(preview);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Birders');
    await (fixture.componentInstance as unknown as { join(): Promise<void> }).join();
    expect(chat['requestJoin']).toHaveBeenCalledWith('AbC123');
    expect(navigate).toHaveBeenCalledWith(['/conversations'], { queryParams: { open: 'bsky:g1' } });
  });

  it('says it asked, when the owner lets people in', async () => {
    const { fixture } = render({ ...preview, requireApproval: true });
    chat['requestJoin'].mockReturnValue(of({ status: 'pending' }));
    await fixture.whenStable();
    await (fixture.componentInstance as unknown as { join(): Promise<void> }).join();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Asked.');
  });

  it('opens the chat at once for someone already in the group', async () => {
    const { fixture, navigate } = render({ ...preview, convo: { id: 'g1' } });
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/conversations'], { queryParams: { open: 'bsky:g1' } });
  });
});
