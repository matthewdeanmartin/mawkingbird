import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { FollowTrust } from '../../accounts/follow-trust';
import {
  MENU_BUDGET,
  MenuMeasure,
  menuOptions,
  printMenuReport,
  overBudgetMessage,
} from '../../shell/menu-budget';
import { Account, MediaAttachment, Status } from '../../platform/api/models';
import { SpeechReader } from '../../reading/speech/speech-reader';
import { StatusCard } from './status-card';

/**
 * The post ••• menu stays scannable: every realistic worst case is rendered
 * and its options counted. A red result names the menu and lists its options;
 * move less-used ones into a dialog rather than raising the budget.
 */

const me = {
  id: 'me',
  username: 'me',
  acct: 'me',
  display_name: 'Me',
  url: 'https://home.example/@me',
} as Account;
const them = {
  id: 'them',
  username: 'zoe',
  acct: 'zoe@far.example',
  display_name: 'Zoe',
  url: 'https://far.example/@zoe',
} as Account;

const image: MediaAttachment = {
  id: 'm1',
  type: 'image',
  url: 'https://cdn.example/a.jpg',
  preview_url: 'https://cdn.example/a-small.jpg',
  description: 'A heron',
};
const audio: MediaAttachment = {
  ...image,
  id: 'm2',
  type: 'audio',
  url: 'https://cdn.example/a.mp3',
};

/** A busy public post: a hashtag, a code block, a picture and links to the original. */
function post(account: Account, overrides: Partial<Status> = {}): Status {
  return {
    id: '7',
    created_at: '2026-11-11T12:00:00Z',
    edited_at: null,
    content:
      '<p>Look <a href="https://home.example/tags/birds" class="mention hashtag">#<span>birds</span></a></p>' +
      '<pre><code>print("hi")</code></pre>',
    spoiler_text: '',
    visibility: 'public',
    url: 'https://far.example/@zoe/7',
    uri: 'https://far.example/users/zoe/statuses/7',
    account,
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
    media_attachments: [image],
    tags: [{ name: 'birds', url: 'https://home.example/tags/birds' }],
    ...overrides,
  } as Status;
}

const measured: MenuMeasure[] = [];

describe('post ••• menu budget', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(FollowTrust.prototype, 'isMutual').mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const auth = TestBed.inject(Auth);
    auth.kind.set('mastodon');
    auth.token.set('menu-budget-token');
    auth.setAccount(me);
    Object.defineProperty(TestBed.inject(SpeechReader), 'supported', { value: true });
  });

  afterAll(() => {
    // `npm run menu:sizes` shows this table; the assertions below are the gate.
    printMenuReport(measured);
  });

  function measure(scenario: string, status: Status): MenuMeasure {
    const fixture = TestBed.createComponent(StatusCard);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    const panels = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        '.danger-menu-panel, details.danger-menu > div',
      ),
    ];
    expect(panels.length).toBeGreaterThan(0);
    const options = menuOptions(panels[0]);
    const row = { menu: 'Post', scenario, options };
    measured.push(row);
    return row;
  }

  const scenarios: [string, () => Status][] = [
    ["someone else's post", () => post(them)],
    ["someone else's post with a recording", () => post(them, { media_attachments: [audio] })],
    ['your own post', () => post(me, { url: 'https://home.example/@me/7' })],
    [
      'your own post with a recording',
      () => post(me, { url: 'https://home.example/@me/7', media_attachments: [audio] }),
    ],
  ];

  it.each(scenarios)(`stays within ${MENU_BUDGET} options: %s`, (scenario, make) => {
    const row = measure(scenario, make());
    expect(row.options.length, overBudgetMessage(row)).toBeLessThanOrEqual(MENU_BUDGET);
  });
});
