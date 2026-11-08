import { Route } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routes, TOOL_PAGE_MODULES, toolPageLoader } from './app.routes';
import { anonymousUnavailableGuard } from './providers/anonymous/anonymous-route.guard';
import {
  TRANSLATED_PATHS,
  TranslatedLanguage,
  languageFolder,
  toolLanguage,
} from './focused-tools';
import { ToolsIndex } from './pages/tools/tools-index';
import { FRONT_PAGE_TAGLINE, TOOLS_INDEXES } from './seo';
import { FOCUSED_TOOLS } from './focused-tools-all';

/**
 * The guarded shell — the `''` route that has children, as distinct from the
 * public entry dispatcher, which also sits at `''` but is `pathMatch: 'full'`
 * and has none. Matching on `children` rather than on the path is what keeps
 * this helper pointed at the shell now that two routes share the empty path.
 */
function shellRoute(): Route | undefined {
  return routes.find((route) => route.path === '' && !!route.children);
}

function shellChild(path: string): Route | undefined {
  return shellRoute()?.children?.find((route) => route.path === path);
}

describe('application routes', () => {
  it('keeps the front door destination indexable under the root canonical', () => {
    expect(shellChild('home')?.data).toEqual({
      seoIndexable: true,
      seoCanonicalPath: '/',
      seoTagline: FRONT_PAGE_TAGLINE,
    });
  });
  it('provides a shareable Anonymous entry route', () => {
    expect(routes.find((route) => route.path === 'anonymous')?.loadComponent).toBeDefined();
  });

  /**
   * The front door. Two routes share the empty path — the entry dispatcher and
   * the guarded shell — and the order plus `pathMatch: 'full'` is the only thing
   * keeping them apart. Get it wrong and either strangers hit the auth guard
   * again or every in-app route stops resolving.
   */
  describe('the public front door', () => {
    const frontRoute = (): Route | undefined =>
      routes.find((route) => route.path === '' && !route.children);

    it('serves an unguarded dispatcher at the root', () => {
      const front = frontRoute();

      expect(front?.loadComponent).toBeDefined();
      expect(front?.canActivate).toBeUndefined();
    });

    /**
     * `/` decides where to send people; it never renders a destination itself.
     * A title would appear in the tab and in history for a route nobody stays
     * on — which is what the standalone pitch page it replaced got wrong.
     */
    it('carries no title, because nothing is displayed there', () => {
      expect(frontRoute()?.title).toBeUndefined();
    });

    it('matches the root exactly, so it cannot swallow every in-app route', () => {
      expect(frontRoute()?.pathMatch).toBe('full');
    });

    it('is declared before the guarded shell, or the guard would win at /', () => {
      const frontIndex = routes.findIndex((route) => route.path === '' && !route.children);
      const shellIndex = routes.findIndex((route) => route.path === '' && !!route.children);

      expect(frontIndex).toBeGreaterThanOrEqual(0);
      expect(shellIndex).toBeGreaterThan(frontIndex);
    });

    /**
     * `**` goes to Home, not `/`. Harmless either way today — the dispatcher
     * would forward a signed-in user straight back — but it keeps a mistyped
     * URL from bouncing through the front door, and it is one less path along
     * which a future change to `/` could reach an already-signed-in user.
     */
    it('sends unknown URLs to Home rather than through the front door', () => {
      expect(routes.find((route) => route.path === '**')?.redirectTo).toBe('home');
    });
  });

  /**
   * `/login` is both the chooser and the Mastodon OAuth callback address: the
   * flow registers `<base href>login` with the remote instance as its
   * `redirect_uri`, and instances validate the callback against exactly what was
   * registered. So the route cannot move, and it must match `full` so
   * `/login/mastodon` reaches its own page instead of the chooser.
   */
  describe('the login doors', () => {
    it('keeps the chooser at /login, matched exactly', () => {
      const chooser = routes.find((route) => route.path === 'login');

      expect(chooser?.loadComponent).toBeDefined();
      expect(chooser?.pathMatch).toBe('full');
      expect(chooser?.canActivate).toBeUndefined();
    });

    it('gives each network its own unguarded page', () => {
      for (const path of ['login/mastodon', 'login/bluesky']) {
        const route = routes.find((r) => r.path === path);
        expect(route?.loadComponent).toBeDefined();
        expect(route?.canActivate).toBeUndefined();
      }
    });
  });

  it('gives the public invitation builder its own guarded instance of the standard shell', () => {
    const inviteRoute = routes.find((route) => route.path === 'invites');

    expect(inviteRoute?.loadComponent).toBeDefined();
    expect(inviteRoute?.canActivate).toHaveLength(1);
    expect(inviteRoute?.children?.find((child) => child.path === '')?.loadComponent).toBeDefined();
    expect(shellChild('invites')).toBeUndefined();
  });

  it('keeps both current and legacy message links available to Anonymous', () => {
    expect(routes.find((route) => route.path === 'message/:id')?.canActivate).toBeUndefined();
    expect(routes.find((route) => route.path === 'message')?.canActivate).toBeUndefined();
  });

  it('keeps public hashtag timelines available to Anonymous', () => {
    const tagRoute = shellChild('tags/:tag');

    expect(tagRoute).toBeDefined();
    expect(tagRoute?.canActivate).toBeUndefined();
  });

  it('keeps observability available to Anonymous', () => {
    expect(shellChild('observability')?.canActivate).toBeUndefined();
  });

  it('keeps storage diagnostics available to Anonymous', () => {
    // It reports this browser's own storage, which an anonymous reader has as
    // much of as anyone — and is the one page that can explain a full disk.
    const route = shellChild('storage-diagnostics');
    expect(route).toBeDefined();
    expect(route?.canActivate).toBeUndefined();
  });

  it('guards pastebin routes behind the pastebin feature flag', () => {
    const route = shellChild('pastes');

    expect(route?.data?.['featureFlag']).toBe('pastebin');
    expect(route?.canActivate).toHaveLength(1);
  });

  it('keeps interaction-only routes guarded from Anonymous', () => {
    // Anonymous is refused first; everyone else is sent on to the Likes view.
    const guards = shellChild('favourites')?.canActivate;
    expect(guards).toHaveLength(2);
    expect(guards?.[0]).toBe(anonymousUnavailableGuard);
  });

  it('guards the writing workspace behind the write feature flag', () => {
    const route = shellChild('write');

    expect(route?.data?.['featureFlag']).toBe('write');
    expect(route?.canActivate).toHaveLength(1);
  });

  it('leaves the writing workspace open to Anonymous, who have local drafts too', () => {
    // The flag guard is the only guard: an anonymous visitor's drafts and notes
    // are browser-local, so the whole page works without a server identity.
    expect(shellChild('write')?.canActivate).toHaveLength(1);
    expect(shellChild('drafts')?.canActivate).toBeUndefined();
  });

  it('runs the Twitter importer in the shell for Mastodon accounts and alone for everyone else', () => {
    const twins = routes.filter((route) => route.path === 'twitter-to-mastodon');
    expect(twins).toHaveLength(2);
    const [signedIn, publicPage] = twins;
    // The shell instance is chosen by canMatch, so a signed-out search visitor
    // falls through to the public page instead of being redirected away.
    expect(signedIn.canMatch).toHaveLength(1);
    expect(signedIn.children?.map((child) => child.path)).toEqual(['', 'invite']);
    expect(publicPage.canMatch).toBeUndefined();
    expect(publicPage.data?.['seoIndexable']).toBe(true);
    expect(routes.find((route) => route.path === 'twitter-to-mastodon/invite')?.redirectTo).toBe(
      'twitter-to-mastodon',
    );
    expect(routes.indexOf(signedIn)).toBeLessThan(routes.indexOf(shellRoute()!));
  });

  it('gives every focused mini-app a shell twin, a public page and an Invite tab', () => {
    expect(FOCUSED_TOOLS.length).toBeGreaterThan(0);
    for (const { path } of FOCUSED_TOOLS) {
      const [inShell, publicPage] = routes.filter((route) => route.path === path);
      expect(inShell.canMatch, path).toHaveLength(1);
      expect(
        inShell.children?.map((child) => child.path),
        path,
      ).toEqual(['', 'invite']);
      expect(publicPage.data?.['seoIndexable'], path).toBe(true);
      expect(routes.find((route) => route.path === `${path}/invite`)?.redirectTo).toBe(path);
    }
  });

  it('gives every translated language an index at its folder, in that language', async () => {
    expect(Object.keys(TOOLS_INDEXES).sort()).toEqual(Object.keys(TRANSLATED_PATHS).sort());
    for (const lang of Object.keys(TOOLS_INDEXES)) {
      const index = routes.find(
        (route) => route.path === languageFolder(lang as TranslatedLanguage),
      );
      expect(index?.data?.['lang'], lang).toBe(lang);
      const component = await index!.loadComponent!();
      expect(component, `${lang} index component`).toBeTypeOf('function');
      expect(component, lang).not.toBe(ToolsIndex);
    }
  });

  it('loads each tool page in its own language: the original, or its subclass', async () => {
    for (const tool of FOCUSED_TOOLS) {
      const component = await toolPageLoader(tool)();
      expect(component, `${tool.path} has a page component`).toBeTypeOf('function');
      if (toolLanguage(tool) === 'en') continue;
      // Its language's own subclass, unless one class carries every language.
      const original = FOCUSED_TOOLS.find((entry) => entry.id === tool.translationOf)!;
      const english = await toolPageLoader(original)();
      if (TOOL_PAGE_MODULES[original.path].oneForAll) expect(component, tool.path).toBe(english);
      else expect(component, tool.path).not.toBe(english);
    }
  });
});
