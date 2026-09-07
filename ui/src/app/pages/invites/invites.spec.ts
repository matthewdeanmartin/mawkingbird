import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { JOIN_MASTODON_URL } from '../../invites/invite-templates';
import { Account } from '../../models';
import { Server } from '../../server';
import { Invites } from './invites';

const ACCOUNT = {
  id: '1',
  username: 'matt',
  acct: 'matt@example.social',
  display_name: 'Matt',
  url: 'https://example.social/@matt',
} as Account;

describe('Invites', () => {
  let account: WritableSignal<Account | null>;
  let baseUrl: WritableSignal<string>;
  let isAuthenticated: boolean;
  let isAnonymous: boolean;

  function setUp(): ComponentFixture<Invites> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            account,
            get isAuthenticated() {
              return isAuthenticated;
            },
            get isAnonymous() {
              return isAnonymous;
            },
          },
        },
        { provide: Server, useValue: { baseUrl } },
      ],
    });
    const fixture = TestBed.createComponent(Invites);
    fixture.detectChanges();
    return fixture;
  }

  function root(fixture: ComponentFixture<Invites>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function cards(fixture: ComponentFixture<Invites>): HTMLLIElement[] {
    return Array.from(root(fixture).querySelectorAll<HTMLLIElement>('li.invite-card'));
  }

  function boxes(fixture: ComponentFixture<Invites>): HTMLTextAreaElement[] {
    return Array.from(root(fixture).querySelectorAll<HTMLTextAreaElement>('textarea.invite-text'));
  }

  function clickButton(fixture: ComponentFixture<Invites>, text: string): void {
    const button = Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.includes(text),
    );
    expect(button).toBeTruthy();
    button!.click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    account = signal<Account | null>(ACCOUNT);
    baseUrl = signal('https://example.social');
    isAuthenticated = true;
    isAnonymous = false;
  });

  it('starts with two Twitter-specific choices and simple defaults', () => {
    const fixture = setUp();
    expect(cards(fixture)).toHaveLength(2);
    expect(boxes(fixture).every((box) => box.value.includes(JOIN_MASTODON_URL))).toBe(true);
    expect(boxes(fixture).some((box) => box.value.includes(ACCOUNT.url))).toBe(true);
  });

  it('restores the original Twitter choices and keeps touch grass in advanced mode', () => {
    const fixture = setUp();
    clickButton(fixture, 'Advanced');
    expect(cards(fixture)).toHaveLength(11);
    expect(root(fixture).textContent).toContain('Real talk: touch grass');
  });

  it('rotates a new visible invitation to the top when shuffled', () => {
    const fixture = setUp();
    const first = cards(fixture)[0].querySelector('h2')!.textContent;
    const second = cards(fixture)[1].querySelector('h2')!.textContent;

    clickButton(fixture, 'Shuffle');

    expect(cards(fixture)[0].querySelector('h2')!.textContent).toBe(second);
    expect(cards(fixture).map((card) => card.querySelector('h2')!.textContent)).toContain(first);
  });

  it('uses a distinct Bluesky deck', () => {
    const fixture = setUp();
    const twitterText = boxes(fixture)
      .map((box) => box.value)
      .join('\n');
    clickButton(fixture, 'Bluesky');
    const blueskyText = boxes(fixture)
      .map((box) => box.value)
      .join('\n');

    expect(cards(fixture)).toHaveLength(2);
    expect(blueskyText).not.toBe(twitterText);
    expect(root(fixture).textContent).toContain('already understand why open networks matter');
  });

  it('shows four Mastodon rally choices in simple mode and ten in advanced', () => {
    const fixture = setUp();
    clickButton(fixture, 'Mastodon rally');

    expect(cards(fixture)).toHaveLength(4);
    expect(boxes(fixture).every((box) => box.value.includes('/invites?example.social'))).toBe(true);
    expect(boxes(fixture).every((box) => !box.value.includes(JOIN_MASTODON_URL))).toBe(true);
    for (const link of root(fixture).querySelectorAll<HTMLAnchorElement>('.invite-card a.btn')) {
      expect(link.href).toContain('https://example.social/share?text=');
    }

    clickButton(fixture, 'Advanced');
    expect(cards(fixture)).toHaveLength(10);
  });

  it('uses the Anonymous API server and offers login without requiring it', () => {
    isAuthenticated = true;
    isAnonymous = true;
    account.set(null);
    baseUrl.set('https://hachyderm.io');
    const fixture = setUp();

    expect(root(fixture).textContent).toContain('Anonymous on hachyderm.io');
    expect(root(fixture).textContent).toContain('/invites?hachyderm.io');
    expect(cards(fixture)).toHaveLength(2);
  });

  it('can promote the Anonymous server public homepage in advanced mode', () => {
    isAuthenticated = true;
    isAnonymous = true;
    account.set(null);
    baseUrl.set('https://mstdn.social');
    const fixture = setUp();
    clickButton(fixture, 'Advanced');

    const select = root(fixture).querySelector<HTMLSelectElement>('#promotion-target')!;
    select.value = 'home-server';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(boxes(fixture).every((box) => box.value.includes('https://mstdn.social'))).toBe(true);
  });

  it('sends an edit to only the selected platform composer', () => {
    const fixture = setUp();
    clickButton(fixture, 'Bluesky');
    const box = boxes(fixture)[0];
    box.value = 'my Bluesky-specific invitation';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const link = cards(fixture)[0].querySelector<HTMLAnchorElement>('a.btn')!;
    expect(link.href).toContain('https://bsky.app/intent/compose');
    expect(link.href).toContain('text=my+Bluesky-specific+invitation');
  });

  it('copies exactly what the selected card shows', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = setUp();
    const shown = boxes(fixture)[0].value;

    cards(fixture)[0].querySelector<HTMLButtonElement>('button.btn')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith(shown);
    expect(cards(fixture)[0].textContent).toContain('✓ Copied');
  });
});
