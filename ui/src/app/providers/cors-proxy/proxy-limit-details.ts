export interface ProxyLimitDetails {
  cause: 'caller_allowance' | 'service_capacity' | 'upstream' | 'unknown' | 'legacy';
  scope: 'all_routes' | 'route';
  route?: string;
  identity?: 'ip' | 'account';
  tier?: 'free' | 'plus';
  retryAfterSeconds?: number;
}

/** HttpClient text responses and batch members carry JSON as a string. */
export function proxyErrorBody(value: unknown): Record<string, unknown> {
  if (typeof value === 'string' && value.length <= 65_536) {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Older Workers have no metadata. Never infer scope from English error text. */
export function proxyLimitDetails(value: unknown, route?: string): ProxyLimitDetails {
  const body = proxyErrorBody(value);
  const cause = body['cause'];
  const seconds = body['retryAfterSeconds'];
  return {
    cause:
      cause === undefined
        ? 'legacy'
        : cause === 'caller_allowance' || cause === 'service_capacity' || cause === 'upstream'
          ? cause
          : 'unknown',
    scope: body['scope'] === 'route' && body['route'] === route && !!route ? 'route' : 'all_routes',
    route,
    identity:
      body['identity'] === 'ip' || body['identity'] === 'account' ? body['identity'] : undefined,
    tier: body['tier'] === 'free' || body['tier'] === 'plus' ? body['tier'] : undefined,
    retryAfterSeconds:
      typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
  };
}
