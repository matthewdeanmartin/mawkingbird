/**
 * Let the RSS feed cache's asynchronous lookup settle inside a spec.
 *
 * `RssFetch` consults {@link RssCache} (IndexedDB) before touching the network,
 * so a feed request is no longer issued synchronously when a component loads —
 * it happens a few microtasks later, once the cache has answered. Specs that
 * drive `HttpTestingController` therefore have to yield before
 * `expectOne(...)`, or they look for a request that has not been made yet.
 *
 * Several turns rather than one: the lookup chains a handful of promises (open
 * the database, read the record, then decide), and in the test environment
 * IndexedDB is typically unavailable so each step resolves immediately but
 * still costs a turn.
 */
export async function settleRssCache(turns = 25): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}
