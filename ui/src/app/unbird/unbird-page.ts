import { Component, computed, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbNavigation, MbNavLink } from '../design-system/navigation/navigation';
import { MbPageHeader } from '../design-system/page-header/page-header';
import { Auth } from '../platform/session/auth';
import { UnbirdArchiveTools } from './unbird-archive-tools';
import { UnbirdDrop } from './unbird-drop';
import { UnbirdMatcher } from './unbird-matcher';
import { UnbirdPeople } from './unbird-people';
import { UnbirdPosts } from './unbird-posts';
import { UnbirdProfile } from './unbird-profile';
import { UnbirdImportPoints } from './unbird-import-points';
import { UnbirdServers } from './unbird-servers';

// i18n unbird.page.title: Unbird
// i18n unbird.page.lead: Bring your Twitter life to Mastodon. Your archive is read on this device.
// i18n unbird.page.peopleTitle: Your people
// i18n unbird.page.tile.people: Find your people
// i18n unbird.page.tile.peopleBody: {{found}} found so far, closest first.
// i18n unbird.page.tile.archive: Explore your archive
// i18n unbird.page.tile.archiveBody: Search your tweets and likes, see your numbers, save it as a website.
// i18n unbird.page.needArchive: Start with your Twitter archive: drop it here.
// i18n unbird.page.archiveTitle: Your archive
// i18n unbird.page.postsTitle: Your tweets, on Mastodon
// i18n unbird.page.profileTitle: Your profile
// i18n unbird.page.next: What next

export type UnbirdTab = 'start' | 'people' | 'posts' | 'archive' | 'profile';

/**
 * The Unbird mode's pages inside the app. The tab comes from route data, so
 * each tab has its own URL without a component per tab.
 */
@Component({
  selector: 'app-unbird-page',
  imports: [
    MbNavigation,
    MbNavLink,
    MbPageHeader,
    RouterLink,
    TranslocoPipe,
    UnbirdArchiveTools,
    UnbirdDrop,
    UnbirdImportPoints,
    UnbirdPeople,
    UnbirdPosts,
    UnbirdProfile,
    UnbirdServers,
  ],
  templateUrl: './unbird-page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './unbird-page.css',
})
export class UnbirdPage implements OnInit {
  protected readonly matcher = inject(UnbirdMatcher);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly tab = (inject(ActivatedRoute).snapshot.data['unbirdTab'] ??
    'start') as UnbirdTab;

  protected readonly titleKey = {
    start: 'unbird.page.title',
    people: 'unbird.page.peopleTitle',
    posts: 'unbird.page.postsTitle',
    archive: 'unbird.page.archiveTitle',
    profile: 'unbird.page.profileTitle',
  }[this.tab];

  /** Follow needs a Mastodon account; everyone else searches publicly. */
  protected readonly via = computed(() =>
    !this.auth.lacksMastodonToken && !this.auth.isAnonymous ? 'account' : 'public',
  );

  ngOnInit(): void {
    void this.matcher.restore();
  }

  protected loaded(): void {
    void this.matcher.search(this.via());
    if (this.tab === 'start') void this.router.navigateByUrl('/unbird/people');
  }
}
