import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../auth';
import { normalizeHostUrl } from '../../host-url';
import { probeServerAvailability } from '../../server-availability';
import { Server } from '../../server';
import { UnreachableServerDialog } from '../../unreachable-server-dialog/unreachable-server-dialog';

/**
 * Shareable entry point that activates the local Anonymous account.
 *
 * ## Why the unreachable case gets a dialog rather than a redirect
 *
 * This used to hand off to `/` when the server didn't answer, on the reasoning
 * that `/` probes a fallback chain. It does — but a chain of three hard-coded
 * hosts, and if all three are blocked it enters anyway against an unreachable
 * server, which is a fail whale by a longer road. On networks that block
 * `mastodon.social` the other two are frequently blocked as well, since it is
 * usually a category block rather than a single-domain one.
 *
 * The app already ships a directory of ~300 servers and a component that hunts
 * through it for one that actually answers. Reading needs no account on any
 * particular server, so *any* working host satisfies what the visitor asked
 * for. Searching is strictly better than failing.
 */
@Component({
  selector: 'app-anonymous-entry',
  imports: [UnreachableServerDialog],
  template: `
    @if (unreachableServer(); as server) {
      <app-unreachable-server-dialog
        [attemptedServer]="server"
        (selected)="enter($event)"
        (cancelled)="giveUp()"
      />
    }
  `,
})
export class AnonymousEntry implements OnInit {
  private auth = inject(Auth);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private server = inject(Server);

  /** The server that failed, or empty while probing or on success. */
  protected readonly unreachableServer = signal('');

  async ngOnInit(): Promise<void> {
    // A bare query key makes the share URL pleasantly short:
    // /anonymous?mastodon.social (rather than /anonymous?server=mastodon.social).
    const sharedHost = this.route.snapshot.queryParamMap.keys[0] ?? 'mastodon.social';
    const server = normalizeHostUrl(sharedHost) || 'https://mastodon.social';
    const result = await probeServerAvailability(server);
    if (result.status === 'unreachable') {
      // Ask for a working server rather than entering against a dead one.
      this.unreachableServer.set(server);
      return;
    }
    await this.enter(server);
  }

  /** Enter anonymously against a server known to answer. */
  protected async enter(server: string): Promise<void> {
    this.unreachableServer.set('');
    // The base URL has to move too: entering anonymously sets the identity, but
    // every read still goes through `Server`, which would otherwise keep
    // pointing at the host that just failed.
    this.server.setBaseUrl(server);
    this.auth.enterAnonymous(server);
    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  /** No server found, or the visitor would rather sign in. */
  protected async giveUp(): Promise<void> {
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
