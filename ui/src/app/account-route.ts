/**
 * Account URLs that survive changing servers.
 *
 * An account id only means something on the server that issued it. The same
 * person is 109655875667638018 on mastodon.social and 109656717715863645 on
 * fosstodon — and worse than 404ing, a *short* id from one server frequently
 * resolves to a real but completely different account on another. That failure
 * is silent: the page loads, the name is wrong, and nothing looks broken.
 *
 * So the handle rides in the path, not in a query param: params get dropped by
 * link shorteners, truncated pastes and hand-typed URLs, and the id alone is a
 * trap. The shape follows Elk's, which readers already recognise:
 *
 *   /accounts/@alice@example.social            handle only — always safe
 *   /accounts/109655875667638018/@alice@example.social   id first, handle wins on mismatch
 *
 * The id is kept because it is the fast path: when it is valid for the current
 * server, the profile loads in one call with no lookup. The handle is what
 * makes it recoverable when it isn't.
 */

/** An account address parsed out of the route. At least one field is present. */
export interface AccountRouteRef {
  /** Server-issued id, when the URL carried one. */
  id?: string;
  /** Fully-qualified `user@host` handle, without the leading '@'. */
  handle?: string;
}

/** True for a segment that is a bare Mastodon-style id (digits only). */
function isId(segment: string): boolean {
  return /^\d+$/.test(segment);
}

/**
 * Parse the `:id` route segment, which may be a bare id, a handle, or both.
 *
 * Angular gives us the segments already URL-decoded. A handle is recognised by
 * its leading '@' rather than by position, so `@alice@host/123` and
 * `123/@alice@host` both parse — readers reorder these by hand.
 *
 * Returns null for anything that is neither, leaving synthetic ids (`bsky:`,
 * `rss:`, `eliza:self`, the base64 anonymous refs) to the handlers that own
 * them.
 */
export function parseAccountRoute(segments: string[]): AccountRouteRef | null {
  const ref: AccountRouteRef = {};
  for (const raw of segments) {
    const segment = raw.trim();
    if (!segment) {
      continue;
    }
    if (segment.startsWith('@')) {
      const handle = segment.slice(1);
      // A bare local handle ("@alice") cannot be resolved anywhere but the
      // server that wrote it, which is the problem this exists to solve — so
      // only a qualified one counts.
      if (handle.includes('@')) {
        ref.handle = handle;
      }
      continue;
    }
    if (isId(segment)) {
      ref.id = segment;
    }
  }
  return ref.id || ref.handle ? ref : null;
}

/**
 * Build the canonical route for an account: id first, handle second.
 *
 * Both when we have both — the id makes the common case one call, the handle
 * makes it survivable. Handle alone when there is no usable id, which still
 * resolves everywhere via lookup.
 */
export function accountRoutePath(ref: AccountRouteRef): (string | number)[] {
  const parts: (string | number)[] = ['/accounts'];
  if (ref.id) {
    parts.push(ref.id);
  }
  if (ref.handle) {
    parts.push(`@${ref.handle}`);
  }
  return parts;
}
