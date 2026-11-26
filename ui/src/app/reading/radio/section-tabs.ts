import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbNavigation, MbNavLink } from '../../design-system/navigation/navigation';

// i18n singles.section: Singles
// i18n singles.tab.saved: Saved
// i18n singles.tab.find: Find
// i18n singles.tab.starter: Starter kits
// i18n playlists.tab.mine: My playlists
// i18n playlists.tab.find: Find playlists

/** Singles' saved recordings, open discovery, and podcast starter kits. */
@Component({
  selector: 'app-singles-tabs',
  imports: [RouterLink, TranslocoPipe, MbNavigation, MbNavLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <nav mbNavigation presentation="tabs" [label]="'singles.section' | transloco">
      <a mbNavLink routerLink="/singles" [current]="current() === 'saved'">{{
        'singles.tab.saved' | transloco
      }}</a>
      <a mbNavLink routerLink="/singles/find" [current]="current() === 'find'">{{
        'singles.tab.find' | transloco
      }}</a>
      <a mbNavLink routerLink="/singles/starter-kits" [current]="current() === 'starter'">{{
        'singles.tab.starter' | transloco
      }}</a>
    </nav>
  `,
})
export class SinglesTabs {
  readonly current = input<'saved' | 'find' | 'starter'>('saved');
}

/** Playlists' two places: yours, and finding other people's. */
@Component({
  selector: 'app-playlists-tabs',
  imports: [RouterLink, TranslocoPipe, MbNavigation, MbNavLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <nav mbNavigation presentation="tabs" [label]="'playlists.title' | transloco">
      <a mbNavLink routerLink="/playlists" [current]="current() === 'mine'">{{
        'playlists.tab.mine' | transloco
      }}</a>
      <a mbNavLink routerLink="/playlists/find" [current]="current() === 'find'">{{
        'playlists.tab.find' | transloco
      }}</a>
    </nav>
  `,
})
export class PlaylistsTabs {
  readonly current = input<'mine' | 'find'>('mine');
}
