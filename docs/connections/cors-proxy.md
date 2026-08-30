# Use the Mawkingbird proxy

Some public feeds and services will open in a tab but will not answer Mawkingbird directly. The Mawkingbird proxy retrieves those public items for Mawkingbird.

Most people do not need it. Set it up only when a connection page or [Connection Doctor](connection-doctor.md) says a proxy is required.

## Understand the privacy tradeoff

The proxy can see every address sent through it and the information returned.

Use it only for public information. Never use it for a private feed address containing a secret key. Mawkingbird refuses to send signed-in accounts through a proxy, but a secret embedded in an address would still be exposed.

## Turn it on and test it

1. Open **Settings → Connections → CORS proxy**.
2. Select **Mawkingbird proxy**.
3. Follow the page's Mawkingbird Plus instructions if they appear.
4. Choose **Save proxy**.
5. Choose **Test proxy**.

A successful test says **Works** and reports how long the request took. A slow proxy can make feeds feel sluggish.

If you were setting up another connection, return to that page and repeat its test. Some services refuse requests even from a working proxy.

## Stop using it

Choose **Stop using a proxy**.

Operating your own proxy is an alternative for people who run their own services. Its setup belongs in the contributor documentation, not this user guide.

Related: [Read public Twitter accounts](twitter.md) and [Connect a Mataroa blog](mataroa.md).
