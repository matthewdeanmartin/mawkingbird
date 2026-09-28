const unavailable = (): never => {
  throw new Error(
    "OAuth is unavailable in design-system fixtures. Supply an in-memory service.",
  );
};
export class BrowserOAuthClient {
  constructor() {
    unavailable();
  }
  static load = unavailable;
}
export const buildLoopbackClientId = unavailable;
export class TokenRefreshError extends Error {}
export class TokenRevokedError extends Error {}
export class TokenInvalidError extends Error {}
