import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Read-only live PeerTube acceptance, in an isolated Windows WebView2 profile.
const root = resolve(import.meta.dirname, '..');
const { chromium } = createRequire(resolve(root, '../mawkingbird/ui/package.json'))('@playwright/test');
const reservation = createServer();
await new Promise((done) => reservation.listen(0, '127.0.0.1', done));
const port = reservation.address().port;
await new Promise((done) => reservation.close(done));
const profile = mkdtempSync(join(tmpdir(), 'mawkingbird-native-030-'));
const child = spawn(resolve(root, 'src-tauri/target/debug/mawkingbird-native.exe'), ['--smoke-test'], {
  windowsHide: true, stdio: 'ignore',
  env: { ...process.env, MAWKINGBIRD_SMOKE_PROFILE: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
});
let launchError;
child.on('error', (error) => { launchError = error; });
let browser;
try {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error('Native host exited before the smoke test');
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; }
    catch { await new Promise((done) => setTimeout(done, 250)); }
  }
  assert(browser, 'WebView2 unavailable');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForURL('http://tauri.localhost/**', { timeout: 45000 });
  await page.waitForFunction(() => !!window.__TAURI__?.core);
  const metadataUrl = process.env.PEERTUBE_SMOKE_URL ?? 'https://framatube.org/api/v1/videos/65fbec91-7edd-46ff-bafe-0cadb446b488';
  const result = await page.evaluate(async (url) => {
    const response = await window.__TAURI__.core.invoke('public_mastodon_get', { url });
    const video = JSON.parse(response.body);
    const files = [...(video.files ?? []), ...(video.streamingPlaylists ?? []).flatMap((list) => list.files ?? [])]
      .filter((file) => file.resolution?.id > 0 && file.fileUrl?.startsWith('https:'))
      .sort((a, b) => a.resolution.id - b.resolution.id);
    const file = files[0];
    if (!file) throw new Error('Live fixture has no direct MP4');
    const player = document.createElement('video');
    player.id = 'native-030-video'; player.muted = true; player.preload = 'auto';
    player.src = file.fileUrl; document.body.append(player);
    return { status: response.status, title: video.name, url: file.fileUrl };
  }, metadataUrl);
  assert.equal(result.status, 200);
  console.log(`PASS: live PeerTube metadata through Rust: ${result.title}`);
  const video = page.locator('#native-030-video');
  await page.waitForFunction(() => document.querySelector('#native-030-video')?.readyState >= 2, null, { timeout: 60000 });
  assert((await video.evaluate((v) => v.src)).startsWith('http://native-media.localhost/'));
  await video.evaluate((v) => v.play());
  await page.waitForFunction(() => document.querySelector('#native-030-video').currentTime > 0.2, null, { timeout: 30000 });
  await video.evaluate((v) => { v.pause(); v.currentTime = 30; });
  await page.waitForFunction(() => { const v = document.querySelector('#native-030-video'); return !v.seeking && Math.abs(v.currentTime - 30) < 1; }, null, { timeout: 60000 });
  console.log('PASS: actual Native MP4 decode, playback and 30-second seek through bounded host range transport. No account writes.');
} finally {
  await browser?.close();
  child.kill();
}
