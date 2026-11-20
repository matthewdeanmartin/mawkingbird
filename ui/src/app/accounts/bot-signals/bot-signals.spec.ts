import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Account, Status } from '../../platform/api/models';
import { BotSignals } from './bot-signals';

const ME = { id: 'me', username: 'me', acct: 'me', bot: false } as Account;
const START = Date.parse('2026-11-01T00:00:00Z');

function postAt(minutes: number, i: number): Status {
  return {
    id: `p${i}`,
    created_at: new Date(START + minutes * 60_000).toISOString(),
    account: ME,
    reblog: null,
    in_reply_to_id: null,
  } as Status;
}

function render(account: Account, posts: Status[]) {
  const fixture = TestBed.createComponent(BotSignals);
  fixture.componentRef.setInput('account', account);
  fixture.componentRef.setInput('posts', posts);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('BotSignals', () => {
  it('shows the official bot setting', () => {
    expect(render({ ...ME, bot: true }, []).textContent).toContain('Bot');
  });

  it('labels a fixed daily schedule bot-like, with an explainer naming the interval', () => {
    const daily = Array.from({ length: 10 }, (_, i) => postAt(i * 1440, i));
    const root = render(ME, daily);
    expect(root.textContent).toContain('Bot-like');
    expect(root.querySelector('mb-help')?.textContent).toContain('every 1 d');
  });

  it('labels a scheduler mixed with live posting as partly scheduled', () => {
    const live = [0, 50, 400, 410, 1900, 2300, 4000, 4022, 5555, 7000].map(postAt);
    const scheduled = [0, 1, 2, 3].map((i) => postAt(100_000 + i * 60, 20 + i));
    expect(render(ME, [...live, ...scheduled]).textContent).toContain('Partly scheduled');
  });

  it('says nothing for human-looking posting or too few posts', () => {
    const live = [0, 50, 400, 410, 1900, 2300, 4000, 4022, 5555, 7000].map(postAt);
    expect(render(ME, live).textContent?.trim()).toBe('');
    expect(render(ME, live.slice(0, 3)).textContent?.trim()).toBe('');
  });
});
