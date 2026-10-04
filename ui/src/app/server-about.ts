import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, linkedSignal } from '@angular/core';
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
  private readonly key = computed(() => this.server.baseUrl() || location.origin);

  readonly rules = linkedSignal<string, InstanceRule[] | undefined>({
    source: this.key,
    computation: (key) => readCache()[key]?.rules,
  });
  readonly terms = linkedSignal<string, TermsOfService | null | undefined>({
    source: this.key,
    computation: (key) => readCache()[key]?.terms,
  });
  readonly loading = linkedSignal({ source: this.key, computation: () => false });
  private request = 0;
  readonly hasRules = computed(() => (this.rules()?.length ?? 0) > 0);
  readonly hasTerms = computed(() => !!this.terms()?.content.trim());

  /** Fetch only unknown fields; opening More repeatedly never polls the instance. */
  load(): void {
    if (this.loading() || (this.rules() !== undefined && this.terms() !== undefined)) {
      return;
    }
    const key = this.key();
    const request = ++this.request;
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
      if (key !== this.key() || request !== this.request) return;
      if (rules.known) this.rules.set(rules.value);
      if (terms.known) this.terms.set(terms.value);
      this.persist();
      this.loading.set(false);
    });
  }

  private persist(): void {
    const cache = readCache();
    cache[this.key()] = {
      ...(this.rules() !== undefined ? { rules: this.rules() } : {}),
      ...(this.terms() !== undefined ? { terms: this.terms() } : {}),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
}
