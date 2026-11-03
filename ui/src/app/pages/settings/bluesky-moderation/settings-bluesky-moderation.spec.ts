import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../../models';
import { BlueskyModeration } from '../../../providers/bluesky/bluesky-moderation';
import { BlueskyModerationState } from '../../../providers/bluesky/bluesky-moderation-state';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { StatusVisibility } from '../../../status-visibility';
import { SettingsBlueskyModeration } from './settings-bluesky-moderation';

/** One page for Bluesky's muted words, moderation lists and moderation services. */
describe('SettingsBlueskyModeration', () => {
  let linked: ReturnType<typeof signal<boolean>>;
  let moderation: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    linked = signal(true);
    moderation = {
      reload: vi.fn().mockResolvedValue(undefined),
      lists: vi
        .fn()
        .mockResolvedValue([
          { uri: 'at://l', name: 'Spam accounts', purpose: 'block', creator: 'owner.example' },
        ]),
      labelers: vi
        .fn()
        .mockResolvedValue([{ did: 'did:plc:mod', name: 'Mod', handle: 'mod.example' }]),
      addMutedWord: vi.fn().mockResolvedValue(undefined),
      removeMutedWord: vi.fn().mockResolvedValue(undefined),
      unsubscribeList: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlueskySession, useValue: { linked } },
        { provide: BlueskyModeration, useValue: moderation },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(SettingsBlueskyModeration);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    return fixture;
  }

  it('asks to link Bluesky when none is linked', async () => {
    linked.set(false);
    const el = (await render()).nativeElement as HTMLElement;

    expect(el.textContent).toContain('No Bluesky account is linked');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/settings/connections/bluesky');
    expect(moderation['reload']).not.toHaveBeenCalled();
  });

  it('shows muted words, lists and services from Bluesky', async () => {
    TestBed.inject(BlueskyModerationState).mutedWords.set([
      { value: 'spoilers', targets: ['tag'], actorTarget: 'exclude-following' },
    ]);
    const el = (await render()).nativeElement as HTMLElement;

    expect(el.textContent).toContain('spoilers');
    expect(el.textContent).toContain('tags only');
    expect(el.textContent).toContain('not from people you follow');
    expect(el.textContent).toContain('Spam accounts');
    expect(el.textContent).toContain('Block list');
    expect(el.textContent).toContain('@mod.example');
  });

  it('mutes a word with the chosen scope and duration', async () => {
    const f = await render();
    const page = f.componentInstance as unknown as {
      wordValue: { set(v: string): void };
      wordWhere: { set(v: string): void };
      wordDays: { set(v: number): void };
      addWord(): Promise<void>;
    };
    page.wordValue.set('  big game ');
    page.wordWhere.set('tags');
    page.wordDays.set(7);

    await page.addWord();

    const [word] = moderation['addMutedWord'].mock.calls[0];
    expect(word).toMatchObject({ value: 'big game', targets: ['tag'], actorTarget: 'all' });
    expect(Date.parse(word.expiresAt) - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
  });

  it('shows a failure in its own section', async () => {
    moderation['unsubscribeList'].mockRejectedValue(new Error('List not found'));
    const f = await render();
    const unsubscribe = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Unsubscribe'),
    )!;

    unsubscribe.click();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();

    expect((f.nativeElement as HTMLElement).textContent).toContain('List not found');
  });
});

/** Muted words reach every card through the same filter path as Mastodon's. */
describe('StatusVisibility with Bluesky muted words', () => {
  it('collapses a matching Bluesky post behind a warn filter named after the word', () => {
    TestBed.configureTestingModule({});
    TestBed.inject(BlueskyModerationState).mutedWords.set([
      { value: 'spoilers', targets: ['content', 'tag'] },
    ]);
    const visibility = TestBed.inject(StatusVisibility);
    const status = {
      provider: 'bluesky',
      content: '<p>Big spoilers inside</p>',
      account: { id: 'bsky:did:plc:x' },
      providerRef: {},
    } as unknown as Status;

    const [result] = visibility.activeFilters(status, 'home');
    expect(result.filter).toMatchObject({ title: 'spoilers', filter_action: 'warn' });
    expect(visibility.hiddenByFilter(status, 'home')).toBe(false);

    TestBed.inject(BlueskyModerationState).mutedWords.set([]);
    expect(visibility.activeFilters(status, 'home')).toEqual([]);
  });
});
