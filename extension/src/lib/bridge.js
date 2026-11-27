import { allowedType, checkTarget, MAX_BODY_BYTES, TIMEOUT_MS } from './fetch-guard.js';

/**
 * The bridge's request handling, with the browser APIs passed in so it can be
 * tested in Node. The background script wires it to `runtime.onMessage`;
 * `bridge/content.js` relays mawkingbird.com's `window.postMessage` requests to
 * it. Protocol: extension/client/PROTOCOL.md.
 */

export const PROTOCOL = 'mawkingbird-extension/1';

/** Every public site, for the opt-in "any public site" switch (bulk RSS features). */
export const ALL_SITES = '*://*/*';

/**
 * YouTube's own web-client API, the same four anonymous reads Native allows
 * (native/src-tauri/src/youtube.rs): search, browse (channels), player
 * (details), next (comments, chapters). Fixed host and paths; JSON bodies.
 */
export const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const YOUTUBE_ENDPOINTS = new Set(['search', 'browse', 'player', 'next']);
const YOUTUBE_MAX_REQUEST_BYTES = 64 * 1024;
const YOUTUBE_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/** Stream URLs and ads never reach the app: it plays through YouTube's embed. */
const PLAYER_STRIPPED = ['streamingData', 'playerAds', 'adPlacements', 'adSlots'];

/** Only the configured Mawkingbird, never another site the content script is on. */
export function fromMawkingbird(senderUrl, base) {
  try {
    const sender = new URL(senderUrl);
    const home = new URL(base);
    return sender.origin === home.origin && sender.pathname.startsWith(home.pathname);
  } catch {
    return false;
  }
}

/** The host-permission pattern for one site, as `permissions` APIs take it. */
export function originPattern(origin) {
  return `${origin}/*`;
}

/**
 * @param {object} message `{ op, url?, purpose?, origin? }` from the page.
 * @param {object} deps `{ fetch, hasPermission(pattern), requestAccess(origin), requestAllSites() }`.
 */
export async function handleBridgeRequest(message, deps) {
  switch (message?.op) {
    case 'hello':
      return { ok: true, protocol: PROTOCOL };
    case 'hasAccess': {
      const origin = siteOrigin(message.origin);
      if (!origin) return refused('Not a site.');
      return { ok: true, granted: await deps.hasPermission(originPattern(origin)) };
    }
    case 'requestAccess': {
      const origin = siteOrigin(message.origin);
      if (!origin) return refused('Not a site.');
      if (await deps.hasPermission(originPattern(origin))) return { ok: true, granted: true };
      return { ok: true, granted: await deps.requestAccess(origin) };
    }
    case 'fetch':
      return bridgeFetch(message, deps);
    case 'allSites':
      return { ok: true, granted: await deps.hasPermission(ALL_SITES) };
    case 'requestAllSites':
      if (await deps.hasPermission(ALL_SITES)) return { ok: true, granted: true };
      return { ok: true, granted: await deps.requestAllSites() };
    case 'youtube':
      return youtubeRead(message, deps);
    default:
      return refused('Unknown request.');
  }
}

async function bridgeFetch(message, deps) {
  const target = checkTarget(message.url, message.purpose);
  if (!target.ok) return target;
  if (!(await deps.hasPermission(originPattern(target.origin)))) {
    return { ok: false, error: 'needs-access', origin: target.origin };
  }
  let response;
  try {
    response = await deps.fetch(target.url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      headers: { Accept: acceptFor(message.purpose) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'TimeoutError' ? 'timeout' : 'network',
      detail: 'The site did not answer.',
    };
  }
  // A redirect must land somewhere the bridge would have fetched directly.
  const landed = checkTarget(response.url || target.url, message.purpose);
  if (!landed.ok) return landed;
  if (landed.origin !== target.origin && !(await deps.hasPermission(originPattern(landed.origin)))) {
    return { ok: false, error: 'needs-access', origin: landed.origin };
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!allowedType(message.purpose, contentType)) {
    return { ok: false, error: 'type', detail: `Unexpected ${contentType.split(';')[0]}.` };
  }
  const body = await readCapped(response, MAX_BODY_BYTES);
  if (body === null) return { ok: false, error: 'too-large', detail: 'Over 5 MiB.' };
  return {
    ok: true,
    status: response.status,
    finalUrl: landed.url,
    contentType,
    body,
  };
}

/**
 * One anonymous YouTube web-client read. Refuses (rather than drops) any header
 * but the three web-client identification ones, so an app bug can't pass a
 * cookie or authorization through unnoticed.
 */
async function youtubeRead(message, deps) {
  const endpoint = String(message.endpoint ?? '');
  if (!YOUTUBE_ENDPOINTS.has(endpoint)) return refused('This YouTube request is not allowed.');
  const body = typeof message.body === 'string' ? message.body : '';
  if (new TextEncoder().encode(body).length > YOUTUBE_MAX_REQUEST_BYTES) {
    return refused('YouTube request is too large.');
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
  } catch {
    return refused('YouTube request must be a JSON object.');
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  for (const pair of Array.isArray(message.headers) ? message.headers : []) {
    const [name, value] = Array.isArray(pair) ? pair.map(String) : ['', ''];
    if (!youtubeHeaderAllowed(name, value)) return refused('This YouTube request header is not allowed.');
    headers[name] = value;
  }
  if (!(await deps.hasPermission(originPattern(YOUTUBE_ORIGIN)))) {
    return { ok: false, error: 'needs-access', origin: YOUTUBE_ORIGIN };
  }
  let response;
  try {
    response = await deps.fetch(`${YOUTUBE_ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'TimeoutError' ? 'timeout' : 'network',
      detail: 'YouTube did not answer.',
    };
  }
  const text = await readCapped(response, YOUTUBE_MAX_RESPONSE_BYTES);
  if (text === null) return { ok: false, error: 'too-large', detail: 'YouTube answered too much.' };
  if (!response.ok) {
    return { ok: false, error: 'network', detail: `YouTube answered ${response.status}.`, status: response.status };
  }
  if (endpoint !== 'player') return { ok: true, status: response.status, body: text };
  try {
    const value = JSON.parse(text);
    for (const key of PLAYER_STRIPPED) delete value[key];
    return { ok: true, status: response.status, body: JSON.stringify(value) };
  } catch {
    return { ok: false, error: 'type', detail: 'YouTube returned unreadable video details.' };
  }
}

/** The same rules as Native's `client_header`. */
export function youtubeHeaderAllowed(name, value) {
  switch (name.toLowerCase()) {
    case 'x-youtube-client-name':
      return value.length <= 4 && /^\d+$/.test(value);
    case 'x-youtube-client-version':
      return value.length <= 32 && /^[\d.]+$/.test(value);
    case 'x-goog-visitor-id':
      return value.length <= 128 && /^[A-Za-z0-9\-_%=]+$/.test(value);
    default:
      return false;
  }
}

/** The response text, or null once it passes `limit` bytes (read stops there). */
export async function readCapped(response, limit) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!response.body?.getReader) {
    const text = await response.text();
    return new TextEncoder().encode(text).length > limit ? null : text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder(charsetOf(response.headers.get('content-type'))).decode(bytes);
}

function charsetOf(contentType) {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  try {
    return charset ? new TextDecoder(charset).encoding : 'utf-8';
  } catch {
    return 'utf-8';
  }
}

function acceptFor(purpose) {
  if (purpose === 'feed') {
    return 'application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, */*;q=0.5';
  }
  if (purpose === 'json') return 'application/json, application/activity+json;q=0.9';
  return 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5';
}

/** `https://example.com` from an origin or any URL on it; null for anything else. */
function siteOrigin(value) {
  const target = checkTarget(value, 'article');
  return target.ok ? target.origin : null;
}

function refused(detail) {
  return { ok: false, error: 'refused', detail };
}
