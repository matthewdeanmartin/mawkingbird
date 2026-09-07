import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../../api';
import { Auth } from '../../../auth';
import { Server } from '../../../server';
import { TrustLevel, TrustedAccounts } from '../../../trusted-accounts';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Content warnings and sensitive media: the two account-wide switches, plus the
 * list of people they are already off for.
 *
 * The flipside of "Muted & Blocked", and deliberately its neighbour in the nav:
 * one page is the accounts you want less of, this is the accounts you want
 * without friction.
 *
 * Everything here is client-side and scoped to the signed-in Mastodon account
 * (see {@link TrustedAccounts}) — Mastodon has no server-side notion of a
 * trusted reader, and these need to work anonymously too.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.content.title: 🙈 Trust: CW/Sensitive
// i18n settings.content.intro: A content warning is the author's judgement about their audience, not about you. For people you read all the time, clicking through the same warning every day is friction without safety — so you can switch it off, either for everyone or for specific people.
// i18n settings.content.flipside.before: This is the flipside of
// i18n settings.content.flipside.link: Muted & Blocked
// i18n settings.content.flipside.after: : that page is for accounts you want less of, this one is for accounts you want without a doorway in front of them.
// i18n settings.content.howFar: How far trust goes
// i18n settings.content.howFar.hint: One choice, so there is never a question of which setting wins. Whoever this covers, their content warnings open on their own and their sensitive media renders unblurred.
// i18n settings.content.level.none: Trust no one
// i18n settings.content.level.none.note: Every warning and blur stays in place, including for accounts on the list below.
// i18n settings.content.level.individuals: Trust individual people
// i18n settings.content.level.individuals.note: Only the accounts you have named, listed further down. This is the default.
// i18n settings.content.level.follows: Trust everyone I follow
// i18n settings.content.level.follows.note: Including people you follow in future — this is checked as you read, not copied into a list, so it keeps up on its own. Boosts are still judged by whoever originally wrote them.
// i18n settings.content.level.followsBoosts: Trust everyone I follow, and what they boost
// i18n settings.content.level.followsBoosts.note: The widest setting. A boost from someone you follow opens the warning on the boosted post too, even though you may not follow — or know — whoever wrote it.
// i18n settings.content.keptNote: Nobody is added to your list by this. Your named accounts below are kept exactly as they are, so switching back to "individual people" finds them still there.
// i18n settings.content.everyone: Everyone
// i18n settings.content.everyone.hint: Applies to every post from every account, on this Mastodon account only. Stored in this browser — it is a reading preference, not something the server knows about.
// i18n settings.content.expandCw: Auto-expand content warnings
// i18n settings.content.expandCw.note: Posts with a content warning render already open. The warning text is still shown above the post, so you always know one was set.
// i18n settings.content.showSensitive: Auto-show sensitive media
// i18n settings.content.showSensitive.note: Images and video flagged sensitive render without the blur.
// i18n settings.content.revokedNote: These two are off while trust is revoked. Choose another level above to use them.
// i18n settings.content.onServer: On your server
// i18n settings.content.onServer.before: Your Mastodon account has its own "always expand content warnings" preference, which other apps read. It is currently
// i18n settings.content.on: on
// i18n settings.content.off: off
// i18n settings.content.onServer.after: . Mawkingbird can read it but not change it — Mastodon has no API for that, so it can only be set from your server's own settings page.
// i18n settings.content.changeThere: Change it there
// i18n settings.content.independent: The switches above are what Mawkingbird itself obeys, and are independent of it.
// i18n settings.content.trusted: Trusted accounts
// i18n settings.content.trusted.before: People whose warnings and sensitive flags are ignored, whatever the switches above are set to. Add someone from the
// i18n settings.content.trusted.after: menu on their profile.
// i18n settings.content.trusted.empty: Nobody yet. Trusting an account is useful for someone whose posts are routinely warned but never something you need warning about.
// i18n settings.content.stopTrusting: Stop trusting
// i18n settings.content.stopTrustingAll: Stop trusting everyone ({{count}})
// i18n settings.content.revoke: Revoke everything
// i18n settings.content.revoke.hint: Drops to "trust no one", turns both switches off, and forgets every account you have trusted. Unlike the choices above, this one throws the list away — there is no undo.
// i18n settings.content.revokeAll: Revoke all trust
// i18n settings.content.footnote: Trust never overrides a filter. A word filter you set, or a post your server chose to hide, stays hidden — those are your rules and the server's, and one person being trusted is not a reason to break them.
@Component({
  selector: 'app-settings-content',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './settings-content.html',
  styleUrl: './settings-content.css',
})
export class SettingsContent {
  protected trusted = inject(TrustedAccounts);
  private api = inject(Api);
  private auth = inject(Auth);
  private server = inject(Server);

  /**
   * Your server's own "always expand content warnings" setting.
   *
   * Read-only, and not for want of trying: Mastodon exposes
   * `reading:expand:spoilers` through `GET /api/v1/preferences`, but has no API
   * to write it — it is settable only from the instance's own web Preferences
   * page, behind a session cookie. So this row reports the value and links out,
   * rather than pretending to a switch that could not save.
   *
   * `null` while loading, unknown, or not applicable (anonymous / Bluesky).
   */
  protected serverExpandsCw = signal<boolean | null>(null);

  /** Deep link to the page that *can* change it, on the viewer's own instance. */
  protected serverPrefsUrl = computed(() => {
    const base = this.server.baseUrl();
    if (!base) {
      return null;
    }
    try {
      return `${new URL(base).origin}/settings/preferences/other`;
    } catch {
      return null;
    }
  });

  protected showsServerRow = computed(() => !this.auth.isAnonymous && !this.auth.isBlueskyPrimary);

  constructor() {
    if (this.showsServerRow()) {
      this.api.preferences().subscribe({
        next: (prefs) => this.serverExpandsCw.set(prefs['reading:expand:spoilers'] === true),
        // An instance that does not serve preferences just leaves the row out,
        // which is better than an error for something purely informational.
        error: () => this.serverExpandsCw.set(null),
      });
    }
  }

  protected setLevel(level: TrustLevel): void {
    this.trusted.setLevel(level);
  }

  protected toggleCw(): void {
    this.trusted.setExpandAllCw(!this.trusted.expandAllCwSetting());
  }

  protected toggleSensitive(): void {
    this.trusted.setShowAllSensitive(!this.trusted.showAllSensitiveSetting());
  }

  protected untrust(key: string): void {
    this.trusted.untrust(key);
  }

  protected clearAll(): void {
    this.trusted.clearAll();
  }

  /**
   * Global revocation. Confirmed first: unlike every other control here it
   * throws the named list away, and there is no undo.
   */
  protected revokeAll(): void {
    const count = this.trusted.count();
    const detail = count
      ? `This turns off every trust setting and forgets all ${count} trusted account${count === 1 ? '' : 's'}.`
      : 'This turns off every trust setting.';
    if (confirm(`${detail}\n\nThere is no undo. Continue?`)) {
      this.trusted.revokeAll();
    }
  }
}
