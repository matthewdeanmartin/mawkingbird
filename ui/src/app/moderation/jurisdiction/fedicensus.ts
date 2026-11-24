import { jurisdictionHost } from './jurisdiction';

/**
 * What a server's own policies mention, as found by Fedicensus: evidence about
 * jurisdiction, not a finding. Used only where our own extraction has no answer
 * (scripts/import-fedicensus.mjs says what is kept and why).
 */
export interface FedicensusRecord {
  /** ISO 3166-1 alpha-2 codes, plus `EU`. */
  places?: string[];
  /** Laws by name: "Digital Services Act". */
  laws?: string[];
  /** Organisations: "Mastodon GmbH". */
  names?: string[];
}

export interface FedicensusFile {
  /** ISO date of the census. */
  date: string;
  servers: Record<string, FedicensusRecord>;
}

/** The census, loaded on first use: only someone about to report needs it. */
export function loadFedicensus(): Promise<FedicensusFile> {
  return import('./fedicensus.generated.json').then(
    (m) => ((m as { default?: unknown }).default ?? m) as FedicensusFile,
  );
}

export function fedicensusFor(
  file: FedicensusFile,
  serverOrUrl: string,
): FedicensusRecord | undefined {
  const host = jurisdictionHost(serverOrUrl);
  return Object.hasOwn(file.servers, host) ? file.servers[host] : undefined;
}

/** "Germany" for `DE`, in the reader's language; the code where that is unknown. */
export function placeNames(codes: readonly string[], lang: string): string[] {
  try {
    const names = new Intl.DisplayNames([lang], { type: 'region' });
    return codes.map((code) => names.of(code) ?? code);
  } catch {
    return [...codes];
  }
}

/** "Germany and Finland", in the reader's language. */
export function joinNames(names: readonly string[], lang: string): string {
  try {
    return new Intl.ListFormat([lang], { type: 'conjunction' }).format(names);
  } catch {
    return names.join(', ');
  }
}
