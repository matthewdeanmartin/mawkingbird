import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, Subscriber, throwError, timeout } from 'rxjs';
import { externalFetch } from '../external-fetch';
import { CorsProxy } from './cors-proxy';
import { CorsProxyRoute } from './cors-proxy-catalog';

/** A bounded text GET that may share a Mawkingbird Worker invocation. */
@Injectable({ providedIn: 'root' })
export class CorsProxyBatchFetch {
  private http = inject(HttpClient);
  private proxy = inject(CorsProxy);
  private queues = new Map<CorsProxyRoute, PendingText[]>();
  private scheduled = new Set<CorsProxyRoute>();
  private sequence = 0;

  text(targetUrl: string, route: CorsProxyRoute): Observable<string> {
    if (this.proxy.batchCapacity(route) < 2) {
      return this.single(targetUrl, route);
    }
    return new Observable((subscriber) => {
      const pending = { id: `text-${++this.sequence}`, targetUrl, subscriber };
      const queue = this.queues.get(route) ?? [];
      queue.push(pending);
      this.queues.set(route, queue);
      if (!this.scheduled.has(route)) {
        this.scheduled.add(route);
        queueMicrotask(() => this.flush(route));
      }
      return () => {
        const index = queue.indexOf(pending);
        if (index >= 0) queue.splice(index, 1);
      };
    });
  }

  private flush(route: CorsProxyRoute): void {
    this.scheduled.delete(route);
    const queue = (this.queues.get(route) ?? []).filter((item) => !item.subscriber.closed);
    this.queues.delete(route);
    const capacity = this.proxy.batchCapacity(route);
    for (let index = 0; index < queue.length; index += Math.max(1, capacity)) {
      const group = queue.slice(index, index + Math.max(1, capacity));
      if (capacity < 2 || group.length === 1) group.forEach((item) => this.sendSingle(item, route));
      else this.sendBatch(group, route);
    }
  }

  private sendSingle(item: PendingText, route: CorsProxyRoute): void {
    this.single(item.targetUrl, route).subscribe(item.subscriber);
  }

  private single(targetUrl: string, route: CorsProxyRoute): Observable<string> {
    try {
      const request = this.proxy.proxyRequest(targetUrl, route);
      return this.http.get(request.url, {
        headers: request.headers,
        context: externalFetch(),
        responseType: 'text',
      });
    } catch (error: unknown) {
      return throwError(() => error);
    }
  }

  private sendBatch(items: readonly PendingText[], route: CorsProxyRoute): void {
    let request;
    try {
      request = this.proxy.proxyBatchRequest(
        items.map(({ id, targetUrl }) => ({ id, url: targetUrl })),
        route,
      );
    } catch (error: unknown) {
      items.forEach((item) => item.subscriber.error(error));
      return;
    }
    this.http
      .post<unknown>(request.url, request.body, {
        headers: request.headers,
        context: externalFetch(),
      })
      .pipe(timeout(BATCH_TIMEOUT_MS))
      .subscribe({
        next: (body) => this.deliver(items, body),
        error: (error: unknown) => items.forEach((item) => item.subscriber.error(error)),
      });
  }

  private deliver(items: readonly PendingText[], value: unknown): void {
    const results = batchResults(value);
    if (!results) {
      const error = new Error('The CORS proxy returned an invalid batch response.');
      items.forEach((item) => item.subscriber.error(error));
      return;
    }
    const byId = new Map(results.map((result) => [result.id, result]));
    for (const item of items) {
      const result = byId.get(item.id);
      if (!result) {
        item.subscriber.error(
          new Error('The CORS proxy omitted a request from its batch response.'),
        );
      } else if (!result.ok) {
        item.subscriber.error(new HttpErrorResponse({ status: result.status, error: result.body }));
      } else {
        item.subscriber.next(result.body);
        item.subscriber.complete();
      }
    }
  }
}

const BATCH_TIMEOUT_MS = 25_000;

interface PendingText {
  id: string;
  targetUrl: string;
  subscriber: Subscriber<string>;
}

interface TextResult {
  id: string;
  status: number;
  ok: boolean;
  body: string;
}

function batchResults(value: unknown): TextResult[] | null {
  if (!record(value) || !Array.isArray(value['results'])) return null;
  const results: TextResult[] = [];
  for (const item of value['results']) {
    if (
      !record(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['status'] !== 'number' ||
      typeof item['ok'] !== 'boolean' ||
      typeof item['body'] !== 'string'
    )
      return null;
    results.push({ id: item['id'], status: item['status'], ok: item['ok'], body: item['body'] });
  }
  return results;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
