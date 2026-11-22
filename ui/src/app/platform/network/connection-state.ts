import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { ServerHealth } from '../http/server-health';
import { CAN_PROBE, ConnectionMeter } from './connection-meter';

/**
 * What the app should put in front of the reader when requests fail.
 *
 * - `none`     — carry on (slow and unstable are the header chip's job).
 * - `offline`  — the reader's own connection is down: a calm banner, and
 *   everything already on screen stays readable. Never the whale.
 * - `checking` — the home server stopped answering and it is not yet known
 *   whose fault that is; a probe of this site is in flight.
 * - `whale`    — the server is unreachable while the connection demonstrably
 *   works: the full-screen fail whale, which is about the server.
 */
export type FailureSurface = 'none' | 'offline' | 'checking' | 'whale';

export function failureSurface(input: {
  serverDown: boolean;
  online: boolean;
  verdict: string;
  blame: 'connection' | 'server' | null;
  canProbe: boolean;
}): FailureSurface {
  if (!input.online || input.verdict === 'offline') return 'offline';
  if (!input.serverDown) return 'none';
  // Without any probe there is nothing else to ask; keep the old behaviour
  // and let the whale's own diagnostics explain.
  if (!input.canProbe || input.blame === 'server') return 'whale';
  return 'checking';
}

@Injectable({ providedIn: 'root' })
export class ConnectionState {
  private readonly meter = inject(ConnectionMeter);
  private readonly health = inject(ServerHealth);

  readonly surface = computed<FailureSurface>(() =>
    failureSurface({
      serverDown: this.health.down(),
      online: this.meter.hints().online,
      verdict: this.meter.verdict(),
      blame: this.meter.assessment().blame,
      // A probe that can't answer (Native where the OS can't say) is no probe:
      // "checking" would otherwise wait forever.
      canProbe: CAN_PROBE && !this.meter.probeUnknown(),
    }),
  );

  private wasOffline = false;

  constructor() {
    effect(() => {
      const surface = this.surface();
      untracked(() => this.react(surface));
    });
  }

  /** "Try now" on the offline banner: ask this site, then the server. */
  async retryNow(): Promise<void> {
    const probe = await this.meter.probe();
    if (probe?.outcome === 'ok' && this.health.down()) this.health.recheck();
  }

  private react(surface: FailureSurface): void {
    if (surface === 'checking') {
      // Is it me or the server? One request to this site answers it: the
      // meter then blames the server (whale) or the connection (offline).
      void this.meter.probe();
    }
    if (surface === 'offline') {
      this.wasOffline = true;
    } else if (this.wasOffline) {
      this.wasOffline = false;
      // The connection came back. If the server was marked down while we
      // were offline, check it once now instead of making the reader find
      // and press a button — an event, not a polling timer.
      if (this.health.down()) this.health.recheck();
    }
  }
}
