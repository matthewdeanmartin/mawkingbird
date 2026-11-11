import { Injectable, signal } from '@angular/core';

/**
 * Whether the signed-in account is currently a supporter.
 *
 * ## Why this is a separate service from `PlusSession`
 *
 * Purely to keep a dependency from forming. `CorsProxySettings` needs to know
 * "is this account entitled?" so it can offer the supporter tier automatically,
 * but it must not import `PlusSession` to find out: that would drag the 20 KB
 * AuthKit SDK into the initial bundle for every visitor, including the majority
 * who never sign in. The same reasoning produced `PlusTokenSource` in
 * `plus-token.interceptor.ts`.
 *
 * So this holds one boolean and nothing else. `PlusSession` writes it whenever
 * it mints a token; anyone may read it. It has no imports beyond Angular, so
 * depending on it costs nothing.
 *
 * ## Why it is not persisted
 *
 * Entitlement is a fact about the account, checked by the Worker on every mint,
 * not a preference. Writing it to storage would let a lapsed subscription keep
 * asserting itself locally, and would put one more thing in the export
 * classification for no benefit. Signed out, or before the first mint, this is
 * false — which resolves to the free tier, the correct default in every
 * ambiguous case.
 */
@Injectable({ providedIn: 'root' })
export class SupporterStatus {
  /** True once a mint has reported `tier: 'plus'`. */
  readonly isSupporter = signal(false);
}
