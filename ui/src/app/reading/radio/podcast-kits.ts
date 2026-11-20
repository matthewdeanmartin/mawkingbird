import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

export type PodcastMediaKind = 'native' | 'full-player' | 'outgoing' | 'short';

export interface PodcastMedia {
  kind: PodcastMediaKind;
  source: string;
  postUrl: string;
  seenAt: string;
}

export interface PodcastMember {
  acct: string;
  url: string | null;
  displayName: string;
  avatar: string | null;
  bot: boolean;
  bio: string;
  showUrl: string | null;
  observedAt: string | null;
  media: PodcastMedia[];
}

export interface PodcastPack {
  version: 1;
  kind: 'podcasts';
  category: string;
  lang: string;
  title: Record<string, string>;
  icon: string | null;
  generatedAt: string;
  members: PodcastMember[];
}

export interface PodcastIndex {
  version: 1;
  generatedAt: string;
  languages: Record<string, number>;
  packs: {
    category: string;
    lang: string;
    size: number;
    path: string;
    title: Record<string, string>;
    icon: string | null;
  }[];
}

/** Loads the catalogue on demand, outside the initial app bundle. */
@Injectable({ providedIn: 'root' })
export class PodcastKits {
  private readonly document = inject(DOCUMENT);
  private indexPromise?: Promise<PodcastIndex>;
  private readonly files = new Map<string, Promise<PodcastPack>>();

  index(): Promise<PodcastIndex> {
    this.indexPromise ??= this.read<PodcastIndex>('index.json');
    return this.indexPromise;
  }

  pack(path: string): Promise<PodcastPack> {
    if (!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?\/[a-z0-9-]+\.json$/.test(path))
      return Promise.reject(new Error('Invalid kit path'));
    let file = this.files.get(path);
    if (!file) {
      file = this.read<PodcastPack>(path);
      this.files.set(path, file);
    }
    return file;
  }

  private async read<T>(path: string): Promise<T> {
    const url = new URL(`podcast-kits/${path}`, this.document.baseURI);
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`Podcast kits: ${response.status}`);
    return (await response.json()) as T;
  }
}
