// Node does not enforce CORS. This probes the policy headers a browser evaluates.
import { Innertube } from 'youtubei.js';

const origins = ['http://127.0.0.1:8787', 'https://mawkingbird.com'];
let captured;
const yt = await Innertube.create({
  retrieve_player: false,
  fetch: async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname.endsWith('/search')) {
      captured = { url: request.url, body: await request.clone().text(), headers: request.headers };
    }
    return fetch(request, { signal: AbortSignal.timeout(20_000) });
  },
});
const baseline = await yt.search('Technology Connections', { type: 'channel' });
console.log(JSON.stringify({ label: 'normal server-side search succeeds', channels: baseline.channels.length }));
const headers = new Headers(captured.headers);
headers.delete('origin');
const userAgent = headers.get('user-agent');
const requestedHeaders = [...headers.keys()].filter((name) => !['accept', 'accept-language', 'user-agent'].includes(name)).sort();
console.log(JSON.stringify({ requestedHeaders }));

function report(label, response, origin) {
  const allowOrigin = response.headers.get('access-control-allow-origin');
  console.log(JSON.stringify({ label, origin, status: response.status,
    allowOrigin,
    allowCredentials: response.headers.get('access-control-allow-credentials'),
    allowMethods: response.headers.get('access-control-allow-methods'),
    allowHeaders: response.headers.get('access-control-allow-headers'),
  }));
}

for (const origin of origins) {
  for (const host of ['www.youtube.com', 'youtubei.googleapis.com']) {
    const url = new URL(captured.url); url.hostname = host;
    // Also test Google's API host with the library's anonymous internal key.
    if (host === 'youtubei.googleapis.com') url.searchParams.set('key', yt.session.api_key);
    const options = await fetch(url, { method: 'OPTIONS', headers: {
      Origin: origin,
      'User-Agent': userAgent,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': requestedHeaders.join(', '),
    }, signal: AbortSignal.timeout(20_000) });
    report(`${host} search preflight`, options, origin);
    const response = await fetch(url, { method: 'POST',
      headers: { ...Object.fromEntries(headers), Origin: origin }, body: captured.body,
      signal: AbortSignal.timeout(20_000),
    });
    report(`${host} search POST`, response, origin);
    console.log(JSON.stringify({ label: `${host} search body`, json: (await response.text()).slice(0, 160) }));
    const simple = await fetch(url, { method: 'POST',
      headers: { Origin: origin, 'User-Agent': userAgent, 'Content-Type': 'text/plain' }, body: captured.body,
      signal: AbortSignal.timeout(20_000),
    });
    report(`${host} simple text/plain POST (no preflight)`, simple, origin);
    await simple.body?.cancel();
  }
  const bootstrap = await fetch('https://www.youtube.com/sw.js_data', {
    headers: { Origin: origin, 'User-Agent': userAgent }, signal: AbortSignal.timeout(20_000),
  });
  report('session bootstrap GET', bootstrap, origin);
  await bootstrap.body?.cancel();
}
