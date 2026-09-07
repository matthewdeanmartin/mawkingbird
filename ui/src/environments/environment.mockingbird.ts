/**
 * "Mocking Bird" build flavor — a standalone, static-only Mastodon web client.
 *
 * Built with `ng build --configuration mockingbird` (see angular.json), which swaps this
 * file in for `environment.ts`. The output is pure static files (no Python backend); the
 * user points it at a real Mastodon instance and signs in via OAuth or a pasted token.
 *
 * All mock-server tooling is compiled out: no dev login, no sample-data seeding, no
 * fault injection. There is no "this server" default — an instance must be chosen.
 */
export const environment = {
  // The one user-facing name. It was 'Mocking Bird' here while index.html's
  // <title>, the first-run modal and the shell all said "Mawkingbird" — so the
  // login card and the browser tab disagreed on what this app is called, on the
  // two screens a stranger sees while deciding whether to trust it with an
  // account. Note this is *not* the `mockingbird_` localStorage prefix, which is
  // a separate thing and must not be renamed; see account-data.ts.
  brand: 'Mawkingbird',
  mockTooling: false,
  allowThisServer: false,
  /** Public OAuth client id. This is safe to include in the static browser bundle. */
  dropboxAppKey: 'tx5g7f50ty6r3df',
  /**
   * Public OAuth client id for Blogger (Google Cloud → Credentials → OAuth
   * client ID → Web application). Safe in the bundle; the client *secret* that
   * Google issues alongside it is not, and is not used — PKCE replaces it.
   *
   * Empty hides the connector. Filling it in also requires registering
   * `https://<this build's origin>/integrations/blogger/callback` as an
   * authorized redirect URI on that OAuth client, including a separate entry
   * for the /canary/ deployment.
   */
  bloggerClientId: '',
};
