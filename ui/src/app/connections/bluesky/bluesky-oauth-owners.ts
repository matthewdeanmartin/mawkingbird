/** Other saved connector roles using this DID's shared OAuth grant. */
export function hasBlueskyOAuthConnector(did: string, excludingProfileKey?: string): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('mockingbird_bsky_profile') || key === excludingProfileKey) continue;
    try {
      const profile = JSON.parse(localStorage.getItem(key) ?? 'null');
      const credentials = JSON.parse(
        localStorage.getItem(
          key.replace('mockingbird_bsky_profile', 'mockingbird_bsky_credentials'),
        ) ?? 'null',
      );
      if (profile?.did === did && credentials?.authMethod === 'oauth') return true;
    } catch {
      // Invalid local markers do not own a grant.
    }
  }
  return false;
}
