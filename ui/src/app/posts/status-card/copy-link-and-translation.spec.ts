import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowTrust } from '../../accounts/follow-trust';
import { Account, Status, Translation } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { StatusCard } from './status-card';

const me = {
  id: 'me',
  username: 'me',
  acct: 'me',
  display_name: 'Me',
  url: 'https://home.example/@me',
} as Account;
const zoe = {
  id: 'z1',
  username: 'zoe',
  acct: 'zoe@far.example',
  display_name: 'Zoe',
  url: 'https://far.example/@zoe',
} as Account;

function post(overrides: Partial<Status> = {}): Status {
  return {
    id: '7',
    created_at: '2026-11-11T12:00:00Z',
    edited_at: null,
    content: '<p>Guten Morgen</p>',
    spoiler_text: '',
    visibility: 'public',
    url: 'https://far.example/@zoe/7',
    uri: 'https://far.example/users/zoe/statuses/7',
    account: zoe,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    language: 'de',
    media_attachments: [],
    ...overrides,
  } as Status;
}

/** The protected state these tests drive directly, as a reader's clicks would. */
interface CardState {
  translation: WritableSignal<Translation | null>;
  replying: WritableSignal<boolean>;
}

describe('StatusCard copy link and translation notes', () => {
  const modal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(FollowTrust.prototype, 'isMutual').mockReturnValue(false);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.open = false;
      },
    });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const auth = TestBed.inject(Auth);
    auth.kind.set('mastodon');
    auth.token.set('copy-link-token');
    auth.setAccount(me);
    TestBed.inject(Server).setBaseUrl('https://home.example');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of [
      ['showModal', modal],
      ['close', close],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  function render(status: Status) {
    const fixture = TestBed.createComponent(StatusCard);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      state: fixture.componentInstance as unknown as CardState,
    };
  }

  it('opens mawkingbird.com links to the post and its author from the ••• menu, in the reader’s word', () => {
    TestBed.inject(ClientPrefs).postNoun.set('toot');
    const { fixture, el } = render(post());
    const item = [...el.querySelectorAll<HTMLButtonElement>('.danger-menu-panel button')].find(
      (b) => b.textContent?.trim() === 'Copy link',
    );
    expect(item).toBeTruthy();
    item!.click();
    fixture.detectChanges();
    const dialog = el.querySelector('app-copy-link-dialog')!;
    expect([...dialog.querySelectorAll('.row-label')].map((n) => n.textContent?.trim())).toEqual([
      'Toot',
      'Account',
    ]);
    expect([...dialog.querySelectorAll('input')].map((n) => n.value)).toEqual([
      'https://mawkingbird.com/home.example/@zoe@far.example/7',
      'https://mawkingbird.com/@zoe@far.example',
    ]);
  });

  it('links the original author of a boost, not the booster', () => {
    const { fixture, el } = render(post({ id: '9', account: me, reblog: post() }));
    const item = [...el.querySelectorAll<HTMLButtonElement>('.danger-menu-panel button')].find(
      (b) => b.textContent?.trim() === 'Copy link',
    );
    item!.click();
    fixture.detectChanges();
    const inputs = [...el.querySelectorAll('app-copy-link-dialog input')] as HTMLInputElement[];
    expect(inputs.map((n) => n.value)).toEqual([
      'https://mawkingbird.com/home.example/@zoe@far.example/7',
      'https://mawkingbird.com/@zoe@far.example',
    ]);
  });

  it('names the language a translation came from, quietly', () => {
    const { fixture, el, state } = render(post());
    state.translation.set({
      content: '<p>Good morning</p>',
      spoiler_text: '',
      detected_source_language: 'de',
      provider: 'DeepL.com',
    });
    fixture.detectChanges();
    expect(el.querySelector('.translation-note')?.textContent).toContain(
      'Translated from German via DeepL.com',
    );
  });

  it('warns, in red, when replying to a post shown in translation', () => {
    const { fixture, el, state } = render(post());
    state.replying.set(true);
    fixture.detectChanges();
    expect(el.querySelector('.reply-translated')).toBeNull();

    state.translation.set({
      content: '<p>Good morning</p>',
      spoiler_text: '',
      detected_source_language: 'de',
      provider: 'DeepL.com',
    });
    fixture.detectChanges();
    const warning = el.querySelector('.reply-translated');
    expect(warning?.getAttribute('tone')).toBe('error');
    expect(warning?.textContent).toContain(
      'Warning: you are replying to a translated post. The original is in German.',
    );
  });
});
