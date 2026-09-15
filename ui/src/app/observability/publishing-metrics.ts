import { HttpContextToken } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { DiagnosticLog } from '../diagnostic-log';
import { externalFetch } from '../providers/external-fetch';
import { PUBLISHING_ENDPOINTS } from '../providers/publishing-services';

export const PUBLISHING_REQUEST = new HttpContextToken<{
  service: string;
  route: 'direct' | 'proxy';
} | null>(() => null);

export function publishingFetch(service: string, route: 'direct' | 'proxy' = 'direct') {
  return externalFetch().set(PUBLISHING_REQUEST, { service, route });
}

export interface PublishingStat {
  service: string;
  calls: number;
  errors: number;
  totalMs: number;
}

/** Bounded aggregates for this tab, with safe console/diagnostic-log events. */
@Injectable({ providedIn: 'root' })
export class PublishingMetrics {
  private diagnostics = inject(DiagnosticLog);
  readonly stats = signal<readonly PublishingStat[]>([]);

  record(
    service: string,
    route: 'direct' | 'proxy',
    method: string,
    status: number,
    ms: number,
  ): void {
    if (!PUBLISHING_ENDPOINTS.some((item) => item.service === service)) return;
    const durationMs = Math.max(0, Math.round(ms));
    const failed = status === 0 || status >= 400;
    const previous = this.stats().find((item) => item.service === service);
    const stat = {
      service,
      calls: (previous?.calls ?? 0) + 1,
      errors: (previous?.errors ?? 0) + Number(failed),
      totalMs: (previous?.totalMs ?? 0) + durationMs,
    };
    this.stats.update((all) => [...all.filter((item) => item.service !== service), stat]);
    // No URLs, bodies, response errors or headers: message URLs contain content.
    this.diagnostics.write(failed ? 'warn' : 'info', 'Publishing HTTP', 'request:complete', {
      service,
      route,
      method,
      status,
      durationMs,
    });
  }
}
