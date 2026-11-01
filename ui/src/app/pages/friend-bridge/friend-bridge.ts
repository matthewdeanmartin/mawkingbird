import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { BridgeNetwork } from '../settings/import-export/bridge-matching';
import { FriendBridgeWorkbench } from './friend-bridge-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';
import { originalPath, toolPageAt } from '../../focused-tools';

/** The network names a direction reads from and searches on. */
export interface BridgeCopy {
  source: BridgeNetwork;
  from: string;
  to: string;
  /** This page's own path, for the sign-in return and the Invite tab. */
  root: string;
}

const COPY: Record<BridgeNetwork, Omit<BridgeCopy, 'root'>> = {
  bluesky: { source: 'bluesky', from: 'Bluesky', to: 'Mastodon' },
  mastodon: { source: 'mastodon', from: 'Mastodon', to: 'Bluesky' },
};

/**
 * The bridge finder as a focused mini-app, at two URLs: /bluesky-to-mastodon
 * reads your Bluesky follows and finds them on Mastodon, /mastodon-to-bluesky
 * the reverse. One page, because the finder is one engine either way round.
 *
 * The direction comes from the route's path rather than route data, so the
 * signed-in twin, the public page and the prerender all agree without each
 * having to pass it along.
 */
@Component({
  selector: 'app-friend-bridge',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class FriendBridge {
  protected readonly route = inject(ActivatedRoute);
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = this.route.snapshot.data['inShell'] === true;
  protected readonly copy: BridgeCopy = {
    ...COPY[bridgeSourceOf(this.route)],
    root: `/${toolPageAt(stepPaths(this.route))?.path ?? 'bluesky-to-mastodon'}`,
  };
  protected readonly returnHere = { next: this.copy.root };
}

/** The paths of a route's steps, root first. */
function stepPaths(route: ActivatedRoute): string[] {
  return (route.snapshot?.pathFromRoot ?? []).map((step) => step.routeConfig?.path ?? '');
}

/**
 * Bluesky is read unless the page is a version, in any language, of
 * /mastodon-to-bluesky (the registry knows which English page it translates).
 */
export function bridgeSourceOf(route: ActivatedRoute): BridgeNetwork {
  const page = toolPageAt(stepPaths(route));
  return page && originalPath(page) === 'mastodon-to-bluesky' ? 'mastodon' : 'bluesky';
}

/**
 * The German pages (focused-tools.json `lang: "de"`), both directions: the
 * same finder, German words, and everything translated inside it pinned to
 * German (see page-language.ts).
 */
@Component({
  selector: 'app-friend-bridge-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeDe extends FriendBridge {}

/** The Japanese pages, both directions; see FriendBridgeDe. */
@Component({
  selector: 'app-friend-bridge-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeJa extends FriendBridge {}

/** The French pages, both directions; see FriendBridgeDe. */
@Component({
  selector: 'app-friend-bridge-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeFr extends FriendBridge {}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-friend-bridge-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeEs extends FriendBridge {}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-friend-bridge-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeZhHant extends FriendBridge {}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-friend-bridge-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeKo extends FriendBridge {}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-friend-bridge-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgePt extends FriendBridge {}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-friend-bridge-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeIt extends FriendBridge {}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-friend-bridge-pl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgePl extends FriendBridge {}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-friend-bridge-uk',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.uk.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeUk extends FriendBridge {}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-friend-bridge-hi',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.hi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeHi extends FriendBridge {}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-friend-bridge-nl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.nl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeNl extends FriendBridge {}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-friend-bridge-id',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.id.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeId extends FriendBridge {}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-friend-bridge-ru',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.ru.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeRu extends FriendBridge {}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-friend-bridge-sv',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.sv.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeSv extends FriendBridge {}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-friend-bridge-vi',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.vi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class FriendBridgeVi extends FriendBridge {}
