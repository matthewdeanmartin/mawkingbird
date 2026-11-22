import { InjectionToken } from '@angular/core';

/** Build-selected product policy; persisted feature flags cannot override it. */
export const BUILD_RUNTIME_POLICY = {
  hostedServices: true,
  analytics: true,
  remoteConfig: true,
  /** Offline app shell (public/sw.js). Native serves its bundle locally and never needs one. */
  serviceWorker: true,
};

export const RUNTIME_POLICY = new InjectionToken<typeof BUILD_RUNTIME_POLICY>('runtime-policy', {
  providedIn: 'root',
  factory: () => BUILD_RUNTIME_POLICY,
});
