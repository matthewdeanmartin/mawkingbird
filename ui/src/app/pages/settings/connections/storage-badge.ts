/**
 * Where a connection's credential is kept, said out loud on its page.
 *
 * ## Why this is worth a component
 *
 * Before the vault there was one answer for everything — this browser — so it
 * never needed saying. Now there are three, they differ per connection, and
 * none of them is visible: a key stored with Mawkingbird and a key that only
 * exists in this browser look identical on screen. That gap matters in both
 * directions. Someone who thinks a key is synced and finds their phone
 * unconfigured has been misled; someone who does not realise a key left their
 * machine has been misled *worse*.
 *
 * A free-standing component rather than a line copied into ten pages, for the
 * same reason `expiryLabel` is a free function: every connection answers the
 * same question about the same contract, and more connectors are coming.
 *
 * ## The states, and the one that is easy to get wrong
 *
 * `locked` is the state worth care. It means the vault holds the credential and
 * this browser does not — local retention expired the plaintext while the
 * stored copy lives on. It is **not** a disconnection, and must never read like
 * one: telling someone to reconnect something that is still connected is how
 * they go and re-issue a token they did not need to. See
 * `VaultBridge.verdictFor` and `credential-lifetime.ts`.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Where a connection's credential currently lives. */
export type CredentialLocation =
  /** The connector works without a credential at all. */
  | 'none'
  /** In this browser only. Nothing left the machine. */
  | 'local'
  /** Encrypted with Mawkingbird, and present here too. */
  | 'vaulted'
  /** Encrypted with Mawkingbird, but not in this browser right now. */
  | 'locked'
  /** Encrypted with Mawkingbird and ready to restore into this otherwise-empty browser. */
  | 'available'
  /** The vault is closed or unavailable, so its encrypted inventory cannot be inspected. */
  | 'unknown';

@Component({
  selector: 'app-storage-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="storage-badge" [class]="'storage-badge--' + where()" [title]="explanation()">
      {{ label() }}
    </span>
  `,
  styles: `
    .storage-badge {
      display: inline-block;
      padding: 0.1rem 0.45rem;
      border: 1px solid currentColor;
      border-radius: 999px;
      font-size: 0.75rem;
      /* Deliberately not colour alone: the states must be distinguishable
         without relying on hue, and the words already do that work. */
      opacity: 0.85;
    }
  `,
})
export class StorageBadge {
  readonly where = input.required<CredentialLocation>();

  protected label(): string {
    switch (this.where()) {
      case 'vaulted':
        return 'Stored with Mawkingbird';
      case 'locked':
        // Not "disconnected", and not "missing". The connection is live.
        return 'Stored with Mawkingbird — locked here';
      case 'available':
        return 'Available from Mawkingbird';
      case 'unknown':
        return 'Unlock Plus to check';
      case 'none':
        return 'No key to store';
      default:
        return 'Not stored with Mawkingbird';
    }
  }

  protected explanation(): string {
    switch (this.where()) {
      case 'vaulted':
        return (
          'Encrypted with your passphrase and kept by Mawkingbird, so this connection ' +
          'works on your other devices. Mawkingbird cannot read it.'
        );
      case 'locked':
        return (
          'The stored copy is still there; this browser just does not have it right now. ' +
          'Unlock your vault and it comes back — you do not need to reconnect.'
        );
      case 'available':
        return 'An encrypted credential exists for this connector and can fill this browser without replacing local data.';
      case 'unknown':
        return 'The encrypted vault is not open, so this browser cannot honestly say whether this connector is in it.';
      case 'none':
        return 'This connection does not currently use a credential that Mawkingbird could store.';
      default:
        return 'This credential is not in your Mawkingbird Plus vault. It will not appear on your other devices.';
    }
  }
}

/**
 * Work out where a credential lives, from what a connector already exposes.
 *
 * Takes the two facts every wired connector has — whether the key syncs, and
 * whether this browser is currently missing its plaintext — rather than the
 * vault's own state. That is deliberate: a locked *vault* is not a locked
 * *credential*, and asking the vault whether it is open right now would report
 * every synced connection as local the moment someone locked up.
 */
export function credentialLocation(syncs: boolean, needsFetch: boolean): CredentialLocation {
  if (!syncs) {
    return 'local';
  }
  return needsFetch ? 'locked' : 'vaulted';
}
