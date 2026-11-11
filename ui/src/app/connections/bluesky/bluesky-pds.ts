import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, of, tap } from 'rxjs';
import { externalFetch } from '../../platform/http/external-fetch';
import { BlueskySession } from './bluesky-session';

interface DidDocument {
  service?: { id: string; type: string; serviceEndpoint: string }[];
}

/**
 * The linked account's real PDS host.
 *
 * Some calls only work there, not on the bsky.social entryway: proxied chat
 * calls 501 on the entryway, and a video upload's service token must name the
 * PDS itself as its audience. The DID document's `#atproto_pds` endpoint is
 * resolved once and remembered on the session.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyPds {
  private http = inject(HttpClient);
  private session = inject(BlueskySession);

  resolve(): Observable<string> {
    const session = this.session.session();
    if (!session) {
      return of(''); // BlueskyApi raises the "not linked" error downstream
    }
    if (session.pdsUrl) {
      return of(session.pdsUrl);
    }
    if (!session.did.startsWith('did:plc:')) {
      return of(session.service); // did:web etc. — let the entryway try
    }
    return this.http
      .get<DidDocument>(`https://plc.directory/${session.did}`, { context: externalFetch() })
      .pipe(
        map(
          (doc) =>
            doc.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint ?? session.service,
        ),
        tap((url) => this.session.setPdsUrl(url)),
      );
  }
}
