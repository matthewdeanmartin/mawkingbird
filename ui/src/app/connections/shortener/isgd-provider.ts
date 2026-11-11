import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { LinkProviderError, LinkProviderErrorCode, unsupported } from './shortener-errors';
import {
  CreateLinkInput,
  Page,
  ShortenerCapabilities,
  ShortenerProvider,
  ShortLink,
  assertValidDestination,
} from './shortener-provider';
import { ShortenerTransport } from './shortener-transport';

/**
 * is.gd.
 *
 * The simplest provider here by a wide margin, and deliberately so: no accounts
 * exist, so there is nothing to sign up for, nothing to store, and nothing that
 * can leak. You can create a link and that is the entire surface — is.gd has no
 * concept of "your" links, so listing, editing and deleting are not features it
 * withholds from free users, they do not exist for anyone.
 *
 * Every operation but create therefore returns `UNSUPPORTED_OPERATION`, and
 * {@link capabilities} reports the truth so the Links page renders is.gd rows
 * read-only rather than showing buttons that cannot work.
 *
 * ## The CORS situation
 *
 * is.gd answers browsers directly, and this entry is marked `corsOpen` in the
 * catalog so the transport never offers a proxy for it. Measured 2026-08-14
 * from a browser origin: a successful create sends
 * `Access-Control-Allow-Origin: *`, and so does every *documented* error — the
 * JSON `{"errorcode": 1, "errormessage": "Please enter a valid URL to shorten"}`
 * shape carries the header too. `format=json` selects the body shape and does
 * not affect CORS.
 *
 * An earlier version of this comment said the opposite, on the strength of a
 * create that failed opaquely. That observation was real but the conclusion was
 * wrong, and the mistake is worth recording because it is easy to repeat: is.gd
 * has exactly one response that omits the header, and it is undocumented —
 * `Error, database insert failed`, plain text with a `200` status. A browser
 * cannot read that, so it looks like `status: 0`, which is indistinguishable
 * from CORS.
 *
 * ## The service does not currently create links
 *
 * Stated plainly because it decides whether this provider is worth offering.
 * Measured repeatedly on 2026-08-14: **every** create for a URL is.gd has not
 * seen before fails with `Error, database insert failed` — across `format=json`,
 * `format=simple` and the bare form, and on `v.gd` (the same operator's sibling
 * domain) too. The only creates that succeed are ones where the destination is
 * already in their database, which is a lookup of an existing link rather than
 * an insert, and is why this looked intermittent at first.
 *
 * So this is not a passing outage to wait out. Until inserts work again, is.gd
 * can only hand back links it already had.
 *
 * ## The bug this produced
 *
 * Their broken insert → a response with no CORS header → an opaque failure → the
 * app inferring CORS → offering the proxy → the proxy (correctly) having no route
 * to is.gd → `403` → "This key is not allowed to do that", shown for a service
 * with no accounts and no keys. Four hops of confident inference from one
 * ambiguous signal, ending in advice about a credential that cannot exist.
 *
 * The general lesson, which applies well beyond this file: **CORS headers vary
 * by endpoint and by status code within one API**, and error paths drop them far
 * more often than success paths. "This service is CORS-open" is a claim about
 * the responses it means to send, never a guarantee about every byte it can
 * emit — so an opaque failure is not, on its own, evidence for a proxy.
 */

const CREATE_URL = 'https://is.gd/create.php';

interface IsgdResponse {
  shorturl?: string;
  errorcode?: number;
  errormessage?: string;
}

/**
 * is.gd answers `200` with an error body rather than an HTTP error status, so
 * failures are detected by shape, not by code. Its documented error codes:
 * 1 = bad URL, 2 = bad custom slug (taken or invalid), 3 = rate limited,
 * 4 = service problem.
 */
function codeFor(errorcode: number | undefined): LinkProviderErrorCode {
  switch (errorcode) {
    case 1:
      return 'INVALID_DESTINATION';
    case 2:
      return 'SLUG_CONFLICT';
    case 3:
      return 'RATE_LIMITED';
    case 4:
      return 'PROVIDER_UNAVAILABLE';
    default:
      return 'UNKNOWN';
  }
}

@Injectable({ providedIn: 'root' })
export class IsgdProvider implements ShortenerProvider {
  private transport = inject(ShortenerTransport);

  readonly id = 'isgd' as const;
  readonly label = 'is.gd';

  capabilities(): ShortenerCapabilities {
    return {
      // A custom slug is the one option is.gd does offer anonymously.
      customSlug: true,
      customDomain: false,
      title: false,
      description: false,
      tags: false,
      expiry: false,
      password: false,
      archive: false,
      // Not "not implemented" — is.gd has no notion of link ownership at all.
      update: false,
      delete: false,
      textSearch: false,
      list: false,
    };
  }

  createLink(input: CreateLinkInput): Observable<ShortLink> {
    assertValidDestination(input.destinationUrl);
    const params = new URLSearchParams({
      format: 'json',
      url: input.destinationUrl,
    });
    if (input.slug) {
      params.set('shorturl', input.slug);
    }

    return (
      this.transport
        // `string` in the union deliberately: is.gd answers its undocumented
        // database failure as plain text, not JSON, so the parsed body is not
        // always the shape its docs promise.
        .request<IsgdResponse | string>(this.id, {
          method: 'GET',
          url: `${CREATE_URL}?${params.toString()}`,
          idempotent: false,
          // The query parameter already selects JSON, so no content-negotiation
          // header is needed. This does not imply that is.gd will allow CORS.
          simpleRequest: true,
        })
        .pipe(
          map((raw) => {
            const response = typeof raw === 'string' ? null : raw;
            // A 200 with an error body is the normal failure shape here.
            if (!response?.shorturl) {
              // The undocumented one, and the reason this branch is explicit.
              // While is.gd's database was failing it answered `200` with the
              // plain text `Error, database insert failed` — no JSON, no
              // `errorcode`, and (uniquely among its responses) no
              // `Access-Control-Allow-Origin`, so a browser sees only an opaque
              // failure. Left to the generic path this became "Something went
              // wrong talking to the service", which reads as our bug rather than
              // their outage.
              if (typeof raw === 'string' && /database|insert failed/i.test(raw)) {
                throw new LinkProviderError(
                  'PROVIDER_UNAVAILABLE',
                  'is.gd is refusing to store new links — it answers “database insert failed” for every new URL. Nothing on your side can fix this; pick another shortener.',
                  this.id,
                );
              }
              throw new LinkProviderError(
                codeFor(response?.errorcode),
                response?.errormessage || 'is.gd could not shorten that link.',
                this.id,
              );
            }
            const shortUrl = response.shorturl;
            const slug = shortUrl.replace(/^https?:\/\/is\.gd\//i, '');
            return {
              provider: this.id,
              // No server-side identity exists; the slug is all there is, and
              // nothing can be done with it afterwards.
              providerId: slug,
              shortUrl,
              destinationUrl: input.destinationUrl,
              slug,
              domain: 'is.gd',
              raw: response,
            } satisfies ShortLink;
          }),
        )
    );
  }

  updateLink(): Observable<ShortLink> {
    return throwError(() =>
      unsupported(this.id, 'is.gd links are anonymous and permanent — they cannot be edited.'),
    );
  }

  deleteLink(): Observable<void> {
    return throwError(() =>
      unsupported(this.id, 'is.gd links are anonymous and permanent — they cannot be deleted.'),
    );
  }

  getLink(): Observable<ShortLink> {
    return throwError(() =>
      unsupported(this.id, 'is.gd has no API for looking up a link you created.'),
    );
  }

  listLinks(): Observable<Page<ShortLink>> {
    return throwError(() =>
      unsupported(
        this.id,
        'is.gd has no accounts, so it cannot list your links. Mawkingbird shows the ones it made from this browser.',
      ),
    );
  }

  /**
   * Nothing to verify: there is no credential and no account.
   *
   * Reported as success so the connector page can mark is.gd usable without
   * firing a request — the only call it could make is a create, which would
   * leave a junk link behind every time the page was opened.
   */
  verify(): Observable<void> {
    return new Observable<void>((subscriber) => {
      subscriber.next();
      subscriber.complete();
    });
  }
}
