// Optional live contract check. Uses public examples from provider documentation,
// no Mastodon account, and the exact local bridge used by the Angular client.
import http from 'node:http';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from '@playwright/test';

const adapter = ts.transpileModule(
  await fs.readFile('src/app/audio-embeds/widget-api.ts', 'utf8'),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  },
).outputText;
const sources = {
  soundcloud:
    'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood&auto_play=false',
  mixcloud: 'https://player-widget.mixcloud.com/?mini=1&feed=%2Fspartacus%2Flambiance%2F',
};
const main = `import { connectWidget } from '/adapter.js';
  const provider = new URL(location.href).searchParams.get('provider');
  const sources = ${JSON.stringify(sources)};
  window.report = { ready: false, states: [] };
  document.querySelector('#load').onclick = async () => {
    const frame = document.createElement('iframe');
    frame.title = provider; frame.src = sources[provider]; frame.allow = 'autoplay; encrypted-media';
    frame.width = '500'; frame.height = '200'; document.body.append(frame);
    try {
      const controller = await connectWidget(provider, frame, state => window.report.states.push(state));
      window.report.ready = true;
      document.querySelector('#play').onclick = () => controller.play();
      document.querySelector('#pause').onclick = () => controller.pause();
    } catch (error) { window.report.error = error.message; }
  };
`;
const server = http.createServer((req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; frame-src https://w.soundcloud.com https://player-widget.mixcloud.com",
  );
  if (req.url === '/adapter.js' || req.url === '/main.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(req.url === '/adapter.js' ? adapter : main);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<button id="load">Load</button><button id="play">Play</button><button id="pause">Pause</button><script type="module" src="/main.js"></script>',
    );
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  for (const provider of Object.keys(sources)) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/?provider=${provider}`);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page
      .waitForFunction(() => window.report.ready || window.report.error, null, { timeout: 25_000 })
      .catch(() => undefined);
    if (await page.evaluate(() => window.report.ready)) {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page
        .waitForFunction(() => window.report.states.some((s) => s.playing), null, {
          timeout: 15_000,
        })
        .catch(() => undefined);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page
        .waitForFunction(() => window.report.states.at(-1)?.playing === false, null, {
          timeout: 5_000,
        })
        .catch(() => undefined);
    }
    const report = await page.evaluate(() => window.report);
    console.log(JSON.stringify({ provider, ...report }));
    if (
      !report.ready ||
      !report.states.some((s) => s.playing) ||
      report.states.at(-1)?.playing !== false
    )
      failed = true;
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
if (failed) process.exitCode = 1;
