# Sprint 9 review: real dialog flows

[Open Sprint 9](http://127.0.0.1:6006/?path=/story/start-here-sprint-9-review--app-dialogs-review).

The shared confirmation/prompt surface, Leave dialog and Translate dialog now use
`MbDialog`. Existing caller results, service queuing, duplicate-decision guards,
consent, language selection and edited translation values are preserved.

## Try these flows

- **Destructive confirmation:** Cancel, Escape and backdrop clicks cancel; Remove
  confirms. Focus returns to its opener. The destructive button remains the
  existing variant pending separate shared-button review.
- **Editable prompt:** the initial value is retained, an empty value is valid,
  Enter submits, and Cancel returns null. Enter is consumed before dismissal so
  restored focus cannot accidentally activate the opener again.
- **Two queued decisions:** only one service dialog opens at a time. After the
  first decision, the second notice has its existing single OK action.
- **Nested confirmation:** Escape closes only the child. Focus returns into the
  parent, and scrolling stays locked until both dialogs close.
- **Legacy parent confirmation:** the old focus trap yields keyboard handling to
  a native child. This protects not-yet-migrated parents during adoption.
- **Leave options:** all original choices and their consequences remain. Simulated
  backup failure leaves the exit available. This preview never clears storage.
- **Translate a draft:** the first local attempt fails, retry succeeds, and the
  returned draft remains editable before Replace or Append. The language selector
  is disabled during work; dismissal remains available, as before.

Check light/dim themes, narrow screens and RTL. Long content scrolls inside the
modal. Actual production components are used with local services; confirmation
uses the real AppDialogs queue. No network writes, downloads or account changes
occur in the preview.

## Boundaries

Three production dialog implementations are adopted, including the shared
confirmation surface used by service and direct-template consumers. This does
not mean every dialog in the app is migrated. See the exact consumer list and
remaining work in the [audit](audits/09-dialog-adoption.md).

Effective Audience remains deferred: its 520px, four-metric results layout needs
a reviewed wide-dialog composition before replacing it with the current 440px
surface. Leave's consequence cards and the destructive confirmation button retain
their specialized styling; ordinary actions and translation fields use approved
widgets. Hover previews and checkable/radio menus remain outside this batch.

The manual Firefox/screen-reader checkpoint remains open for human review;
automated browser checks are not an assistive-technology sign-off.

## CI timing correction

The reported Sprint 7 failure was a race against a 350ms local fixture response.
The input was already re-enabled with its failure state by the time CI observed
it. Browser tests now hold the response clock while checking the pending state,
then advance it to verify rollback and retry. The same correction covers the
Sprint 8 form fixtures. No assertions, retries or production delays were weakened.

## Validation

- Targeted Angular checks: 59 tests passed, including service, focus trap, RSS
  unsubscribe, Leave and Translate behavior.
- Full `make test`: 7,595 passed; the runtime inventory reports none missing.
- Angular lint and design formatting/type/contract checks passed.
- `design:verify`: 182 Chromium browser tests passed.
- The 11 Sprint 9 browser tests also passed in Firefox using the dedicated
  catalogue test server. A run against the interactive preview server had a
  first-navigation timeout; the dedicated-server run passed without retries.
- Standalone production build passed: initial JavaScript/CSS 883.54 kB, below the
  unchanged 1 MB error budget. Existing stylesheet/CommonJS warnings remain.
- Packaged admin production build (`make build-admin`) also passed.
- Light/dim and narrow RTL screenshots were inspected. Browser coverage includes
  legacy parent keydown and keyup handlers, prompt Enter, nested scroll locks,
  busy cancellation, retained edits and error/retry flows.

The earlier Privacy test passed five consecutive focused runs, followed by the
complete browser gate. All pending-state assertions remain, with explicit clock
advancement rather than a longer real-time delay or retry setting.

## Subsequent review correction

The user accepted these dialogs to proceed and reported touching buttons in the
legacy-parent interoperability fixture. Sprint 10 adds the existing preview
spacing to that row. The old trap remains there specifically to test coexistence
during phase-out; it is not a new production pattern.
