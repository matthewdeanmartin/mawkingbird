import { BUILD_INFO, type BuildInfo } from './build-info';
import { isCanaryBuild, isTestBuild } from './build-flavor';

export type DeploymentName = 'production' | 'canary' | 'test';

/** The deployment selected by the document's base href. */
export function deploymentName(baseUri: string = document.baseURI): DeploymentName {
  if (isTestBuild(baseUri)) {
    return 'test';
  }
  return isCanaryBuild(baseUri) ? 'canary' : 'production';
}

/**
 * Identify the exact UI bundle before any feature diagnostics are emitted.
 *
 * Pages hosts three builds on one branch. A canary/test publish advances the
 * branch timestamp without replacing production, so response dates cannot
 * prove which source commit is running. Put the stamped commit directly in
 * every console paste instead. The base URI is safe; unlike location.href it
 * never contains a route query string.
 */
export function logBuildDiagnostics(
  info: BuildInfo = BUILD_INFO,
  baseUri: string = document.baseURI,
): void {
  console.info('[Mockingbird Build] boot', {
    deployment: deploymentName(baseUri),
    commit: info.commit ?? 'dev',
    builtAt: info.builtAt,
    baseUri,
    runUrl: info.runUrl,
  });
}
