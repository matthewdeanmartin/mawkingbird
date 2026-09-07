import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { Api } from './api';
import { InstanceRule, TermsOfService } from './models';
import { Server } from './server';

const CACHE_KEY = 'mockingbird_server_about_v1';

interface ServerAboutRecord {
  rules?: InstanceRule[];
  terms?: TermsOfService | null;
}

type ServerAboutCache = Record<string, ServerAboutRecord>;

function readCache(): ServerAboutCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as ServerAboutCache;
  } catch {
    return {};
  }
}

/** Lazily discovers optional instance pages and remembers the result per server. */
@Injectable({ providedIn: 'root' })
export class ServerAbout {
  private readonly api = inject(Api);
  private readonly server = inject(Server);
  private readonly key = this.server.baseUrl() || location.origin;
  private readonly cached = readCache()[this.key] ?? {};

  readonly rules = signal<InstanceRule[] | undefined>(this.cached.rules);
  readonly terms = signal<TermsOfService | null | undefined>(this.cached.terms);
  readonly loading = signal(false);
  readonly hasRules = computed(() => (this.rules()?.length ?? 0) > 0);
  readonly hasTerms = computed(() => !!this.terms()?.content.trim());

  /** Fetch only unknown fields; opening More repeatedly never polls the instance. */
  load(): void {
    if (this.loading() || (this.rules() !== undefined && this.terms() !== undefined)) {
      return;
    }
    this.loading.set(true);
    forkJoin({
      rules:
        this.rules() !== undefined
          ? of({ known: true, value: this.rules()! })
          : this.api.instanceRules().pipe(
              map((value) => ({ known: true, value })),
              catchError((error: HttpErrorResponse) =>
                of({ known: error.status === 404, value: [] as InstanceRule[] }),
              ),
            ),
      terms:
        this.terms() !== undefined
          ? of({ known: true, value: this.terms()! })
          : this.api.termsOfService().pipe(
              map((value) => ({ known: true, value: value as TermsOfService | null })),
              catchError((error: HttpErrorResponse) =>
                of({ known: error.status === 404, value: null as TermsOfService | null }),
              ),
            ),
    }).subscribe(({ rules, terms }) => {
      if (rules.known) this.rules.set(rules.value);
      if (terms.known) this.terms.set(terms.value);
      this.persist();
      this.loading.set(false);
    });
  }

  private persist(): void {
    const cache = readCache();
    cache[this.key] = {
      ...(this.rules() !== undefined ? { rules: this.rules() } : {}),
      ...(this.terms() !== undefined ? { terms: this.terms() } : {}),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
}
