/** Fixed native connector contract. Raw keys enter only through connect. */
export type NativeConnectorProvider =
  | 'openrouter'
  | 'mataroa'
  | 'raindrop'
  | 'gist'
  | 'github'
  | 'dub'
  | 'shortio'
  | 'tly'
  | 'tinyurl'
  | 'rebrandly';
export interface NativeConnectorTransport {
  connect(
    provider: NativeConnectorProvider,
    token: string,
    handle?: string,
    workspace?: string,
    domain?: string,
  ): Promise<string>;
  forget(handle: string): Promise<void>;
  request(input: {
    provider: NativeConnectorProvider;
    handle: string;
    url: string;
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
    body?: unknown;
    workspace?: string;
  }): Promise<{ status: number; body: string; headers: Record<string, string> }>;
}
export function isNativeConnectorHandle(value: string): boolean {
  return /^native-connector:[A-Za-z0-9_-]{43}$/.test(value);
}

export interface NativeTwitterTransport {
  connect(token: string, previous?: string): Promise<string>;
  request(
    handle: string,
    url: string,
  ): Promise<{ status: number; body: string; headers: Record<string, string> }>;
  forget(handle: string): Promise<void>;
}
export function isNativeTwitterHandle(value: string): boolean {
  return /^native-twitter:[A-Za-z0-9_-]{43}$/.test(value);
}

export interface NativeWebmentionTransport {
  discover(
    url: string,
  ): Promise<{ status: number; finalUrl: string; link: string | null; body: string }>;
  send(
    endpoint: string,
    source: string,
    targetUrl: string,
  ): Promise<{ status: number; body: string }>;
}

export interface NativeHugoTransport {
  connect(
    token: string,
    repo: { owner: string; repo: string; branch: string; contentPath: string },
    handle?: string,
  ): Promise<{ handle: string; looksLikeHugo: boolean; postCount: number }>;
  request(input: {
    handle: string;
    url: string;
    method: 'GET' | 'PUT';
    body?: unknown;
  }): Promise<{ status: number; body: string; headers: Record<string, string> }>;
  forget(handle: string): Promise<void>;
}
export function isNativeHugoHandle(value: string): boolean {
  return /^native-hugo:[A-Za-z0-9_-]{43}$/.test(value);
}

/** Proxy modes for every native HTTP client (parity item 5). */
export type NativeProxyMode = 'direct' | 'windows' | 'http' | 'socks5';

export interface NativeProxyStatus {
  settings: { mode: NativeProxyMode; host: string; port: number; has_credentials: boolean };
  /** `host:port` actually in use; null when direct. */
  in_use: string | null;
  /** `pac` when Windows uses an automatic proxy script, which is not supported. */
  problem: 'pac' | null;
  windows_available: boolean;
}

export interface NativeNetworkTransport {
  status(): Promise<NativeProxyStatus>;
  /** Re-read the Windows proxy setting now. */
  refresh(): Promise<NativeProxyStatus>;
  set(input: {
    mode: NativeProxyMode;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
  }): Promise<NativeProxyStatus>;
}

/** "Check for updates" (parity item 3): a version comparison and a link, nothing installed. */
export interface NativeUpdateCheck {
  current: string;
  latest: string | null;
  update_available: boolean;
  notes: string | null;
  url: string | null;
}

export interface NativeUpdatesTransport {
  check(): Promise<NativeUpdateCheck>;
}

/** Save or copy an image the app already shows, through the native image transport (items 6, 10). */
export interface NativeMediaTransport {
  /** Resolves to the saved file name, or null when the user cancelled the dialog. */
  saveImage(url: string, fileName: string, alt: string | null): Promise<string | null>;
  copyImage(url: string): Promise<void>;
}

/** Text recognition on this computer, for drafting alt text (parity item 4). */
export interface NativeOcrTransport {
  available(): Promise<boolean>;
  /** `image` is the attached file's bytes, base64. */
  read(image: string): Promise<{ text: string; language: string | null }>;
}

/** A local OpenAI-compatible server on a loopback port (parity item 1). */
export interface NativeLocalAiTransport {
  status(): Promise<{ endpoint: string | null }>;
  setEndpoint(endpoint: string | null): Promise<{ endpoint: string | null }>;
  request(input: {
    path: '/v1/models' | '/v1/chat/completions';
    method: 'GET' | 'POST';
    body?: string;
  }): Promise<{ status: number; body: string }>;
}

export interface NativeIntelligenceTransport {
  login(): Promise<string>;
  request(input: {
    url: string;
    method: 'GET' | 'POST';
    body?: string;
  }): Promise<{ status: number; body: string; headers: Record<string, string> }>;
}
