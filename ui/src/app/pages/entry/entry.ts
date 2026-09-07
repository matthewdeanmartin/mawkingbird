import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { PreviewSeed, PREVIEW_SERVER } from '../../first-run/preview-seed';
import { probeServerAvailability } from '../../server-availability';
import { UnreachableServerDialog } from '../../unreachable-server-dialog/unreachable-server-dialog';

/**
 * Servers tried, in order, for the first-run preview.
 *
 * `mastodon.social` is blocked on some networks and a blocked front door is a
 * blank first impression, so the preview falls back rather than failing. The
 * picker stays off the front door entirely: a stranger cannot be expected to
 * have an opinion about which Mastodon server to read.
 */
const PREVIEW_SERVERS: readonly string[] = [
  PREVIEW_SERVER,
  'https://mas.to',
  'https://fosstodon.org',
];

/**
 * `/` — a router, not a page. It renders nothing of its own.
 *
 * This is the correction at the centre of sprint 2b. `/` used to be a marketing
 * landing page, which meant a stranger's first sight of a social media client
 * was a page that was not one. Now it reads existing state and dispatches:
 *
 * | arriving as | goes to |
 * |---|---|
 * | signed in (Mastodon or Bluesky) | `/home` |
 * | anonymous, already chosen | `/home`, no modal — the choice was durable |
 * | mid-preview (reloaded with the modal open) | `/home`, modal again |
 * | nobody at all | enter Anonymous, seed the preview, `/home` with the modal |
 *
 * Because a pitch is never rendered here, the worst failure of the old design —
 * showing marketing to a signed-in user, which reads as "the app logged me
 * out" — is not mitigated but structurally impossible.
 */
@Component({
  selector: 'app-entry',
  imports: [UnreachableServerDialog],
  template: `
    @if (unreachableServer(); as server) {
      <app-unreachable-server-dialog
        [attemptedServer]="server"
        (selected)="enterWith($event)"
        (cancelled)="giveUp()"
      />
    }
  `,
})
export class EntryPage implements OnInit {
  private auth = inject(Auth);
  private router = inject(Router);
  private server = inject(Server);
  private preview = inject(PreviewSeed);

  /**
   * The server to report as unreachable, or empty.
   *
   * Set only when the whole fallback chain failed — which is the case that used
   * to enter anyway and show a fail whale behind the welcome modal.
   */
  protected readonly unreachableServer = signal('');

  async ngOnInit(): Promise<void> {
    // A returning visitor of any kind — including one who chose to stay
    // anonymous — goes straight to the app. Re-asking a settled question is
    // how the previous front door annoyed people who had already answered.
    // The mid-preview case is the exception: that account exists because we
    // made it, not because they asked for it, so the question still stands.
    if (!this.auth.isAuthenticated && !this.preview.active) {
      const entered = await this.startPreview();
      // The dialog is up and owns what happens next; navigating now would
      // unmount it and land on the empty feed it exists to prevent.
      if (!entered) {
        return;
      }
    }
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  /**
   * Enter Anonymous and seed three follows so `/home` has real posts to show.
   *
   * Entering before the visitor has agreed to anything is deliberate: it is the
   * only way the timeline behind the modal can be real. The account is
   * browser-local, costs no network identity, and every exit from the modal
   * clears the seed — including the ones that lead to a real login.
   *
   * If every candidate in the short chain is unreachable, the visitor is asked
   * to hunt the full directory rather than being entered against a dead host.
   * Entering anyway used to be the behaviour, on the reasoning that the welcome
   * modal still worked over an empty feed — but the whole point of the preview
   * is that the timeline behind the modal is real, and on a network that blocks
   * `mastodon.social` it is usually blocking the other two candidates as well.
   * An empty first impression is the thing this front door was built to avoid.
   *
   * @returns whether an anonymous session was entered. False means the
   * unreachable dialog is showing and owns the next step.
   */
  private async startPreview(): Promise<boolean> {
    for (const candidate of PREVIEW_SERVERS) {
      const result = await probeServerAvailability(candidate);
      if (result.status !== 'unreachable') {
        this.server.setBaseUrl(candidate);
        this.auth.enterAnonymous(candidate);
        await this.preview.seed(candidate);
        return true;
      }
    }
    this.unreachableServer.set(PREVIEW_SERVER);
    return false;
  }

  /** A server the hunt proved reachable. Seed the preview against it. */
  protected async enterWith(server: string): Promise<void> {
    this.unreachableServer.set('');
    this.server.setBaseUrl(server);
    this.auth.enterAnonymous(server);
    await this.preview.seed(server);
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  /**
   * No server found, or the visitor would rather sign in.
   *
   * Still enters anonymously, so the shell renders and the welcome modal can be
   * answered — this is the old fallback, kept for the case where it is now an
   * explicit choice rather than a silent outcome.
   */
  protected async giveUp(): Promise<void> {
    this.unreachableServer.set('');
    this.server.setBaseUrl(PREVIEW_SERVER);
    this.auth.enterAnonymous(PREVIEW_SERVER);
    this.preview.markEmpty(PREVIEW_SERVER);
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }
}
