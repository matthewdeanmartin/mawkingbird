import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbNotice } from '../../design-system/notice/notice';
import { MastodonServers, ServerSuggestion } from '../../mastodon-servers';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { Availability, checkHandle, normalizeDomain, signUpUrl } from './handle-availability';
import { handleVariants } from './handle-variants';

type Status = Availability | 'checking';

interface Row {
  handle: string;
  status: Status;
}

interface BigServer {
  domain: string;
  users: number;
  /** Sign-ups need an admin's approval there; undefined when the directory didn't say. */
  approval?: boolean;
  status: Status;
}

/** The biggest servers in the joinmastodon directory, checked for a chosen handle. */
const BIG_SERVER_COUNT = 10;
/** Lookups in flight at once: quick, and gentle on any one server. */
const CONCURRENCY = 4;

/**
 * The handle generator and checker. Runs signed out: the people looking for a
 * handle are the ones without an account yet, and the lookups need none.
 *
 * Suggestions are checked on the server the visitor means to join; the one they
 * pick is then checked on the biggest servers too, so a taken name on one
 * server can become a free name on another.
 */
@Component({
  selector: 'app-handle-workbench',
  imports: [FormsModule, RouterLink, FocusedNextSteps, MbButton, MbControl, MbField, MbNotice],
  templateUrl: './handle-workbench.html',
  styleUrl: './handle-workbench.css',
})
export class HandleWorkbench {
  private readonly directory = inject(MastodonServers);

  /** Where the invite card points: the mini-app's own tab signed in, else the public builder. */
  readonly inviteLink = input('/invites');

  protected readonly name = signal('');
  protected readonly serverInput = signal('mastodon.social');
  protected readonly server = signal('');
  protected readonly rows = signal<Row[]>([]);
  protected readonly serverError = signal(false);
  protected readonly chosen = signal<string | null>(null);
  protected readonly big = signal<BigServer[]>([]);

  /** Guards against an older run writing into a newer one's results. */
  private run = 0;

  protected readonly suggestions = computed(() => handleVariants(this.name()));
  protected readonly checking = computed(() =>
    this.rows().some((row) => row.status === 'checking'),
  );
  protected readonly signUp = computed(() => signUpUrl(this.server()));

  constructor() {
    void this.directory.ready();
  }

  protected find(): void {
    const domain = normalizeDomain(this.serverInput());
    this.serverError.set(!domain);
    const handles = this.suggestions();
    if (!domain || !handles.length) return;
    const run = ++this.run;
    this.server.set(domain);
    this.chosen.set(null);
    this.big.set([]);
    this.rows.set(handles.map((handle) => ({ handle, status: 'checking' })));
    void inBatches(handles, CONCURRENCY, async (handle) => {
      const status = await checkHandle(domain, handle);
      if (run !== this.run) return;
      this.rows.update((rows) =>
        rows.map((row) => (row.handle === handle ? { ...row, status } : row)),
      );
    });
  }

  /** Pick a handle: check it on the biggest servers, and offer the sign-up. */
  protected async choose(handle: string): Promise<void> {
    const run = ++this.run;
    this.chosen.set(handle);
    await this.directory.ready();
    if (run !== this.run) return;
    const servers = biggest(this.directory.servers(), this.server());
    this.big.set(
      servers.map((entry) => ({
        domain: entry.domain,
        users: entry.users,
        approval: entry.approvalRequired,
        status: 'checking',
      })),
    );
    await inBatches(servers, CONCURRENCY, async (entry) => {
      const status = await checkHandle(entry.domain, handle);
      if (run !== this.run) return;
      this.big.update((rows) =>
        rows.map((row) => (row.domain === entry.domain ? { ...row, status } : row)),
      );
    });
  }

  protected label(status: Status): string {
    switch (status) {
      case 'free':
        return 'Looks free';
      case 'taken':
        return 'Taken';
      case 'unknown':
        return "Couldn't check";
      default:
        return 'Checking…';
    }
  }

  protected signUpOn(domain: string): string {
    return signUpUrl(domain);
  }

  protected users(count: number): string {
    return count >= 1000 ? `${Math.round(count / 1000)}k people` : `${count} people`;
  }
}

/** The biggest directory servers by sign-ups, leaving out the one already checked. */
function biggest(servers: readonly ServerSuggestion[], exclude: string): ServerSuggestion[] {
  return [...servers]
    .filter((entry) => !entry.local && entry.domain !== exclude)
    .sort((a, b) => b.users - a.users)
    .slice(0, BIG_SERVER_COUNT);
}

/** Run `task` over `items`, at most `size` at a time. */
async function inBatches<T>(items: readonly T[], size: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
