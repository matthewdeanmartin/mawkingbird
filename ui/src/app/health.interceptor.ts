import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { EXTERNAL_FETCH } from './providers/external-fetch';
import { ServerDegradation } from './server-degradation';
import { ServerHealth } from './server-health';
import { SERVER_ROLE, whales } from './server-role';

/**
 * Watches API traffic to drive the fail-whale overlay.
 *
 * **Only status 0 marks the server down.** Status 0 is the browser saying no
 * response arrived at all — DNS failure, TLS rejection, CORS block, the device
 * being offline — which is precisely the claim the whale makes ("can't reach
 * the server"). Anything with a status attached, 5xx included, means the server
 * answered and is therefore reachable; it clears the down state like any other
 * response.
 *
 * A 5xx used to raise the whale too, and that was wrong in both directions. It
 * blanked the whole app for one failed call — adding somebody to a list, say —
 * and then dismissed itself the moment any unrelated background request
 * succeeded, so the user got a full-screen alarm that vanished before it could
 * be read, about an action whose actual failure was never reported. Failed API
 * calls are ordinary; the surface for one is an inline message next to the
 * thing that failed, which is the pattern the rest of the app already uses.
 *
 * Nothing is lost by not whaling on a 5xx: `metricsInterceptor` records every
 * failed call for the Observability page regardless of what happens here.
 */
export const healthInterceptor: HttpInterceptorFn = (req, next) => {
  // Foreign-host fetches (RSS feeds etc.) say nothing about the instance's health.
  if (req.context.get(EXTERNAL_FETCH)) {
    return next(req);
  }
  const role = req.context.get(SERVER_ROLE);
  const health = inject(ServerHealth);
  const degraded = inject(ServerDegradation);

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          if (whales(role)) {
            health.markUp();
          }
          degraded.markUp(role);
        }
      },
      error: (err) => {
        const unreachable = err instanceof HttpErrorResponse && err.status === 0;
        if (!unreachable) {
          // The server answered — 4xx, 5xx, auth, anything with a status. That
          // call failed, and its caller reports it; the *server* is reachable.
          if (whales(role)) {
            health.markUp();
          }
          degraded.markUp(role);
          return;
        }
        // Unreachable, but only the home server stops the app. A dead search
        // index, a hashtag endpoint the instance refuses anonymously, or one
        // followed account's instance being blocked are all normal weather —
        // they degrade a feature in place rather than blanking the screen.
        if (whales(role)) {
          health.markDown(err);
        } else {
          degraded.markDown(role, err);
        }
      },
    }),
  );
};
