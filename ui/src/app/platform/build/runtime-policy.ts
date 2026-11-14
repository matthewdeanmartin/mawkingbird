import { InjectionToken } from '@angular/core';

/** Build-selected product policy; persisted feature flags cannot override it. */
export const BUILD_RUNTIME_POLICY = {
  hostedServices: true,
  analytics: true,
  remoteConfig: true,
};

export const RUNTIME_POLICY = new InjectionToken<typeof BUILD_RUNTIME_POLICY>('runtime-policy', {
  providedIn: 'root',
  factory: () => BUILD_RUNTIME_POLICY,
});
