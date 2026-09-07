# Spec files share one jsdom realm

A note for maintainers about a class of test failure that looks like flakiness
and isn't. Read the triage rule if you're in a hurry; the rest explains why.

## Triage rule

**If an entire spec file fails intermittently, but passes when you run it alone,
suspect a leaked global — not timing.**

```bash
npx ng test --no-watch --include src/app/the-noisy-one.spec.ts
```

Passing in isolation and failing in the full suite is the signature. Do not
re-run and move on: the cause is in a _different_ file, and it will come back.

## Symptom

Three unrelated specs — `rate-limit.interceptor.spec.ts`, `streaming.spec.ts`,
and `shell/right-rail/right-rail.spec.ts` — each failed **wholesale** (every test
in the file at once) on roughly 40% of full-suite runs. Never the same file twice
in a row, never in isolation, and never with an error that pointed anywhere
useful:

```
AssertionError: expected '/anonymous?elekk.xyz'
                to be 'undefined/anonymous?elekk.xyz'
```

That `undefined` is the whole story: `location.origin` was undefined, in a test
that never touches `location`.

## Cause

The Angular unit-test builder hard-codes `isolate: false` for Vitest. From
`node_modules/@angular/build/src/builders/unit-test/runners/vitest/plugins.js`:

```js
const projectDefaults = {
  test: {
    setupFiles,
    globals: true,
    // Default to `false` to align with the Karma/Jasmine experience.
    isolate: false,
    ...
```

Every spec file assigned to a worker therefore shares **one jsdom realm and one
module registry**. `window`, `location`, `globalThis.WebSocket`, `fetch` — all of
it is shared mutable state that outlives the file that touched it.

Two specs replaced `window.location` and never put it back:

- `pages/login/login.spec.ts` swapped in `{ set href(v) {…} }` to observe the
  OAuth redirect without navigating. That object has no `origin`.
- `update-recovery.spec.ts` used `{ ...window.location, reload: spy }` to stop a
  real reload. The spread copies **nothing** (see the jsdom trap below), so that
  object had no `origin` either.

From that point on, every later file in the same worker saw a `location` with no
`origin`, which breaks anything building an absolute URL:

| File                        | Code                                 | Failure                                                                                |
| --------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `rate-limit.interceptor.ts` | `new URL(req.url, location.origin)`  | throws `Invalid URL`, so the request is never dispatched and `expectOne` finds nothing |
| `streaming.ts`              | `toWs(location.origin)`              | no socket is ever constructed, so `lastSocket()` is `undefined`                        |
| `right-rail`                | `` `${location.origin}/anonymous` `` | interpolates the literal string `"undefined"`                                          |

### Why it looked random

Vitest distributes files across workers by timing, so **which** files land in the
same worker — and in what order — changes run to run. The victim was whichever
file happened to be scheduled after a poisoner. That is the entire explanation
for the apparent randomness. There was nothing timing-dependent in any of the
three failing specs.

The cost of this shape of bug is that the symptom appears arbitrarily far from
the cause, so it reads as "flaky infrastructure" and gets re-run rather than
fixed. It survived a long time for exactly that reason.

## The jsdom `Location` trap

Neither obvious way of copying `window.location` works, and both fail _silently_
in the file that does it:

```ts
// Copies nothing. Location's properties are WebIDL accessors on the prototype,
// not own enumerable data properties.
const stub = { ...window.location };

// Getters throw:
//   TypeError: 'get origin' called on an object that is not a valid
//   instance of Location
// The generated IDL getters brand-check `this`.
const stub = Object.create(window.location, { reload: { value: spy } });
```

The only reliable approach is to read the values off the real object and copy
them onto a plain one. That is what `src/app/testing/stub-location.ts` does.

## What is in place now

**`src/test-setup.ts`** captures the pristine `location` descriptor before any
spec runs and restores it before _every_ test. A forgotten cleanup now breaks
only the test that forgot, so the failure lands on the culprit instead of a
stranger. The descriptor is stashed on `globalThis` rather than in a module
const, because the builder can execute the setup file more than once per worker
— a plain const would be re-captured after the damage was done.

**`src/app/testing/stub-location.ts`** is the supported way to stub `location`:

```ts
import { stubLocation } from '../../testing/stub-location';

stubLocation({ onHref: hrefSpy }); // intercept a redirect
stubLocation({ onReload: reloadSpy }); // intercept a reload
```

It returns a complete `location` (origin included) and does not need explicit
teardown — `test-setup.ts` removes it before the next test.

## Rules for writing specs

- **Do not hand-roll a `location` stub.** Use `stubLocation`.
- **Restore any other global you mutate, in an `afterEach`** — and put the
  restore _first_, before anything that can throw. `rate-limit.interceptor.spec`
  had `httpMock.verify()` ahead of `vi.useRealTimers()`; because a throwing
  `afterEach` skips its own remainder, a verify failure would have left the clock
  frozen for the rest of the file.
- **Prefer `vi.stubGlobal`** over `Object.defineProperty(window, …)` where it
  works — Vitest tracks and unwinds those for you.
- **Assume module-level state persists across files.** A module-scope `let`,
  cache, or signal is shared by every spec in the worker. Root-provided Angular
  services are fine: `TestBed` builds a fresh injector per test.
- **Fake timers are safe across files.** Verified with a two-file probe: Vitest
  restores them between files even under `isolate: false`. They are still not
  safe _within_ a file if an `afterEach` throws before restoring them.

## Diagnosing the next one

Guessing is expensive; instrument instead. The trick is to catch the test that
_breaks_ the global rather than the one that trips over it. Add a temporary hook
to `src/test-setup.ts`:

```ts
afterEach(() => {
  if (typeof location?.origin !== 'string') {
    console.error('LOCATION-BROKEN-AFTER:', expect.getState().currentTestName);
  }
});
```

Then loop the suite until it prints:

```bash
for i in $(seq 1 10); do
  npx ng test --no-watch > /tmp/p$i.log 2>&1
  grep -qa "LOCATION-BROKEN-AFTER" /tmp/p$i.log && { echo "run $i"; break; }
done
```

Substitute whichever global you suspect. Two things worth doing before you build
on a theory:

1. **Write a probe that can disprove it.** Two throwaway spec files — one that
   leaks the global, one that asserts it is clean — settle a cross-file question
   in one run. That is how fake timers were ruled out here, before any time went
   into a fix that would not have worked.
2. **Get the real error text before theorising.** Looping the suite to capture an
   actual failure took a few minutes and pointed straight at `location`; the
   hours before that produced four plausible hypotheses, all wrong.

## Verifying a fix

The failure rate was roughly 40% (5 failures in 12 runs), so a single green run
proves nothing. Loop it:

```bash
for i in $(seq 1 16); do
  npx ng test --no-watch > /tmp/v$i.log 2>&1
  grep -qa "Failed Tests" /tmp/v$i.log && echo "RUN $i FAILED" || echo "run $i passed"
done
```

At a 40% base rate, sixteen consecutive clean runs puts the odds of having missed
it at well under one in a thousand.
