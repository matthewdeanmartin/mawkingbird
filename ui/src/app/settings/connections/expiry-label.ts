/**
 * Render a credential's retention deadline for a connection page.
 *
 * A free function rather than a method on each page because all of them show
 * the same sentence about the same `expiresAt()` contract, and a dozen more
 * connectors are coming.
 *
 * Returns null when nothing is connected or the policy is "keep until I
 * disconnect" — in both cases there is no date to promise, and the caller's
 * `@if` drops the whole line.
 */
export function expiryLabel(expiresAt: number | null): string | null {
  if (expiresAt === null) {
    return null;
  }
  return new Date(expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
