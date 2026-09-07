import { Observable } from 'rxjs';
import { Status } from '../../models';

export type PasteVisibility = 'public' | 'unlisted';
export type PasteExpiry = 'never' | '10m' | '1h' | '1d' | '1w' | '1mo' | 'burn';

export interface PasteLanguage {
  value: string;
  label: string;
}

export interface PasteExpiryOption {
  value: PasteExpiry;
  label: string;
}

export interface PasteCreateInput {
  title: string;
  content: string;
  language: string;
  expiry: PasteExpiry;
  visibility: PasteVisibility;
}

export interface PasteCreated {
  slug: string;
  url: string;
  rawUrl: string;
  editKey: string;
}

export interface PasteRecentItem {
  slug: string;
  title: string | null;
  language: string;
  preview: string;
  createdAt: string;
  url: string;
  rawUrl: string;
}

/** Browser-facing contract for one anonymous paste service. */
export interface PasteProvider {
  readonly id: string;
  readonly label: string;
  /** True when the service cannot edit or delete a paste after it is created. */
  readonly immutable?: boolean;
  readonly feedUrl?: string;
  readonly languages: readonly PasteLanguage[];
  readonly expiries: readonly PasteExpiryOption[];
  readonly visibilities: readonly PasteVisibility[];
  create(input: PasteCreateInput): Observable<PasteCreated>;
  update(
    slug: string,
    editKey: string,
    input: Pick<PasteCreateInput, 'title' | 'content' | 'language'>,
  ): Observable<void>;
  delete(slug: string, editKey: string): Observable<void>;
  recent?(): Observable<PasteRecentItem[]>;
  status(item: PasteRecentItem): Status;
}

/** Paste provider with an opt-in global public feed. */
export interface FeedPasteProvider extends PasteProvider {
  readonly feedUrl: string;
  recent(): Observable<PasteRecentItem[]>;
  status(item: PasteRecentItem): Status;
}
