/** Native-only account capabilities. Browser builds provide null. */
export interface NativeSocial {
  blueskyLogin(identifier: string): Promise<{
    nativeHandle: string;
    profile: {
      service: string;
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
  }>;
  blueskyFetch(handle: string, url: string, init?: RequestInit): Promise<Response>;
  misskeyLogin(server: string): Promise<{
    token: string;
    permissions: string[];
    user: {
      id: string;
      username: string;
      name: string | null;
      avatarUrl: string | null;
      emojis?: Record<string, string>;
    };
  }>;
}
