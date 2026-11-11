import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../platform/api/models';
import { BlueskyModeration } from '../../connections/bluesky/bluesky-moderation';
import { BlueskyModerationState } from '../../connections/bluesky/bluesky-moderation-state';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BlueskyChatApi } from '../../connections/bluesky/bluesky-chat-api';
import { of, throwError } from 'rxjs';
import { StatusVisibility } from '../../moderation/status-visibility';
import { SettingsBlueskyModeration } from './settings-bluesky-moderation';

/** One page for Bluesky's muted words, moderation lists and moderation services. */
describe('SettingsBlueskyModeration', () => {
  let linked: ReturnType<typeof signal<boolean>>;
  let moderation: Record<string, ReturnType<typeof vi.fn>>;
  let chat: Record<string, ReturnType<typeof vi.fn>>;

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
      addMutedWords: vi.fn().mockResolvedValue(undefined),
      removeMutedWord: vi.fn().mockResolvedValue(undefined),
      unsubscribeList: vi.fn().mockResolvedValue(undefined),
    };
    chat = {
      getAllowIncoming: vi.fn().mockReturnValue(of('following')),
      setAllowIncoming: vi.fn().mockReturnValue(of({})),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlueskySession, useValue: { linked } },
        { provide: BlueskyModeration, useValue: moderation },
        { provide: BlueskyChatApi, useValue: chat },
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

  it('mutes a pasted list in one go, every word under the rule chosen in the dialog', async () => {
    const f = await render();
    const el = f.nativeElement as HTMLElement;
    const open = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add many at once'),
    )!;
    open.click();
    f.detectChanges();
    const dialog = document.body.querySelector('app-bulk-words-dialog')!;
    // The rule controls are in the dialog, beside the list.
    expect(dialog.querySelectorAll('select').length).toBe(2);
    const page = f.componentInstance as unknown as {
      wordExcludeFollowing: { set(v: boolean): void };
      addWords(values: string[]): Promise<void>;
      bulkOpen(): boolean;
    };
    page.wordExcludeFollowing.set(true);
    await page.addWords(['xyzzy', 'plugh']);

    expect(moderation['addMutedWords']).toHaveBeenCalledTimes(1);
    const [words] = moderation['addMutedWords'].mock.calls[0];
    expect(words).toEqual([
      { value: 'xyzzy', targets: ['content', 'tag'], actorTarget: 'exclude-following' },
      { value: 'plugh', targets: ['content', 'tag'], actorTarget: 'exclude-following' },
    ]);
    expect(page.bulkOpen()).toBe(false);
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

  it('shows who can message you and saves a change straight away', async () => {
    const f = await render();
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const select = el.querySelector<HTMLSelectElement>('select[name="allowIncoming"]')!;
    expect(el.textContent).toContain('Who can message you');
    expect(select.value).toBe('following');

    select.value = 'none';
    select.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();

    expect(chat['setAllowIncoming']).toHaveBeenCalledWith('none');
    expect(el.textContent).toContain('Saved.');
  });

  it('puts the choice back and says why when Bluesky refuses it', async () => {
    chat['setAllowIncoming'].mockReturnValue(throwError(() => new Error('Bad token scope')));
    const f = await render();
    const page = f.componentInstance as unknown as {
      setAllowIncoming(v: string): Promise<void>;
      allowIncoming(): string | null;
    };

    await page.setAllowIncoming('all');
    f.detectChanges();

    expect(page.allowIncoming()).toBe('following');
    expect((f.nativeElement as HTMLElement).textContent).toContain('Bad token scope');
  });

  it('keeps the moderation sections when the chat setting cannot be read', async () => {
    chat['getAllowIncoming'].mockReturnValue(throwError(() => new Error('down')));
    const el = (await render()).nativeElement as HTMLElement;

    expect(el.textContent).toContain("Couldn't read this setting from Bluesky.");
    expect(el.textContent).toContain('Spam accounts');
    expect(el.querySelector('select[name="allowIncoming"]')).toBeNull();
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
