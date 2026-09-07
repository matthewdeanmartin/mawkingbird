import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StarterPackTextPipe } from '../../starter-pack-text';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { ImportFollows } from '../../import-follows';
import { Account } from '../../models';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { anonymousAccountRouteRef } from '../../providers/anonymous/anonymous-route-ref';
import { starterKit, StarterAccount, starterKitText } from '../../starter-collection';
import { UiLocale } from '../../i18n/locale';

// i18n starterCollection.heading: A timeline in one click
// i18n starterCollection.followingProgress: Following… {{completed}}/{{total}}
// i18n starterCollection.followed.one: Followed {{count}} account
// i18n starterCollection.followed.other: Followed {{count}} accounts
// i18n starterCollection.followAll: Follow all {{count}}
// i18n starterCollection.membersAria: {{title}} accounts
// i18n starterCollection.opening: Opening…
// i18n starterCollection.lookingUp: Looking up…
// i18n starterCollection.followingRow: Following…
// i18n starterCollection.followingDone: Following ✓
// i18n starterCollection.notFound: Not found
// i18n starterCollection.couldNotFollow: Could not follow
// i18n starterCollection.note: Anonymous follows use the collection’s built-in account snapshot immediately. Signed-in follows are resolved by your server before the real follow request is sent.
// i18n starterCollection.findFriends: Find friends another way
// i18n starterCollection.unavailable: This starter kit is no longer available. Browse the current kits to find people to follow.
// i18n starterCollection.browse: Browse starter kits
@Component({
  selector: 'app-starter-collection',
  imports: [RouterLink, StarterPackTextPipe],
  templateUrl: './starter-collection.html',
  styleUrl: './starter-collection.css',
})
export class StarterCollection implements OnInit {
  protected importer = inject(ImportFollows);
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymousPublic = inject(AnonymousPublicApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected kit = starterKit(this.route.snapshot.paramMap.get('slug') ?? 'starter');
  protected copyLanguage =
    this.kit?.lang ??
    /^catalog-([a-z]{2,3})-/.exec(this.route.snapshot.paramMap.get('slug') ?? '')?.[1];
  protected accounts = this.kit?.accounts ?? [];
  private locale = inject(UiLocale);
  protected text = computed(() =>
    this.kit ? starterKitText(this.kit, this.locale.active()) : { title: '', blurb: '' },
  );
  protected opening = signal<string | null>(null);
  protected completed = computed(
    () =>
      this.importer
        .rows()
        .filter((row) => !['pending', 'resolving', 'following'].includes(row.status)).length,
  );
  protected followed = computed(
    () => this.importer.rows().filter((row) => row.status === 'followed').length,
  );

  ngOnInit(): void {
    this.importer.reset();
    if (this.auth.isAnonymous) {
      this.importer.loadResolved(this.accounts);
    } else {
      this.importer.load(this.accounts.map((account) => account.handle));
    }
  }

  followAll(): void {
    void this.importer.start();
  }

  status(handle: string): string {
    return this.importer.rows().find((row) => row.handle === handle)?.status ?? 'pending';
  }

  async openAccount(item: StarterAccount): Promise<void> {
    if (this.opening()) return;
    this.opening.set(item.handle);
    try {
      const resolved = this.importer.rows().find((row) => row.handle === item.handle)?.account;
      const account =
        resolved ?? (this.auth.isAnonymous ? item.account : await this.resolveAccount(item.handle));
      if (!account) return;
      if (this.auth.isAnonymous) {
        const server = this.serverFor(item.handle);
        await this.router.navigate([
          '/accounts',
          anonymousAccountRouteRef({
            server,
            id: account.id,
            ...(account.url ? { originalUrl: account.url } : {}),
          }),
        ]);
      } else {
        await this.router.navigate(['/accounts', account.id]);
      }
    } catch {
      // Leave the row usable so a transient lookup failure can be retried.
    } finally {
      this.opening.set(null);
    }
  }

  private async resolveAccount(handle: string): Promise<Account | null> {
    const username = handle.split('@')[0];
    const results = this.auth.isAnonymous
      ? await firstValueFrom(
          this.anonymousPublic.search(this.serverFor(handle), username, 'accounts'),
        )
      : await firstValueFrom(this.api.search(handle, 'accounts', { resolve: true, limit: 5 }));
    const normalized = handle.toLowerCase();
    return (
      results.accounts.find(
        (account) =>
          account.acct.toLowerCase() === normalized ||
          account.username.toLowerCase() === username.toLowerCase(),
      ) ??
      results.accounts[0] ??
      null
    );
  }

  private serverFor(handle: string): string {
    const host = handle.split('@').at(-1);
    return `https://${host}`;
  }
}
