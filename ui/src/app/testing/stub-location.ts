/**
 * Replace `window.location` for the duration of one test.
 *
 * jsdom will not navigate to another document and will not let `location.href`
 * assignment or `location.reload()` be spied on in place, so a test that wants
 * to observe a redirect has to swap the whole object out.
 *
 * Two things make that sharp, and this helper exists to blunt both:
 *
 *  - `Location`'s properties are WebIDL accessors with a brand check, so they
 *    read correctly only when `this` is the genuine object. Neither spreading
 *    (`{ ...location }`, which copies nothing) nor inheriting
 *    (`Object.create(location)`, whose getters throw "called on an object that
 *    is not a valid instance of Location") produces a usable stand-in. Values
 *    have to be read off the real object and copied.
 *  - Spec files share one jsdom realm (the Angular unit-test builder sets
 *    `isolate: false`), so a stub missing `origin` breaks every later file in
 *    that worker that builds an absolute URL, far from where it was installed.
 *    `src/test-setup.ts` restores the real `location` before each test; keeping
 *    the stub complete means nothing breaks while it *is* installed either.
 */
const COPIED_KEYS = [
  'href',
  'origin',
  'protocol',
  'host',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
] as const;

export interface LocationStubOptions {
  /** Called instead of navigating when code assigns `location.href`. */
  onHref?: (url: string) => void;
  /** Called instead of navigating when code calls `location.assign(url)`. */
  onAssign?: (url: string) => void;
  /** Called instead of reloading when code calls `location.reload()`. */
  onReload?: () => void;
}

/** Install the stub. `src/test-setup.ts` removes it before the next test. */
export function stubLocation(options: LocationStubOptions = {}): void {
  const real = window.location;
  const stub: Record<string, unknown> = {};
  for (const key of COPIED_KEYS) {
    stub[key] = real[key];
  }
  stub['toString'] = () => real.href;
  stub['assign'] = options.onAssign ?? (() => undefined);
  stub['replace'] = () => undefined;
  stub['reload'] = options.onReload ?? (() => undefined);
  if (options.onHref) {
    const onHref = options.onHref;
    Object.defineProperty(stub, 'href', {
      configurable: true,
      get: () => real.href,
      set: onHref,
    });
  }

  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: stub as unknown as Location,
  });
}
