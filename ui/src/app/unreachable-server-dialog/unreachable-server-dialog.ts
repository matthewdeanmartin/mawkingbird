import { Component, inject, input, output } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FocusTrap } from '../a11y/focus-trap';
import { ServerDiscovery } from '../server-discovery/server-discovery';

/**
 * "The server you asked for isn't reachable — here's one that is."
 *
 * The failure this exists to prevent: someone picks *Look around without an
 * account*, the app tries `mastodon.social`, that host is blocked on their
 * network, and they land on a fail whale. Reading without an account is the
 * one promise the anonymous door makes, and a blocked default was enough to
 * break it — even though the app already ships a directory of ~300 servers and
 * the machinery to find a working one.
 *
 * So the dead end becomes a search. {@link ServerDiscovery} does the actual
 * hunting (random walk, three workers, real availability probe including the
 * media host); this only frames it as a modal and explains why it appeared.
 *
 * The hunt starts immediately rather than behind a button: the visitor is on an
 * error path they did not choose, and a button would ask them to opt in to
 * fixing a problem they did not cause. They can still cancel, keep looking, or
 * take the first working server offered.
 */
// i18n unreachableServer.findAServerICanRead: Find a server I can read
// i18n unreachableServer.title: {{server}} isn’t reachable
// i18n unreachableServer.explanation: It may be blocked on this network, or having a bad day. Mawkingbird reads from any Mastodon server, so it’s looking for one that answers — you don’t need an account on it to read.
// i18n unreachableServer.skip: Skip — I’ll sign in instead
// i18n unreachableServer.thatServer: That server
@Component({
  selector: 'app-unreachable-server-dialog',
  imports: [FocusTrap, ServerDiscovery, TranslocoPipe],
  templateUrl: './unreachable-server-dialog.html',
  styleUrl: './unreachable-server-dialog.css',
})
export class UnreachableServerDialog {
  private transloco = inject(TranslocoService);
  /** The server that failed, shown so the message names something concrete. */
  readonly attemptedServer = input('');

  /** A working server was chosen. Emits an origin, e.g. `https://mas.to`. */
  readonly selected = output<string>();

  /** The visitor gave up on finding a server. */
  readonly cancelled = output<void>();

  protected attemptedHost(): string {
    const value = this.attemptedServer();
    if (!value) {
      return this.transloco.translate('unreachableServer.thatServer');
    }
    try {
      return new URL(value).host;
    } catch {
      return value;
    }
  }
}
