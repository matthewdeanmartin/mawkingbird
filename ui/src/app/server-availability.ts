/** Result of checking both a Mastodon API and the media host it advertises. */
export interface ServerAvailability {
  status: 'available' | 'degraded' | 'unreachable';
  title: string;
  mediaUrl: string | null;
}

interface InstanceInfo {
  title?: string;
  thumbnail?: string | { url?: string };
  /** Mastodon v1 uses contact_account; v2 nests the same account under contact. */
  contact_account?: { avatar?: string; avatar_static?: string };
  contact?: { account?: { avatar?: string; avatar_static?: string } };
}

function advertisedMedia(info: InstanceInfo, baseUrl: string): string | null {
  const candidates = [
    typeof info.thumbnail === 'string' ? info.thumbnail : info.thumbnail?.url,
    info.contact_account?.avatar_static,
    info.contact_account?.avatar,
    info.contact?.account?.avatar_static,
    info.contact?.account?.avatar,
  ].filter((candidate): candidate is string => !!candidate && /^https?:\/\//.test(candidate));
  const baseOrigin = new URL(baseUrl).origin;
  return (
    candidates.find((candidate) => new URL(candidate).origin !== baseOrigin) ??
    candidates[0] ??
    null
  );
}

/**
 * Probe the public instance endpoint, then one representative image using a no-CORS
 * request. An opaque response is success: the browser only needs to be able to load
 * the bytes in an image element, not read them from JavaScript.
 */
export async function probeServerAvailability(
  baseUrl: string,
  searchSignal?: AbortSignal,
  timeoutMs = 6000,
): Promise<ServerAvailability> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = searchSignal ? AbortSignal.any([searchSignal, timeout]) : timeout;
  try {
    const response = await fetch(`${baseUrl}/api/v1/instance`, { signal });
    if (!response.ok) {
      return { status: 'unreachable', title: '', mediaUrl: null };
    }
    const info = (await response.json()) as InstanceInfo;
    const mediaUrl = advertisedMedia(info, baseUrl);
    const title = info.title?.trim() || new URL(baseUrl).host;
    if (!mediaUrl) {
      return { status: 'available', title, mediaUrl: null };
    }
    try {
      await fetch(mediaUrl, { mode: 'no-cors', signal });
      return { status: 'available', title, mediaUrl };
    } catch {
      return { status: 'degraded', title, mediaUrl };
    }
  } catch {
    return { status: 'unreachable', title: '', mediaUrl: null };
  }
}
