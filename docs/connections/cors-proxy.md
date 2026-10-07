# Use the Mawkingbird proxy

Some public feeds and services will open in a tab but will not answer Mawkingbird directly. The Mawkingbird proxy retrieves those public items for Mawkingbird.

Most people do not need it. Set it up only when a connection page or [Connection Doctor](connection-doctor.md) says a proxy is required.

Free access covers **wikipedia.org, wikimedia.org, wikisource.org, gutenberg.org,
and archive.org**, including their subdomains. Anonymous visitors get **1 request
per day** per network address; signed-in Mawkingbird accounts get **5 requests
per day** per account. These allowances are shared across all proxy features and
reset at midnight UTC. Each batch member counts as a request; cached responses
and failed upstream attempts also count. Testing the proxy uses a request.

Other destinations require Mawkingbird Plus. When the free allowance is used up,
Mawkingbird offers account creation, Plus signup when available, or **Quietly
disable all features that need the CORS proxy**. Disabling persists on this device;
saved content and direct connections remain available. Re-enable proxy features
in the CORS proxy connection settings. Paid request limits are unchanged.

Home uses saved RSS items without refreshing every subscription. Open **RSS** or
an individual feed to fetch updates. If an automatic RSS load reaches the proxy
allowance, a notice on the RSS page explains what paused; it does not open an
upgrade dialog over another page. Subscribing to many feeds is allowed and you
do not need to unsubscribe.

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

Operating your own proxy is an alternative for people who run their own services.
See [Related services and self-hosting](../contributing.md#related-services-and-self-hosting)
for the proxy repository and its setup instructions.

Related: [Read public Twitter accounts](twitter.md) and [Connect a Mataroa blog](mataroa.md).
