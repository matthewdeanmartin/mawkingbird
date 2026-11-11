import type { SyncOutcome } from './vault-bridge';

/** What one connector contributed to a two-way vault reconciliation. */
export type VaultReconcileOutcome =
  | { kind: 'restored' }
  | { kind: 'stored' }
  | { kind: 'merged' }
  | { kind: 'unchanged' }
  | { kind: 'skipped' }
  | { kind: 'conflict'; message: string }
  | { kind: 'failed'; message: string };

/** Turn the existing upload result into the wider reconciliation vocabulary. */
export function storedOutcome(outcome: SyncOutcome): VaultReconcileOutcome {
  switch (outcome.kind) {
    case 'stored':
      return { kind: 'stored' };
    case 'failed':
      return outcome;
    case 'skipped':
      return outcome;
  }
}

/**
 * Reconcile a single-valued credential without choosing a winner for a real conflict.
 *
 * The deliberately asymmetric safety rule is the product rule: something always
 * replaces nothing. Two different non-empty values are left where they are and
 * reported, because silently choosing either one would clobber the other device.
 */
export async function reconcileScalar(options: {
  local: string | null;
  remote: string | null;
  restore: (remote: string) => boolean;
  store: () => Promise<SyncOutcome>;
  conflictMessage: string;
}): Promise<VaultReconcileOutcome> {
  const { local, remote } = options;
  if (local === null && remote === null) {
    return { kind: 'skipped' };
  }
  if (local === null && remote !== null) {
    return options.restore(remote)
      ? { kind: 'restored' }
      : { kind: 'failed', message: 'The encrypted copy could not be read by this build.' };
  }
  if (local !== null && remote === null) {
    return storedOutcome(await options.store());
  }
  return local === remote
    ? { kind: 'unchanged' }
    : { kind: 'conflict', message: options.conflictMessage };
}
