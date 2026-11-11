/** The profile marker remains, but OAuth can no longer restore usable credentials. */
export class BlueskySignInRequiredError extends Error {
  override readonly name = 'BlueskySignInRequiredError';

  constructor(cause: unknown) {
    super('The saved Bluesky session is missing or no longer valid. Sign in again.', { cause });
  }
}
