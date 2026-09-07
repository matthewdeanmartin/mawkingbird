import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { externalFetch } from './providers/external-fetch';
import { importPortableConfig, parsePortableConfig, PortableConfig } from './portable-config';

const SYNC_KEY = 'mockingbird_config_sync';
const PASTEPILE_API = 'https://www.pastepile.com/api/public/pastes';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type ConfigSyncFrequency = 'manual' | 'daily' | 'weekly';

export interface ConfigSyncSettings {
  url: string;
  frequency: ConfigSyncFrequency;
  lastHash: string;
  lastCheckedAt: number;
  automaticAllowed: boolean;
  warning?: string;
}

export interface RemoteConfigResult {
  config: PortableConfig;
  hash: string;
  stable: boolean;
  warning?: string;
}

interface PastepileCreateResponse {
  slug: string;
  raw_url: string;
  url: string;
  edit_key: string;
}

function readSettings(): ConfigSyncSettings | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SYNC_KEY) ?? 'null',
    ) as Partial<ConfigSyncSettings> | null;
    if (
      parsed &&
      typeof parsed.url === 'string' &&
      (parsed.frequency === 'manual' ||
        parsed.frequency === 'daily' ||
        parsed.frequency === 'weekly') &&
      typeof parsed.lastHash === 'string' &&
      typeof parsed.lastCheckedAt === 'number' &&
      typeof parsed.automaticAllowed === 'boolean'
    ) {
      return parsed as ConfigSyncSettings;
    }
  } catch {
    // A damaged sync preference disables background access rather than guessing.
  }
  return null;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Remote portable-config checks and the deliberately keyless permanent Pastepile publisher. */
@Injectable({ providedIn: 'root' })
export class ConfigSync {
  private readonly http = inject(HttpClient);
  private timer: ReturnType<typeof setTimeout> | null = null;

  settings(): ConfigSyncSettings | null {
    return readSettings();
  }

  clear(): void {
    localStorage.removeItem(SYNC_KEY);
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  configure(url: string, frequency: ConfigSyncFrequency, result: RemoteConfigResult): void {
    const automaticAllowed = result.stable;
    const settings: ConfigSyncSettings = {
      url,
      frequency: automaticAllowed ? frequency : 'manual',
      lastHash: result.hash,
      lastCheckedAt: Date.now(),
      automaticAllowed,
      ...(result.warning ? { warning: result.warning } : {}),
    };
    localStorage.setItem(SYNC_KEY, JSON.stringify(settings));
    this.schedule();
  }

  /** Fetch twice without a browser cache. Automatic checks are allowed only when both bytes match. */
  async fetchStable(url: string): Promise<RemoteConfigResult> {
    const first = await this.fetchText(url);
    const config = parsePortableConfig(first);
    const firstHash = await sha256(first);
    try {
      const second = await this.fetchText(url);
      const secondHash = await sha256(second);
      if (firstHash !== secondHash) {
        return {
          config,
          hash: firstHash,
          stable: false,
          warning:
            'This URL returned different content on an immediate recheck. It can only be updated on demand.',
        };
      }
      parsePortableConfig(second);
      return { config, hash: firstHash, stable: true };
    } catch {
      return {
        config,
        hash: firstHash,
        stable: false,
        warning:
          'Mockingbird could not refetch this URL reliably. It can only be updated on demand.',
      };
    }
  }

  /** Create an anonymous, unlisted, never-expiring paste even when this browser has a Pastepile key. */
  async publishPermanent(
    content: string,
  ): Promise<{ slug: string; url: string; rawUrl: string; editKey: string }> {
    const created = await firstValueFrom(
      this.http.post<PastepileCreateResponse>(
        PASTEPILE_API,
        {
          title: 'Mockingbird client configuration',
          content,
          language: 'json',
          expiry: 'never',
          visibility: 'unlisted',
        },
        { context: externalFetch() },
      ),
    );
    return {
      slug: created.slug,
      url: created.url,
      rawUrl: created.raw_url,
      editKey: created.edit_key,
    };
  }

  start(): void {
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const settings = readSettings();
    if (!settings || settings.frequency === 'manual' || !settings.automaticAllowed) {
      return;
    }
    const interval = settings.frequency === 'daily' ? DAY_MS : WEEK_MS;
    const delay = Math.max(0, settings.lastCheckedAt + interval - Date.now());
    this.timer = setTimeout(() => void this.checkScheduled(), delay);
  }

  private async checkScheduled(): Promise<void> {
    const settings = readSettings();
    if (!settings || settings.frequency === 'manual' || !settings.automaticAllowed) {
      return;
    }
    try {
      const result = await this.fetchStable(settings.url);
      if (!result.stable) {
        this.configure(settings.url, 'manual', result);
        return;
      }
      const checked = { ...settings, lastCheckedAt: Date.now(), warning: undefined };
      localStorage.setItem(SYNC_KEY, JSON.stringify(checked));
      if (result.hash !== settings.lastHash) {
        const apply = confirm(
          'Your remote Mockingbird configuration changed. Import it now? This replaces the settings covered by that file.',
        );
        if (apply) {
          importPortableConfig(result.config, localStorage);
          localStorage.setItem(SYNC_KEY, JSON.stringify({ ...checked, lastHash: result.hash }));
          location.reload();
          return;
        }
      }
    } catch (error: unknown) {
      localStorage.setItem(
        SYNC_KEY,
        JSON.stringify({
          ...settings,
          lastCheckedAt: Date.now(),
          warning: error instanceof Error ? error.message : 'Remote configuration check failed.',
        }),
      );
    }
    this.schedule();
  }

  private async fetchText(url: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Enter a complete http:// or https:// URL.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Configuration URLs must use http:// or https://.');
    }
    const response = await fetch(parsed.href, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`Configuration URL answered ${response.status}.`);
    }
    return response.text();
  }
}
