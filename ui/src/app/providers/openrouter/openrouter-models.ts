import { Injectable, signal } from '@angular/core';
import { openRouterError } from './openrouter-session';

/**
 * Searching OpenRouter's model catalogue.
 *
 * The design rule, from Matthew: **there is no way to ask this service for
 * every model.** OpenRouter lists ~500, and a picker that dumps 500 rows is not
 * a picker. `GET /api/v1/models` supports server-side filtering, so every
 * request this service makes carries at least one filter and the narrowing
 * happens at the far end rather than in the browser's memory.
 *
 * That rule is enforced by construction — {@link OpenRouterModels.search} has
 * no "give me everything" branch — and pinned by a spec that fails if any
 * outgoing URL lacks a filter parameter.
 *
 * The endpoint is public: no key required. So the picker works *before* you
 * connect, which is worth something — you can see what you would be choosing
 * from before deciding whether to authorize.
 */

const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** How many results one search returns. A screenful, not a catalogue. */
export const MODEL_SEARCH_LIMIT = 20;

/**
 * The default model: Gemma, per Matthew. Verified live against the models API —
 * 262k context, and it advertises `structured_outputs`, which is what lets the
 * prompt helpers ask for a JSON schema instead of parsing prose.
 */
export const DEFAULT_MODEL_ID = 'google/gemma-4-31b-it';

/**
 * The parameter both prompt helpers need. Filtering on it excludes the `:free`
 * model variants, which advertise `response_format` but not structured output —
 * hence the visible, switchable checkbox in the picker rather than a silent
 * default the user can't see costing them the free tier.
 */
const STRUCTURED_OUTPUT_PARAM = 'structured_outputs';

/**
 * The fields the picker actually shows.
 *
 * Deliberately not the whole model object: the API returns benchmarks,
 * design-arena ELO, per-request limits and a dozen other fields that would just
 * be a larger surface to mistype against.
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per prompt token, as returned. Null when the API omitted it. */
  promptPrice: number | null;
  /** USD per completion token, as returned. */
  completionPrice: number | null;
}

interface ModelsResponse {
  data?: {
    id?: string;
    name?: string;
    context_length?: number | null;
    pricing?: { prompt?: string; completion?: string };
  }[];
}

export interface ModelSearchOptions {
  /** Restrict to models that can be held to a JSON schema. Defaults to true. */
  structuredOnly?: boolean;
}

@Injectable({ providedIn: 'root' })
export class OpenRouterModels {
  /**
   * Per-page-session cache, keyed by query + filter.
   *
   * Not persisted: model pricing changes, and a stale price shown next to a
   * spending decision is worse than one more request.
   */
  private cache = new Map<string, OpenRouterModel[]>();

  readonly searching = signal(false);

  /**
   * Models matching `query`, filtered server-side.
   *
   * An empty query is not "everything" — it means "the default model", which is
   * the one row worth showing before the user has typed. A top-20 would be a
   * list of 500 with a `.slice()`, and would invite exactly the browsing this
   * design rejects.
   */
  async search(query: string, options: ModelSearchOptions = {}): Promise<OpenRouterModel[]> {
    const structuredOnly = options.structuredOnly ?? true;
    const trimmed = query.trim();
    const effectiveQuery = trimmed || DEFAULT_MODEL_ID;
    const cacheKey = `${effectiveQuery}::${structuredOnly}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = new URL(MODELS_URL);
    url.searchParams.set('q', effectiveQuery);
    url.searchParams.set('limit', String(MODEL_SEARCH_LIMIT));
    if (structuredOnly) {
      url.searchParams.set('supported_parameters', STRUCTURED_OUTPUT_PARAM);
    }

    this.searching.set(true);
    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(await openRouterError(response, "Couldn't reach OpenRouter's model list."));
      }
      const body = (await response.json()) as ModelsResponse;
      const models = (body.data ?? [])
        .filter((entry): entry is { id: string } & typeof entry => typeof entry.id === 'string')
        .map(
          (entry): OpenRouterModel => ({
            id: entry.id,
            name: entry.name ?? entry.id,
            contextLength: entry.context_length ?? null,
            promptPrice: parsePrice(entry.pricing?.prompt),
            completionPrice: parsePrice(entry.pricing?.completion),
          }),
        );
      this.cache.set(cacheKey, models);
      return models;
    } finally {
      this.searching.set(false);
    }
  }
}

/** Prices arrive as decimal strings ("0.0000001"); null when absent or junk. */
function parsePrice(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "$0.10 / M tokens", or null when the API gave us no price. */
export function perMillionTokens(price: number | null): string | null {
  if (price === null) {
    return null;
  }
  if (price === 0) {
    return 'free';
  }
  const perMillion = price * 1_000_000;
  return `$${perMillion < 0.01 ? perMillion.toFixed(4) : perMillion.toFixed(2)} / M tokens`;
}
