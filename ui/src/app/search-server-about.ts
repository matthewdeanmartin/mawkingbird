import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { InstanceRule, TermsOfService } from './models';
import { externalFetch } from './providers/external-fetch';
import { SearchServer } from './search-server';

const CACHE_KEY = 'mockingbird_search_server_about_v1';

interface AboutRecord {
  rules?: InstanceRule[];
  terms?: TermsOfService | null;
}

function readCache(): Record<string, AboutRecord> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, AboutRecord>;
  } catch {
    return {};
  }
}

/**
 * Rules and Terms published by the *search* server.
 *
 * Deliberately parallel to ServerAbout rather than folded into it: ServerAbout is
 * bound to the primary instance at construction and reached through relative URLs
 * that the server interceptor rewrites, whereas this one is keyed on a base URL
 * that can change at runtime and must be fetched absolutely (and anonymously —
 * the primary server's token has no business going there).
 *
 * When you're using two servers you've agreed to two sets of house rules, so the
 * Docs page lists both.
 */
@Injectable({ providedIn: 'root' })
export class SearchServerAbout {
  private http = inject(HttpClient);
  private searchServer = inject(SearchServer);

  readonly rules = signal<InstanceRule[] | undefined>(undefined);
  readonly terms = signal<TermsOfService | null | undefined>(undefined);
  readonly loading = signal(false);
  readonly hasRules = computed(() => this.searchServer.active() && (this.rules()?.length ?? 0) > 0);
  readonly hasTerms = computed(() => this.searchServer.active() && !!this.terms()?.content.trim());

  /** The base URL the currently loaded rules/terms belong to. */
  private loadedFor: string | null = null;

  /** Fetch once per search server; a no-op when no search server is configured. */
  load(): void {
    const base = this.searchServer.baseUrl();
    if (!base) {
      this.rules.set(undefined);
      this.terms.set(undefined);
      this.loadedFor = null;
      return;
    }
    if (this.loading() || this.loadedFor === base) {
      return;
    }
    const cached = readCache()[base];
    if (cached) {
      this.rules.set(cached.rules);
      this.terms.set(cached.terms);
      this.loadedFor = base;
      return;
    }
    this.loading.set(true);
    forkJoin({
      rules: this.http
        .get<InstanceRule[]>(`${base}/api/v1/instance/rules`, { context: externalFetch() })
        .pipe(
          map((value) => ({ known: true, value })),
          // 404 means "this server publishes none", anything else means "we don't know".
          catchError((error: HttpErrorResponse) =>
            of({ known: error.status === 404, value: [] as InstanceRule[] }),
          ),
        ),
      terms: this.http
        .get<TermsOfService>(`${base}/api/v1/instance/terms_of_service`, {
          context: externalFetch(),
        })
        .pipe(
          map((value) => ({ known: true, value: value as TermsOfService | null })),
          catchError((error: HttpErrorResponse) =>
            of({ known: error.status === 404, value: null as TermsOfService | null }),
          ),
        ),
    }).subscribe(({ rules, terms }) => {
      if (rules.known) this.rules.set(rules.value);
      if (terms.known) this.terms.set(terms.value);
      this.loadedFor = base;
      this.persist(base);
      this.loading.set(false);
    });
  }

  private persist(base: string): void {
    const cache = readCache();
    cache[base] = {
      ...(this.rules() !== undefined ? { rules: this.rules() } : {}),
      ...(this.terms() !== undefined ? { terms: this.terms() } : {}),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
}
