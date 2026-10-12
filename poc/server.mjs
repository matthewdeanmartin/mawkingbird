import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { search } from './youtube.mjs';

export function createApp(searchFn = search) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return json(405, { error: 'GET only.' });
    if (url.pathname === '/api/search') {
      try {
        json(200, await searchFn(url.searchParams.get('q'), url.searchParams.get('type') ?? 'video'));
      } catch (error) {
        if (error instanceof RangeError) return json(400, { error: error.message });
        console.error('YouTube search failed:', error.message);
        json(502, { error: 'YouTube search failed or timed out. Check server output and try again.' });
      }
      return;
    }
    if (!['/', '/cors'].includes(url.pathname)) return json(404, { error: 'Not found.' });
    try {
      const html = await readFile(new URL(url.pathname === '/cors' ? './cors.html' : './index.html', import.meta.url));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      json(500, { error: 'Could not load demo.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8787);
  createApp().listen(port, '127.0.0.1', () => console.log(`YouTube search PoC: http://127.0.0.1:${port}`));
}
