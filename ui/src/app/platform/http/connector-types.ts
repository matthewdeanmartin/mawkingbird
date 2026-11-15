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

export interface NativeIntelligenceTransport {
  login(): Promise<string>;
  request(input: {
    url: string;
    method: 'GET' | 'POST';
    body?: string;
  }): Promise<{ status: number; body: string; headers: Record<string, string> }>;
}
