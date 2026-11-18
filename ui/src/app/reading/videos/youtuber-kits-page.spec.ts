import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YoutuberKitsPage } from './youtuber-kits-page';
import { YoutuberKits, YoutuberPack } from './youtuber-kits';
import { VideoSubscriptions } from './video-subscriptions';
import { ImportFollows, ImportRow } from '../../accounts/import-follows';
import { FollowButton } from '../../accounts/follow-button/follow-button';
import { Auth } from '../../platform/session/auth';
import { Account } from '../../platform/api/models';

@Component({ selector: 'app-follow-button', template: '' })
class FollowStub {
  readonly accountId = input('');
  readonly handle = input('');
  readonly foreign = input<Account | null>(null);
}

const member = (n: string, bot = false) => ({
  acct: `${n}@x.example`,
  url: `https://x.example/@${n}`,
  displayName: n.toUpperCase(),
  avatar: 'https://x.example/a.png',
  bot,
  languages: ['en'],
  lastPost: '2026-11-10',
  bio: '',
  videos: [],
  channel: {
    id: 'UC' + n.repeat(22).slice(0, 22),
    title: `${n} channel`,
    lastUpload: '2026-11-01',
  },
});
const tech: YoutuberPack = {
  category: 'technology',
  title: { en: 'Technology', de: 'Technologie' },
  icon: '💻',
  members: [member('ann'), member('ben'), member('bot', true)],
  slug: 'technology',
  path: 'youtubers-on-mastodon/technology',
};
const music: YoutuberPack = {
  category: 'music',
  title: { en: 'Music' },
  icon: '🎵',
  members: [member('cat')],
  slug: 'music',
  path: 'youtubers-on-mastodon/music',
};

describe('YoutuberKitsPage', () => {
  let fixture: ComponentFixture<YoutuberKitsPage>;
  afterEach(() => fixture?.destroy());

  function mount(options: {
    query?: Record<string, string>;
    languages?: Record<string, number>;
    kind?: string;
  }) {
    const feeds = signal<{ id: string; title: string; enabled: boolean }[]>([]);
    const subs = {
      feeds,
      add: vi.fn((id: string, title: string) =>
        feeds.update((f) => [...f, { id, title, enabled: true }]),
      ),
      remove: vi.fn((id: string) => feeds.update((f) => f.filter((x) => x.id !== id))),
    };
    const rows = signal<ImportRow[]>([]);
    const importer = {
      rows,
      running: signal(false),
      reset: vi.fn(() => rows.set([])),
      load: vi.fn((handles: string[]) =>
        rows.set(handles.map((handle) => ({ handle, status: 'pending' as const }))),
      ),
      start: vi.fn(async () =>
        rows.update((r) => r.map((row) => ({ ...row, status: 'followed' as const }))),
      ),
      stop: vi.fn(),
    };
    const kits = {
      languages: () => (options.languages === undefined ? { en: 2, de: 1 } : options.languages),
      packs: vi.fn(async (lang: string) =>
        lang === 'en' ? [tech, music] : [{ ...tech, members: [member('dan')] }],
      ),
      wantedLanguages: () => ['en'],
    };
    TestBed.configureTestingModule({
      imports: [YoutuberKitsPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: new BehaviorSubject(convertToParamMap(options.query ?? {})) },
        },
        { provide: YoutuberKits, useValue: kits },
        { provide: VideoSubscriptions, useValue: subs },
        { provide: ImportFollows, useValue: importer },
        { provide: Auth, useValue: { kind: signal(options.kind ?? 'mastodon') } },
      ],
    });
    TestBed.overrideComponent(YoutuberKitsPage, {
      remove: { imports: [FollowButton] },
      add: { imports: [FollowStub] },
    });
    fixture = TestBed.createComponent(YoutuberKitsPage);
    fixture.detectChanges();
    return { subs, importer, kits };
  }

  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }
  };
  const text = () => fixture.nativeElement.textContent as string;
  const button = (label: string) =>
    [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLElement) => b.textContent?.trim() === label,
    ) as HTMLButtonElement | undefined;

  it('lists the reader’s kits with counts, linking each open', async () => {
    mount({});
    await settle();
    const links = [...fixture.nativeElement.querySelectorAll('.kits a')] as HTMLAnchorElement[];
    expect(links.map((a) => a.querySelector('.kit-name')?.textContent?.trim())).toEqual([
      'Technology',
      'Music',
    ]);
    expect(links[0].textContent).toContain('3 creators');
    expect(links[0].getAttribute('href')).toContain('kit=technology');
    expect(fixture.nativeElement.querySelector('select')).not.toBeNull();
  });

  it('opens a kit: creators and their channels, with Subscribe and Follow per row', async () => {
    mount({ query: { kit: 'technology' } });
    await settle();
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain('Technology');
    const rows = fixture.nativeElement.querySelectorAll('.members li');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('ann channel');
    expect(rows[0].querySelector('a').getAttribute('href')).toContain('/videos/channel/UC');
    expect(rows[2].textContent).toContain('Video feed');
    const follow = fixture.debugElement.query((el) => el.name === 'app-follow-button')
      .componentInstance as FollowStub;
    expect(follow.foreign()).toMatchObject({ acct: 'ann@x.example', username: 'ann' });
  });

  it('subscribes to every channel, follows every account, or both', async () => {
    const { subs, importer } = mount({ query: { kit: 'technology' } });
    await settle();
    button('Subscribe to all')!.click();
    fixture.detectChanges();
    expect(subs.add).toHaveBeenCalledTimes(3);
    expect(text()).toContain('Subscribed to 3 channels.');
    // Already subscribed: nothing is added twice.
    button('Subscribe to all')!.click();
    expect(subs.add).toHaveBeenCalledTimes(3);

    button('Follow all')!.click();
    await settle();
    expect(importer.load).toHaveBeenCalledWith(['ann@x.example', 'ben@x.example', 'bot@x.example']);
    expect(importer.start).toHaveBeenCalled();
    expect(text()).toContain('Followed 3 of 3.');

    subs.add.mockClear();
    button('Do both')!.click();
    await settle();
    expect(importer.start).toHaveBeenCalledTimes(2);
  });

  it('offers subscribing but not following without a Mastodon session', async () => {
    mount({ query: { kit: 'technology' }, kind: 'bluesky' });
    await settle();
    expect(button('Subscribe to all')).toBeDefined();
    expect(button('Follow all')).toBeUndefined();
    expect(text()).toContain('Following creators needs a Mastodon account');
  });

  it('switches language through the URL and shows that language’s kits', async () => {
    const { kits } = mount({ query: { lang: 'de' } });
    await settle();
    expect(kits.packs).toHaveBeenCalledWith('de');
    expect(fixture.nativeElement.querySelector('.kit-name').textContent).toContain('Technologie');
  });

  it('says so when no kits are bundled yet', async () => {
    mount({ languages: {} });
    await settle();
    expect(text()).toContain('No creator kits yet');
  });
});
