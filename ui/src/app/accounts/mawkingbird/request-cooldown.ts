/** No polling: callers may try again after a bounded, jittered failure delay. */
export class RequestCooldown {
  private failures = 0;
  private until = 0;

  blocked(): boolean {
    return Date.now() < this.until;
  }

  success(): void {
    this.failures = 0;
    this.until = 0;
  }

  fail(status = 0, retryAfter: string | null = null): void {
    const exponential = Math.min(15 * 60_000, 30_000 * 2 ** Math.min(this.failures++, 5));
    const permanent = status === 403 || status === 404 ? 15 * 60_000 : 0;
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const requested =
      retryAfter === null
        ? 0
        : Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retryAfter) - Date.now();
    const delay = Math.max(exponential, permanent, Number.isFinite(requested) ? requested : 0);
    this.until = Date.now() + Math.min(24 * 60 * 60_000, delay) + Math.random() * 5000;
  }
}
