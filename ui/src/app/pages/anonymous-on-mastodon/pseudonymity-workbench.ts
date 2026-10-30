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
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import {
  ServerSwitch,
  ServerSwitchKey,
  fieldText,
  initialSelection,
  isSet,
  offeredSwitches,
  revealingFields,
} from './pseudonymity-plan';

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
  imports: [FocusedNextSteps, FormsModule, MbButton, MbCheckbox, MbNotice, RouterLink],
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
        this.saveError.set(describe(error));
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

function describe(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const detail = String(error.error?.error ?? '').trim();
    if (detail) return detail;
    if (error.status === 0) return "Couldn't reach your server. Nothing was changed.";
  }
  return "Your server didn't accept the change. Nothing was changed.";
}
