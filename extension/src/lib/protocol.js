/**
 * Versions of the two conversations between the extension and mawkingbird.com.
 * The record is extension/protocol.json; ui/scripts/check-extension-protocol.mjs
 * fails the build when these drift from it, or from the app's copies.
 *
 * Rule: bump a version when a message changes shape, and keep accepting the
 * version before it, so the web app and the add-on can deploy in either order.
 */

/** The bridge: mawkingbird.com asks the extension to read pages, feeds, YouTube. */
export const BRIDGE_PROTOCOL = 'mawkingbird-extension/1';
/** 1: 0.5–0.7 (hello without ops). 2: hello lists ops and the add-on's version. */
export const BRIDGE_VERSION = 2;
export const BRIDGE_OPS = Object.freeze([
  'hello',
  'fetch',
  'hasAccess',
  'requestAccess',
  'allSites',
  'requestAllSites',
  'youtube',
]);

/** The sidebar panel: the sidebar tells /panel which page is beside it. */
export const PANEL_CHANNEL = 'mawkingbird-panel/1';
/** 1: 0.7.0 (no versions in messages). 2: `ready` and `page` carry versions. */
export const PANEL_VERSION = 2;
/** The oldest panel (web app) this sidebar can drive. */
export const MIN_PANEL_VERSION = 1;

/**
 * Whether a panel's `ready` lets this sidebar drive it: its version (0.7.0 sent
 * none, which is version 1) is at least MIN_PANEL_VERSION.
 */
export function panelAccepted(ready) {
  const version = Number.isInteger(ready?.version) ? ready.version : 1;
  return version >= MIN_PANEL_VERSION;
}
