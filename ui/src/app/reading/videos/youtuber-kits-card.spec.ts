import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { RAIL_KITS, YoutuberKitsCard } from './youtuber-kits-card';
import { YoutuberKits, YoutuberPack } from './youtuber-kits';

const pack = (category: string, size: number): YoutuberPack => ({
  category,
  title: { en: category },
  icon: '⭐',
  slug: category,
  path: `youtubers-on-mastodon/${category}`,
  members: Array.from({ length: size }, (_, i) => ({
    acct: `${category}${i}@x.example`,
    url: null,
    displayName: 'x',
    avatar: null,
    bot: false,
    languages: ['en'],
    lastPost: null,
    bio: '',
    videos: [],
    channel: { id: 'UC' + 'a'.repeat(22), title: 'c', lastUpload: null },
  })),
});

describe('YoutuberKitsCard', () => {
  let fixture: ComponentFixture<YoutuberKitsCard>;
  afterEach(() => fixture?.destroy());

  function mount(languages: Record<string, number> | null, packs: YoutuberPack[]) {
    TestBed.configureTestingModule({
      imports: [YoutuberKitsCard],
      providers: [
        provideRouter([]),
        {
          provide: YoutuberKits,
          useValue: {
            languages: () => languages ?? {},
            packs: async () => packs,
            wantedLanguages: () => ['en'],
          },
        },
      ],
    });
    fixture = TestBed.createComponent(YoutuberKitsCard);
    fixture.detectChanges();
  }
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };

  it('offers the biggest kits in the reader’s language, then all of them', async () => {
    mount(
      { en: 7 },
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((c, i) => pack(c, i + 1)),
    );
    await settle();
    const links = [...fixture.nativeElement.querySelectorAll('li a')] as HTMLAnchorElement[];
    expect(links).toHaveLength(RAIL_KITS);
    expect(links[0].textContent).toContain('g');
    expect(links[0].getAttribute('href')).toBe('/videos/starters?lang=en&kit=g');
    expect(fixture.nativeElement.querySelector('.more').textContent).toContain('All creator kits');
  });

  it('shows nothing when no kits are bundled', async () => {
    mount(null, []);
    await settle();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });
});
