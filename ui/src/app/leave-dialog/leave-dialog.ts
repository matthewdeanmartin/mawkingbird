import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Auth } from '../auth';
import { SessionTeardown } from '../session-teardown';
import { FocusTrap } from '../a11y/focus-trap';
import { PageDiagnostics } from '../page-diagnostics';

/** What the user chose on the way out. */
export type LeaveChoice = 'leave' | 'anonymous-data' | 'all-data';

/**
 * "Are you sure?" for leaving — and, more to the point, an offer to take your data
 * with you.
 *
 * Logging out used to be immediate and total in the wrong direction: it cleared the
 * token and left every follow, list, muted word and subscribed hashtag sitting in
 * `localStorage` for whoever used the machine next. Someone reading Mastodon on an
 * office desktop clicked "Log out", believed that was the end of it, and was wrong.
 * So the exit asks, and offers to clean up.
 *
 * Three outs, and the ordering is the argument:
 *
 *  1. **Leave, keep everything** — the default and the safe one.
 *  2. **Delete anonymous data** — emphasised, because it is what most people asking
 *     for this actually want: the read-only session gone, saved accounts untouched.
 *  3. **Remove everything** — accounts and tokens included.
 *
 * Both destructive paths offer an export *first*. The person who most wants a clean
 * machine is also the person who most wants their follow list to survive the trip,
 * and making them choose between the two would push them toward keeping the data.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n leaveDialog.close: Close
// i18n leaveDialog.leaveAnonymous: Leave Anonymous?
// i18n leaveDialog.logOutOf: Log out of {{who}}?
// i18n leaveDialog.whoAnonymous: Anonymous
// i18n leaveDialog.whoThisAccount: this account
// i18n leaveDialog.returnToLogin: Return to the login page
// i18n leaveDialog.stayAnonymous: Your follows, lists and settings stay in this browser.
// i18n leaveDialog.stayBluesky: Your Bluesky account stays saved in this browser, so signing back in is one click.
// i18n leaveDialog.stayDefault: Your saved accounts and settings stay in this browser.
// i18n leaveDialog.deleteAnonymousThenLeave: Delete anonymous data, then leave
// i18n leaveDialog.deleteAnonymousDetail: Follows, local lists, saved posts and followed hashtags from browsing without an account. Any signed-in accounts you have saved are kept.
// i18n leaveDialog.removeAllThenLeave: Remove all browser data, then leave
// i18n leaveDialog.removeAllDetailBluesky: Your saved Bluesky sign-in, plus every other saved account, connection and setting. Your Bluesky account itself is untouched — but you'll need your app password to return. This can't be undone.
// i18n leaveDialog.removeAllDetailDefault: Everything above, plus every saved account, connection and setting. This can't be undone.
// i18n leaveDialog.backupDownloaded: Backup downloaded
// i18n leaveDialog.downloadFirst: Download my data first
// i18n leaveDialog.cancel: Cancel
// i18n leaveDialog.backupNote: The backup holds your follows, lists, saved posts and settings. It never includes passwords or access tokens — you will sign in again on a new browser.
// i18n leaveDialog.backupError: Couldn't build a backup file. You can still leave.
@Component({
  selector: 'app-leave-dialog',
  imports: [FocusTrap, TranslocoPipe],
  templateUrl: './leave-dialog.html',
  styleUrl: './leave-dialog.css',
})
export class LeaveDialog {
  private auth = inject(Auth);
  private teardown = inject(SessionTeardown);
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);

  readonly closed = output<void>();
  /** Emitted once the teardown has run; the shell owns the navigation and reload. */
  readonly chose = output<LeaveChoice>();

  /** Overridden in tests; real callers let it read `Auth`. */
  readonly anonymous = input<boolean | null>(null);

  /** Overridden in tests; real callers let it read `Auth`. */
  readonly bluesky = input<boolean | null>(null);

  protected exported = signal(false);
  protected exportError = signal<string | null>(null);

  protected isAnonymous = computed(() => this.anonymous() ?? this.auth.isAnonymous);

  /**
   * A Bluesky-primary identity is the third variant.
   *
   * It needs its own copy for one specific reason: the middle option erases the
   * *anonymous* session's keys and nothing else, so offering "delete anonymous
   * data" to someone signed in with Bluesky describes data they do not have,
   * next to a button that sounds like it deletes theirs. Their real choices are
   * leave (identity kept, per `leaveActive`) or remove everything.
   */
  protected isBluesky = computed(() => this.bluesky() ?? this.auth.isBlueskyPrimary);

  protected who = computed(() => {
    if (this.isAnonymous()) {
      return this.transloco.translate<string>('leaveDialog.whoAnonymous');
    }
    const account = this.auth.account();
    return account?.username
      ? `@${account.username}`
      : this.transloco.translate<string>('leaveDialog.whoThisAccount');
  });

  /**
   * Download a backup of everything the wipe is about to destroy.
   *
   * Uses `SessionTeardown.backup`, **not** `exportPortableConfig`: the latter builds
   * a shareable *setup* (theme, server, proxy) and contains none of the eight
   * anonymous keys, so it would have promised a rescue while saving nothing the user
   * was worried about losing. See the comment on `backup()`.
   *
   * Scope `'all'` regardless of which button they eventually press: this is offered
   * before the choice is made, and a backup wider than the deletion costs nothing
   * while a narrower one loses data. Credentials are excluded either way.
   */
  protected downloadBackup(): void {
    try {
      const config = this.teardown.backup('all');
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mawkingbird-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.exported.set(true);
      this.exportError.set(null);
    } catch (error: unknown) {
      this.diagnostics.error('Leave', 'backup:error', error);
      // Never block the exit on a failed backup: the user asked to leave.
      this.exportError.set(this.transloco.translate<string>('leaveDialog.backupError'));
    }
  }

  protected leave(): void {
    this.chose.emit('leave');
  }

  protected deleteAnonymous(): void {
    this.teardown.clearAnonymousData();
    this.chose.emit('anonymous-data');
  }

  protected deleteEverything(): void {
    this.teardown.clearAllData();
    this.chose.emit('all-data');
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
