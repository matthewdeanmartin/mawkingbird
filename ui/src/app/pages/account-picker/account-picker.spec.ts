import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSwitcher } from '../../account-switcher';
import { AccountChoice, Auth } from '../../auth';
import { translocoTesting } from '../../i18n/i18n.testing';
import { AccountPicker } from './account-picker';

function choice(key: string, username: string, server: string): AccountChoice {
  return {
    key,
    kind: 'mastodon',
    token: `${key}-token`,
    server,
    account: { id: key, username, acct: username, display_name: username, url: '' } as never,
  };
}

describe('AccountPicker', () => {
  const others = signal<AccountChoice[]>([]);
  const switcher = { switchTo: vi.fn() };

  beforeEach(() => {
    switcher.switchTo.mockReset();
    others.set([
      choice('a', 'everybodhi', 'https://mastodon.social'),
      choice('b', 'pythonjobs', 'https://fosstodon.org'),
      choice('c', 'artdad', 'https://mastodon.art'),
    ]);
    TestBed.configureTestingModule({
      imports: [AccountPicker, translocoTesting()],
      providers: [
        { provide: AccountSwitcher, useValue: switcher },
        {
          provide: Auth,
          useValue: {
            account: signal({ id: 'me', username: 'flyscifiguy', display_name: 'Matthew' }),
            otherSessions: computed(() => others()),
            isAnonymous: false,
            shouldOfferLogin: false,
          },
        },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(AccountPicker);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function search(fixture: ReturnType<typeof render>['fixture'], value: string) {
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return input;
  }

  it('lists every other saved account and marks the current one', () => {
    const { el } = render();
    expect(el.querySelector('.picker-current')?.textContent).toContain('@flyscifiguy');
    expect(el.querySelectorAll('.picker-row')).toHaveLength(3);
    expect(el.querySelector('.picker-row')?.textContent).toContain('mastodon.social');
  });

  it('narrows by server and switches through the shared switcher', () => {
    const { fixture, el } = render();
    search(fixture, 'fosstodon');
    const rows = el.querySelectorAll<HTMLButtonElement>('.picker-row');
    expect(rows).toHaveLength(1);
    rows[0].click();
    expect(switcher.switchTo).toHaveBeenCalledWith(others()[1]);
  });

  it('switches on Enter only when a single account is left', () => {
    const { fixture } = render();
    const input = search(fixture, 'mastodon');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(switcher.switchTo).not.toHaveBeenCalled();
    search(fixture, 'artdad').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(switcher.switchTo).toHaveBeenCalledWith(others()[2]);
  });

  it('says so when nothing matches', () => {
    const { fixture, el } = render();
    search(fixture, 'zzz');
    expect(el.querySelectorAll('.picker-row')).toHaveLength(0);
    expect(el.querySelector('.picker-empty')).not.toBeNull();
  });
});
