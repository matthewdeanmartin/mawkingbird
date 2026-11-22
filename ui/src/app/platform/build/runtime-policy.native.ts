import { InjectionToken } from '@angular/core';

/** Local desktop product. Cloud integrations are deferred until the final sprint. */
export const BUILD_RUNTIME_POLICY = {
  hostedServices: false,
  analytics: false,
  remoteConfig: false,
  /** Native serves its bundle from the app package; a service worker would add nothing. */
  serviceWorker: false,
};

export const RUNTIME_POLICY = new InjectionToken<typeof BUILD_RUNTIME_POLICY>('runtime-policy', {
  providedIn: 'root',
  factory: () => BUILD_RUNTIME_POLICY,
});
