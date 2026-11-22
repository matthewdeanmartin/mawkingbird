import { HttpErrorResponse, HttpEvent, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, delay, mergeMap, throwError, timer } from 'rxjs';

/**
 * Named bad-network profiles for development and manual testing: the
 * shopping trip on a desk. Applied in the client (not on the mock server) so
 * they can drop connections outright and black out on a schedule, which a
 * server-side rule cannot, and so they work against any server.
 *
 * Kept in sessionStorage on purpose: a forgotten "flaky" setting must die with
 * the tab rather than haunt the next session as a mystery outage.
 */
export type NetworkProfileId = 'off' | 'slow3g' | 'flaky' | 'blackouts' | 'offline';

export interface NetworkProfile {
  id: NetworkProfileId;
  /** Added before every response, ms. */
  latencyMs: number;
  /** Random extra latency up to this, ms. */
  jitterMs: number;
  /** Share of requests that fail as if no answer arrived, 0..1. */
  dropRate: number;
  /** Seconds of each minute during which everything fails (from :00). */
  blackoutSecondsPerMinute: number;
}

export const NETWORK_PROFILES: readonly NetworkProfile[] = [
  { id: 'off', latencyMs: 0, jitterMs: 0, dropRate: 0, blackoutSecondsPerMinute: 0 },
  { id: 'slow3g', latencyMs: 2_000, jitterMs: 1_000, dropRate: 0, blackoutSecondsPerMinute: 0 },
  { id: 'flaky', latencyMs: 400, jitterMs: 800, dropRate: 0.3, blackoutSecondsPerMinute: 0 },
  { id: 'blackouts', latencyMs: 300, jitterMs: 300, dropRate: 0, blackoutSecondsPerMinute: 20 },
  { id: 'offline', latencyMs: 0, jitterMs: 0, dropRate: 1, blackoutSecondsPerMinute: 0 },
];

export const NETWORK_PROFILE_KEY = 'mockingbird_network_profile';

function readStored(): NetworkProfileId {
  try {
    const stored = sessionStorage.getItem(NETWORK_PROFILE_KEY);
    return NETWORK_PROFILES.some((p) => p.id === stored) ? (stored as NetworkProfileId) : 'off';
  } catch {
    return 'off';
  }
}

@Injectable({ providedIn: 'root' })
export class NetworkSimulator {
  readonly active = signal<NetworkProfileId>(readStored());

  profile(): NetworkProfile {
    return NETWORK_PROFILES.find((p) => p.id === this.active()) ?? NETWORK_PROFILES[0];
  }

  set(id: NetworkProfileId): void {
    this.active.set(id);
    try {
      if (id === 'off') sessionStorage.removeItem(NETWORK_PROFILE_KEY);
      else sessionStorage.setItem(NETWORK_PROFILE_KEY, id);
    } catch {
      // Private mode without storage: the profile still applies to this page.
    }
  }
}

/** Whether a profile drops this request; pure so the schedule can be tested. */
export function simulatedDrop(profile: NetworkProfile, now: number, random: number): boolean {
  if (profile.dropRate > 0 && random < profile.dropRate) return true;
  const second = Math.floor(now / 1000) % 60;
  return second < profile.blackoutSecondsPerMinute;
}

function dropped(url: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 0,
    statusText: 'Simulated network failure',
    url,
    error: new ProgressEvent('error'),
  });
}

/**
 * Innermost before the transport, so the connection meter (just outside)
 * measures the simulated conditions exactly as it would real ones.
 */
export const networkSimulatorInterceptor: HttpInterceptorFn = (
  req,
  next,
): Observable<HttpEvent<unknown>> => {
  const profile = inject(NetworkSimulator).profile();
  if (profile.id === 'off') return next(req);
  const wait = profile.latencyMs + Math.random() * profile.jitterMs;
  if (simulatedDrop(profile, Date.now(), Math.random())) {
    // A dropped request still takes time to fail, like a real dead connection.
    return timer(Math.max(wait, 1_000)).pipe(
      mergeMap(() => throwError(() => dropped(req.urlWithParams))),
    );
  }
  return next(req).pipe(delay(wait));
};
