import { AppMode } from '../app-mode';
import { FOCUSED_TOOLS } from '../focused-tools';

// i18n shell.modeNav.rss.reader: Read
// i18n shell.modeNav.rss.readLater: Later
// i18n shell.modeNav.rss.library: Shelf
// i18n shell.modeNav.rss.kits: Kits
// i18n shell.modeNav.rss.manage: Manage
// i18n shell.modeNav.video.fedi: Posts
// i18n shell.modeNav.video.youtube: YouTube
// i18n shell.modeNav.video.queue: Queue
// i18n shell.modeNav.video.search: Search
// i18n shell.modeNav.video.saved: Saved
// i18n shell.modeNav.mode.mastodon: Fedi
// i18n shell.modeNav.mode.rss: RSS
// i18n shell.modeNav.mode.video: Video
// i18n shell.modeNav.mode.radio: Radio
// i18n shell.modeNav.radio.player: Radio
// i18n shell.modeNav.radio.studio: Studio
// i18n shell.modeNav.radio.playlist: Playlist
// i18n shell.modeNav.radio.settings: Settings
// i18n shell.modeNav.mode.forum: Forum
// i18n shell.modeNav.forum.talk: Talk
// i18n shell.modeNav.forum.asked: Asked
// i18n shell.modeNav.forum.friends: Friends
// i18n shell.modeNav.forum.mine: Mine
// i18n shell.modeNav.forum.joined: Joined
// i18n shell.modeNav.switchAria: Switch app — now in {{mode}}
// i18n shell.modeNav.menu: Apps
// i18n shell.modeNav.twitterImport.import: Import
// i18n shell.modeNav.crosspost.post: Crosspost
// i18n shell.modeNav.analytics.view: Analytics
// i18n shell.modeNav.githubFriends.find: Find friends
// i18n shell.modeNav.schedule.plan: Schedule
// i18n shell.modeNav.bridge.find: Find
// i18n shell.modeNav.boosts.off: Boosts
// i18n shell.modeNav.contacts.find: Contacts
// i18n shell.modeNav.friendFeeds.find: Feeds
// i18n shell.modeNav.amnesty.run: Amnesty
// i18n shell.modeNav.pseudonymity.check: Privacy
// i18n shell.modeNav.handles.find: Handles
// i18n shell.modeNav.focused.invite: Invite

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
  radio: [
    {
      id: 'playlist',
      labelKey: 'shell.modeNav.radio.playlist',
      icon: 'M4 5h13M4 10h13M4 15h7M16 14v7M12.5 17.5h7',
      link: '/radio',
      queryParams: { view: 'search' },
      active: (url) =>
        pathOf(url) === '/radio' && !['radio', 'settings'].includes(param(url, 'view') ?? ''),
    },
    {
      id: 'player',
      labelKey: 'shell.modeNav.radio.player',
      icon: 'M5 12a7 7 0 0 1 14 0M5 12v7H3v-7zM19 12v7h2v-7z',
      link: '/radio',
      queryParams: { view: 'radio' },
      active: (url) => pathOf(url) === '/radio' && param(url, 'view') === 'radio',
    },
    {
      id: 'studio',
      labelKey: 'shell.modeNav.radio.studio',
      icon: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM6 11v1a6 6 0 0 0 12 0v-1M12 18v4M8 22h8',
      link: '/radio/studio',
      active: onPath('/radio/studio'),
    },
    {
      id: 'settings',
      labelKey: 'shell.modeNav.radio.settings',
      icon: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
      link: '/radio',
      queryParams: { view: 'settings' },
      active: (url) => pathOf(url) === '/radio' && param(url, 'view') === 'settings',
    },
  ],
  forum: [
    // The tabs are the filters (spec/forum.md): one list, five cuts of it.
    {
      id: 'talk',
      labelKey: 'shell.modeNav.forum.talk',
      icon: 'M3 4h12v9H8l-4 3v-3H3zM17 8h4v9h-1v3l-3-3h-6v-2',
      link: '/forum',
      active: (url) => pathOf(url) === '/forum' && (param(url, 'filter') ?? 'talk') === 'talk',
    },
    {
      id: 'asked',
      labelKey: 'shell.modeNav.forum.asked',
      icon: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
      link: '/forum',
      queryParams: { filter: 'asked' },
      active: (url) => pathOf(url) === '/forum' && param(url, 'filter') === 'asked',
    },
    {
      id: 'friends',
      labelKey: 'shell.modeNav.forum.friends',
      icon: 'M5 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M2 20a6 6 0 0 1 12 0M14 5a3 3 0 1 1 3 6M16 14a6 6 0 0 1 6 6',
      link: '/forum',
      queryParams: { filter: 'friends' },
      active: (url) => pathOf(url) === '/forum' && param(url, 'filter') === 'friends',
    },
    {
      id: 'mine',
      labelKey: 'shell.modeNav.forum.mine',
      icon: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
      link: '/forum',
      queryParams: { filter: 'mine' },
      active: (url) => pathOf(url) === '/forum' && param(url, 'filter') === 'mine',
      requires: 'signedIn',
    },
    {
      id: 'joined',
      labelKey: 'shell.modeNav.forum.joined',
      icon: 'M10 6L5 11l5 5M5 11h9a5 5 0 0 1 5 5v3',
      link: '/forum',
      queryParams: { filter: 'joined' },
      active: (url) => pathOf(url) === '/forum' && param(url, 'filter') === 'joined',
      requires: 'signedIn',
    },
  ],
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

/**
 * A focused mini-app: a single task given the shell, its account menu and its
 * … menu, but only its own tabs after Home and no mode switcher or rails.
 * Not an {@link AppMode}: nothing switches into one; a URL is inside it or not.
 */
export interface FocusedApp {
  id: string;
  /** Every URL at or below this path belongs to the mini-app. */
  root: string;
  items: readonly ModeNavItem[];
}

/** Every mini-app ends in the same Invite tab, so it is one meaning with one glyph. */
const INVITE_ICON = 'M3 6h18v12H3zM3 6l9 7 9-7';

/** A mini-app's own tool tab at its root, then Invite at `root/invite`. */
function focusedApp(
  id: string,
  root: string,
  tool: Pick<ModeNavItem, 'id' | 'labelKey' | 'icon'>,
): FocusedApp {
  return {
    id,
    root,
    items: [
      { ...tool, link: root, active: (url) => pathOf(url).replace(/\/$/, '') === root },
      {
        id: 'invite',
        labelKey: 'shell.modeNav.focused.invite',
        icon: INVITE_ICON,
        link: `${root}/invite`,
        active: onPath(`${root}/invite`),
      },
    ],
  };
}

/**
 * The mini-apps: public entry pages for one task each (spec in ui/docs/seo.md),
 * from the shared tool registry. Their roots are also the only pages a sign-in
 * may return to. Tab labels are translated, so each `labelKey` is declared with
 * the other nav strings at the top of this file.
 */
export const FOCUSED_APPS: readonly FocusedApp[] = FOCUSED_TOOLS.map((tool) =>
  focusedApp(tool.id, `/${tool.path}`, tool.tab),
);

/** The mini-app a URL belongs to, or null for the ordinary app. */
export function focusedAppFor(url: string): FocusedApp | null {
  return FOCUSED_APPS.find((app) => onPath(app.root)(url)) ?? null;
}

/** A mode as the switcher offers it: where it lands, and how it looks. */
export interface ModeEntry {
  mode: AppMode;
  labelKey: string;
  icon: string;
  link: string;
}

export const MODE_ENTRIES: Record<AppMode, ModeEntry> = {
  radio: {
    mode: 'radio',
    labelKey: 'shell.modeNav.mode.radio',
    icon: 'M4 8h16v13H4zM6 8l12-5M7 15a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 12h1M16 16h1',
    link: '/radio',
  },
  forum: {
    mode: 'forum',
    labelKey: 'shell.modeNav.mode.forum',
    icon: 'M4 4h16v12H9l-5 4zM8 8h8M8 12h5',
    link: '/forum',
  },
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
