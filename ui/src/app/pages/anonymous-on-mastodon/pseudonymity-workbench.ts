import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../api';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbNotice } from '../../design-system/notice/notice';
import { Account } from '../../models';
import { Pseudonymity } from '../../pseudonymity';
import { Server } from '../../server';
import { FocusedNextSteps, toolInviteLink } from '../focused-apps/focused-next-steps';

// The switches' words, by key (pseudonymity-plan.ts keeps the English for specs).
// i18n focusedTools.privacy.switch.hide_collections.label: Hide who you follow and who follows you
// i18n focusedTools.privacy.switch.hide_collections.why: The people around an account are often the quickest way to work out who runs it.
// i18n focusedTools.privacy.switch.discoverable.label: Leave the profile directory and follow suggestions
// i18n focusedTools.privacy.switch.discoverable.why: Your profile stops being recommended to strangers and listed in the directory.
// i18n focusedTools.privacy.switch.indexable.label: Keep your posts out of full-text search
// i18n focusedTools.privacy.switch.indexable.why: People cannot find your public posts by searching for words in them. Hashtags still work.
// i18n focusedTools.privacy.switch.locked.label: Approve every new follower yourself (optional)
// i18n focusedTools.privacy.switch.locked.why: Followers-only posts reach only people you let in. It also slows down who can follow you.
// i18n focusedTools.privacy.loadFailed: Your account settings couldn't be loaded from your server. Reload the page to try again.
// i18n focusedTools.privacy.loading: Reading your account settings…
// i18n focusedTools.privacy.serverTitle: 1. Your settings on your Mastodon server
// i18n focusedTools.privacy.noSwitches: Your server doesn't report any of these settings, so there is nothing to change here.
// i18n focusedTools.privacy.alreadySet: Already set.
// i18n focusedTools.privacy.saving: Saving…
// i18n focusedTools.privacy.nothing: Nothing to apply
// i18n focusedTools.privacy.apply.one: Apply {{count}} change
// i18n focusedTools.privacy.apply.other: Apply {{count}} changes
// i18n focusedTools.privacy.refused: Your server kept its own value for:
// i18n focusedTools.privacy.refusedAfter: Check them on your server's settings page.
// i18n focusedTools.privacy.saved: Saved. Your server confirmed every change.
// i18n focusedTools.privacy.manualTitle: 2. What only you can change
// i18n focusedTools.privacy.indexed: Search engines may list your profile.
// i18n focusedTools.privacy.indexedHow: Mastodon only lets you change this on your server's own website: turn on the search engine opt-out on its
// i18n focusedTools.privacy.privacyPage: Privacy and reach page
// i18n focusedTools.privacy.notIndexed: Search engines are asked not to list your profile.
// i18n focusedTools.privacy.linksTo: Your profile links to:
// i18n focusedTools.privacy.verified: (verified, so it proves the same person runs both)
// i18n focusedTools.privacy.removeLinks: Remove any that lead back to your real name from your
// i18n focusedTools.privacy.profile: profile
// i18n focusedTools.privacy.noLinks: No profile links that point to another site.
// i18n focusedTools.privacy.nameTitle: Your name, picture and bio.
// i18n focusedTools.privacy.nameBody: Use a name and picture you don't use anywhere else, and leave out your town, school and employer.
// i18n focusedTools.privacy.moreTitle: 3. Mawkingbird keeps you even more incognito
// i18n focusedTools.privacy.moreIntro: Your server's settings stop at your profile. Mawkingbird adds more, in this browser:
// i18n focusedTools.privacy.extra.follows: Private follows
// i18n focusedTools.privacy.extra.followsBody: read someone's posts without following them, so they are never notified.
// i18n focusedTools.privacy.extra.likes: Private likes
// i18n focusedTools.privacy.extra.likesBody: save a post you liked without telling anyone.
// i18n focusedTools.privacy.extra.lists: Private lists
// i18n focusedTools.privacy.extra.listsBody: group accounts to read, kept only in this browser.
// i18n focusedTools.privacy.extra.links: Clean links
// i18n focusedTools.privacy.extra.linksBody: tracking parameters are removed from links you post.
// i18n focusedTools.privacy.extra.photos: Clean photos
// i18n focusedTools.privacy.extra.photosBody: JPEG and PNG photos are re-encoded in this browser, dropping location and camera details, before upload.
// i18n focusedTools.privacy.extra.reminder: A reminder before posting
// i18n focusedTools.privacy.extra.reminderBody: , so you never post from the wrong account.
// i18n focusedTools.privacy.modeOn: Pseudonymity mode is on for this account.
// i18n focusedTools.privacy.modeOnBody: Private follows, likes and lists are in your
// i18n focusedTools.privacy.modeSettings: pseudonymity settings
// i18n focusedTools.privacy.turnOn: Turn on pseudonymity mode
// i18n focusedTools.privacy.modeFailed: This browser couldn't save the setting. Free some storage and try again.
// i18n focusedTools.privacy.error.unreachable: Couldn't reach your server. Nothing was changed.
// i18n focusedTools.privacy.error.refused: Your server didn't accept the change. Nothing was changed.
import {
  ServerSwitch,
  ServerSwitchKey,
  fieldText,
  initialSelection,
  isSet,
  offeredSwitches,
  revealingFields,
} from './pseudonymity-plan';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { routeLanguage } from '../../page-language';

/**
 * The signed-in body of /how-to-be-anonymous-on-mastodon.
 *
 * First the account's own settings on its server, as a checklist with the
 * pseudonymous choice pre-ticked, written in one `update_credentials` and then
 * checked against what the server sent back. Then what no API can change for
 * the person: search-engine indexing (a server web setting) and profile links
 * that point at a real identity. Last, Mawkingbird's own browser-side
 * pseudonymity mode, offered once the server half is done.
 */
@Component({
  selector: 'app-pseudonymity-workbench',
  imports: [
    TranslocoPipe,
    FocusedNextSteps,
    FormsModule,
    MbButton,
    MbCheckbox,
    MbNotice,
    RouterLink,
  ],
  templateUrl: './pseudonymity-workbench.html',
  styleUrl: '../focused-apps/focused-page.css',
  styles: `
    .switches {
      display: grid;
      gap: 14px;
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
    }
    .switches p,
    .checks p {
      margin: 4px 0 0 28px;
      color: var(--muted);
      line-height: 1.5;
    }
    .done {
      color: var(--muted);
    }
    .checks {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .checks p {
      margin-left: 0;
    }
    .extras {
      margin: 0 0 16px;
      padding-left: 20px;
      line-height: 1.6;
    }
    mb-notice {
      display: block;
      margin-top: 12px;
    }
  `,
})
export class PseudonymityWorkbench {
  protected readonly invite = toolInviteLink();
  private readonly i18n = inject(TranslocoService);
  private readonly lang = routeLanguage();
  private readonly api = inject(Api);
  private readonly server = inject(Server);
  private readonly pseudonymity = inject(Pseudonymity);

  protected readonly account = signal<Account | null>(null);
  protected readonly loadError = signal(false);
  protected readonly selected = signal<ReadonlySet<ServerSwitchKey>>(new Set());
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Switches sent but reported back unchanged: the server kept its own value. */
  protected readonly refused = signal<ServerSwitch[]>([]);
  /** Set once the server half has been applied in this visit. */
  protected readonly applied = signal(false);
  protected readonly modeOn = signal(this.pseudonymity.enabled());
  protected readonly modeError = signal(false);

  protected readonly switches = computed(() => {
    const account = this.account();
    return account ? offeredSwitches(account) : [];
  });

  protected readonly remaining = computed(() => {
    const account = this.account();
    return account ? this.switches().filter((entry) => !isSet(account, entry)) : [];
  });

  /** Nothing left on the server worth asking about: go straight to the rest. */
  protected readonly serverDone = computed(
    () =>
      this.applied() || (!!this.account() && this.remaining().every((entry) => !entry.recommended)),
  );

  protected readonly fields = computed(() => {
    const account = this.account();
    return account ? revealingFields(account) : [];
  });

  /** Where the server's own "Privacy and reach" settings live (search engines). */
  protected readonly privacyPage = computed(() => `${this.server.baseUrl()}/settings/privacy`);

  protected readonly fieldText = fieldText;
  protected readonly isSet = isSet;

  constructor() {
    this.api.verifyCredentials().subscribe({
      next: (account) => {
        this.account.set(account);
        this.selected.set(initialSelection(account));
      },
      error: () => this.loadError.set(true),
    });
  }

  protected toggle(key: ServerSwitchKey, on: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** One request for every ticked switch, then trust only what came back. */
  protected apply(): void {
    const chosen = this.switches().filter((entry) => this.selected().has(entry.key));
    if (!chosen.length || this.saving()) return;
    const form = new FormData();
    for (const entry of chosen) form.append(entry.key, String(entry.want));
    this.saving.set(true);
    this.saveError.set(null);
    this.api.updateCredentials(form).subscribe({
      next: (account) => {
        this.account.set(account);
        this.refused.set(chosen.filter((entry) => !isSet(account, entry)));
        this.selected.set(new Set());
        this.saving.set(false);
        this.applied.set(true);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(
          describe(error, (key) => this.i18n.translate<string>(key, {}, this.lang)),
        );
      },
    });
  }

  /** Mawkingbird's browser-side mode, with link cleaning and photo metadata removal. */
  protected turnOnMode(): void {
    this.modeError.set(false);
    try {
      this.pseudonymity.setEnabled(true);
      this.pseudonymity.setCleanLinks(true);
      this.pseudonymity.setCleanMedia(true);
    } catch {
      // Storage full or blocked: the settings page explains the same failure.
    }
    // Read it back rather than assume: a write with no account scope is a
    // silent no-op, and saying "on" when it is not is the one wrong answer here.
    const on = this.pseudonymity.enabled();
    this.modeOn.set(on);
    this.modeError.set(!on);
  }
}

function describe(error: unknown, t: (key: string) => string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = String(error.error?.error ?? '').trim();
    if (detail) return detail;
    if (error.status === 0) return t('focusedTools.privacy.error.unreachable');
  }
  return t('focusedTools.privacy.error.refused');
}
