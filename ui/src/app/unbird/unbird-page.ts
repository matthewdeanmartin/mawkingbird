import { Component, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../platform/session/auth';
import { UnbirdArchiveTools } from './unbird-archive-tools';
import { UnbirdDrop } from './unbird-drop';
import { FIRST_PASS, UnbirdMatcher } from './unbird-matcher';
import { UnbirdPeople } from './unbird-people';
import { UnbirdServers } from './unbird-servers';

// i18n unbird.page.title: Unbird
// i18n unbird.page.lead: Bring your Twitter life to Mastodon. Your archive is read on this device.
// i18n unbird.page.peopleTitle: Your people
// i18n unbird.page.tile.people: Find your people
// i18n unbird.page.tile.peopleBody: {{found}} found so far, closest first.
// i18n unbird.page.tile.archive: Explore your archive
// i18n unbird.page.tile.archiveBody: Search your tweets and likes, see your numbers, save it as a website.
// i18n unbird.page.needArchive: Start with your archive, and your people show up here.
// i18n unbird.page.archiveTitle: Your archive

export type UnbirdTab = 'start' | 'people' | 'archive';

/**
 * The Unbird mode's pages inside the app. The tab comes from route data, so
 * each tab has its own URL without a component per tab.
 */
@Component({
  selector: 'app-unbird-page',
  imports: [RouterLink, TranslocoPipe, UnbirdArchiveTools, UnbirdDrop, UnbirdPeople, UnbirdServers],
  templateUrl: './unbird-page.html',
  styleUrl: './unbird-page.css',
})
export class UnbirdPage implements OnInit {
  protected readonly matcher = inject(UnbirdMatcher);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly tab = (inject(ActivatedRoute).snapshot.data['unbirdTab'] ??
    'start') as UnbirdTab;

  /** Follow needs a Mastodon account; everyone else searches publicly. */
  protected readonly via = computed(() =>
    !this.auth.lacksMastodonToken && !this.auth.isAnonymous ? 'account' : 'public',
  );

  ngOnInit(): void {
    void this.matcher.restore().then((archive) => {
      // Back from sign-up with nothing searched yet: start, so the page is not empty.
      if (archive && this.tab === 'people' && this.matcher.searched() === 0) {
        void this.matcher.search(this.via(), FIRST_PASS);
      }
    });
  }

  protected loaded(): void {
    void this.matcher.search(this.via(), FIRST_PASS);
    if (this.tab === 'start') void this.router.navigateByUrl('/unbird/people');
  }
}
