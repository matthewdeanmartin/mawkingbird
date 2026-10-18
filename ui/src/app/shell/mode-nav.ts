import { AppMode } from '../app-mode';

// i18n shell.modeNav.rss.reader: Reader
// i18n shell.modeNav.rss.readLater: Read later
// i18n shell.modeNav.rss.library: Library
// i18n shell.modeNav.rss.kits: Starter kits
// i18n shell.modeNav.rss.manage: Manage feeds
// i18n shell.modeNav.video.fedi: Fedi videos
// i18n shell.modeNav.video.youtube: YouTube
// i18n shell.modeNav.video.queue: Queue
// i18n shell.modeNav.video.search: Search
// i18n shell.modeNav.video.saved: Saved
// i18n shell.modeNav.mode.mastodon: Mastodon
// i18n shell.modeNav.mode.rss: RSS
// i18n shell.modeNav.mode.video: Video
// i18n shell.modeNav.switchAria: Switch app — now in {{mode}}
// i18n shell.modeNav.menu: Apps

/**
 * One tab of a mode's primary nav, as data rather than markup.
 *
 * Kept declarative so the rule that matters most — an icon means one thing in
 * the whole app (spec/top_level_menu.md, rule 3) — can be checked by a test
 * instead of by eye. Every icon is a single path `d`, circles included.
 */
export interface ModeNavItem {
  id: string;
  labelKey: string;
  icon: string;
  link: string;
  queryParams?: Record<string, string>;
  /** Whether the tab is the current page, given the router URL. */
  active: (url: string) => boolean;
  /** `signedIn`: hidden for Anonymous. `chat`: signed in, or a local chat peer. */
  requires?: 'signedIn' | 'chat';
  /** The menu indicator that lights this tab's activity dot (signed in only). */
  activity?: 'ordinary' | 'chat';
}

function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

function onPath(prefix: string): (url: string) => boolean {
  return (url) => {
    const path = pathOf(url);
    return path === prefix || path.startsWith(`${prefix}/`);
  };
}

function param(url: string, name: string): string | null {
  const query = url.split('#', 1)[0].split('?')[1] ?? '';
  return new URLSearchParams(query).get(name);
}

/** Home is not here: it is the fixed first slot of every mode (rule 1). */
export const MODE_NAV: Record<AppMode, readonly ModeNavItem[]> = {
  mastodon: [
    {
      id: 'algo',
      labelKey: 'shell.nav.algo',
      icon: 'M11 4l1.8 4.7L17.5 10.5l-4.7 1.8L11 17l-1.8-4.7L4.5 10.5l4.7-1.8zM18.5 14l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z',
      link: '/algo',
      active: onPath('/algo'),
    },
    {
      id: 'inbox',
      labelKey: 'shell.nav.inbox',
      icon: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9.5 21h5',
      link: '/notifications',
      active: onPath('/notifications'),
      requires: 'signedIn',
      activity: 'ordinary',
    },
    {
      id: 'chat',
      labelKey: 'shell.nav.chat',
      icon: 'M4 5h16v12H8l-4 4z',
      link: '/conversations',
      active: onPath('/conversations'),
      requires: 'chat',
      activity: 'chat',
    },
    {
      id: 'search',
      labelKey: 'shell.nav.search',
      icon: 'M4 10.5a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M15.5 15.5l5 5',
      link: '/search',
      active: onPath('/search'),
    },
    {
      id: 'feeds',
      labelKey: 'shell.nav.feeds',
      icon: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
      link: '/feeds',
      active: onPath('/feeds'),
    },
  ],
  rss: [
    {
      id: 'reader',
      labelKey: 'shell.modeNav.rss.reader',
      icon: 'M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM16 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3',
      link: '/rss',
      active: (url) =>
        onPath('/rss')(url) && param(url, 'view') !== 'kits' && param(url, 'filter') !== 'starred',
    },
    {
      // The RSS page's own name for its starred list (see rss-page.html): "Read
      // later", not "Starred". The URL keeps the internal id.
      id: 'readLater',
      labelKey: 'shell.modeNav.rss.readLater',
      icon: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
      link: '/rss',
      queryParams: { filter: 'starred' },
      active: (url) =>
        onPath('/rss')(url) && param(url, 'filter') === 'starred' && param(url, 'view') !== 'kits',
    },
    {
      // The Reader library (Bookmarks → Read Later), named apart from the list above.
      id: 'library',
      labelKey: 'shell.modeNav.rss.library',
      icon: 'M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3zM21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z',
      link: '/bookmarks',
      queryParams: { tab: 'read-later' },
      active: (url) => pathOf(url) === '/bookmarks' && param(url, 'tab') === 'read-later',
    },
    {
      id: 'kits',
      labelKey: 'shell.modeNav.rss.kits',
      icon: 'M3 8l9-4 9 4-9 4zM3 8v8l9 4 9-4V8M12 12v8',
      link: '/rss',
      queryParams: { view: 'kits' },
      active: (url) => onPath('/rss')(url) && param(url, 'view') === 'kits',
    },
    {
      id: 'manage',
      labelKey: 'shell.modeNav.rss.manage',
      icon: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
      link: '/settings/rss',
      active: onPath('/settings/rss'),
    },
  ],
  video: [
    {
      id: 'fedi',
      labelKey: 'shell.modeNav.video.fedi',
      icon: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
      link: '/videos/fedi',
      active: onPath('/videos/fedi'),
    },
    {
      id: 'youtube',
      labelKey: 'shell.modeNav.video.youtube',
      icon: 'M3 6h18v12H3zM10 9.5v5l4-2.5z',
      link: '/videos',
      active: (url) => pathOf(url) === '/videos',
    },
    {
      id: 'queue',
      labelKey: 'shell.modeNav.video.queue',
      icon: 'M4 6h11M4 12h11M4 18h7M17 14v6l5-3z',
      link: '/videos/queue',
      active: onPath('/videos/queue'),
    },
    {
      // Slot 4, where Search is in Mastodon, so the magnifier stays put across
      // modes. Its own glyph (a play mark inside) because it is its own search.
      id: 'search',
      labelKey: 'shell.modeNav.video.search',
      icon: 'M4 10.5a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M15.5 15.5l5 5M9.2 8.2v4.6l3.8-2.3z',
      link: '/videos/search',
      active: onPath('/videos/search'),
    },
    {
      id: 'saved',
      labelKey: 'shell.modeNav.video.saved',
      icon: 'M6 3h12v18l-6-4-6 4zM10 7.5v5l4-2.5z',
      link: '/bookmarks',
      queryParams: { view: 'video' },
      active: (url) => pathOf(url) === '/bookmarks' && param(url, 'view') === 'video',
    },
  ],
};

/** A mode as the switcher offers it: where it lands, and how it looks. */
export interface ModeEntry {
  mode: AppMode;
  labelKey: string;
  icon: string;
  link: string;
}

export const MODE_ENTRIES: Record<AppMode, ModeEntry> = {
  mastodon: {
    mode: 'mastodon',
    labelKey: 'shell.modeNav.mode.mastodon',
    icon: 'M9.5 5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M2.5 19a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M16.5 19a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M10.8 7.2 6.2 16.8M13.2 7.2l4.6 9.6M7.5 19h9',
    link: '/home',
  },
  rss: {
    mode: 'rss',
    labelKey: 'shell.modeNav.mode.rss',
    icon: 'M4 4a16 16 0 0 1 16 16M4 4v6a10 10 0 0 1 10 10h6A16 16 0 0 0 4 4ZM4.5 17.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    link: '/rss',
  },
  video: {
    mode: 'video',
    labelKey: 'shell.modeNav.mode.video',
    icon: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M10 8.5v7l5.5-3.5z',
    link: '/videos',
  },
};

/**
 * The mode the switcher's face offers: RSS from Mastodon (it takes the slot
 * the RSS tab had), Mastodon from anywhere else.
 */
export function suggestedMode(current: AppMode): AppMode {
  return current === 'mastodon' ? 'rss' : 'mastodon';
}
