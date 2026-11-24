import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('This WebView2 smoke harness is Windows-only.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = resolve(process.env.MAWKINGBIRD_SOURCE || resolve(root, '../mawkingbird'));
const { chromium } = createRequire(resolve(shared, 'ui/package.json'))('@playwright/test');
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
let probeHits = 0;
const probeRequests = [];
const probe = httpServer((req, res) => {
  probeHits++;
  probeRequests.push({ method: req.method, path: req.url, mode: req.headers['sec-fetch-mode'], destination: req.headers['sec-fetch-dest'] });
  res.end('must not be reached');
});
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const forbidden = `http://127.0.0.1:${probe.address().port}/`;
const profile = mkdtempSync(join(tmpdir(), 'mawkingbird-native-webview-'));
const child = spawn(resolve(root, 'src-tauri/target/debug/mawkingbird-native.exe'), ['--smoke-test'], {
  windowsHide: true,
  env: { ...process.env, MAWKINGBIRD_SMOKE_PROFILE: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let launchError;
let stderr = '';
child.on('error', (error) => { launchError = error; });
child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
child.stdout.resume();
let browser;
try {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`Host exited ${child.exitCode}: ${stderr}`);
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  assert(browser, `WebView2 debug endpoint unavailable: ${stderr}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent('page', { timeout: 10000 });
  await page.waitForURL('http://tauri.localhost/**', { waitUntil: 'domcontentloaded', timeout: 15000 });
  // An error dialog also renders app-root. Require the useful first-run result.
  await page.waitForURL('http://tauri.localhost/home', { timeout: 45000 });
  await page.locator('app-status-card').first().waitFor({ state: 'attached', timeout: 45000 });
  assert.equal(await page.locator('app-unreachable-server-dialog').count(), 0);
  console.log(`Public reader reached Home with ${await page.locator('app-status-card').count()} post cards.`);
  await page.waitForFunction(() => [...document.querySelectorAll('app-status-card img')]
    .filter((img) => img.src.startsWith('http://native-image.localhost/') && img.complete && img.naturalWidth > 0).length >= 3,
    null, { timeout: 45000 });
  console.log('PASS: live post images decode through the native image protocol.');
  const photo = page.locator('app-status-card .media-thumb img, app-status-card .preview-card-image').first();
  if (await photo.count()) {
    await photo.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const img = document.querySelector('app-status-card .media-thumb img, app-status-card .preview-card-image');
      return img?.complete && img.naturalWidth > 0 && img.src.startsWith('http://native-image.localhost/');
    }, null, { timeout: 45000 });
    console.log('PASS: a live post photo/link-preview image decodes, in addition to avatars.');
  }
  const continueReading = page.getByRole('button', { name: 'Continue without logging in', exact: true });
  if (await continueReading.isVisible()) await continueReading.click();
  await page.screenshot({ path: join(tmpdir(), 'mawkingbird-native-images-smoke.png') });

  const remoteResponses = [];
  const errors = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith('http://tauri.localhost/') && !url.startsWith('http://ipc.localhost/') && !url.startsWith('http://native-image.localhost/') && !url.startsWith('http://native-media.localhost/')) {
      remoteResponses.push({ url, status: response.status() });
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('app-root')?.textContent.trim().length > 20, null, { timeout: 15000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.deepEqual(errors, []);
  // CSP can emit request events for images it blocks before any socket opens.
  // A host-filter denial is local 403; no successful remote response is allowed.
  assert.deepEqual(remoteResponses.filter(({ status }) => status !== 403), []);
  const publicReads = await page.evaluate(async () => {
    const invoke = window.__TAURI__.core.invoke;
    const instance = await invoke('public_mastodon_get', { url: 'https://mastodon.social/api/v1/instance' });
    let blockedPrivate = false;
    try { await invoke('public_mastodon_get', { url: 'https://127.0.0.1/api/v1/instance' }); }
    catch (error) { blockedPrivate = error.kind === 'policy'; }
    return { status: instance.status, title: JSON.parse(instance.body).title, blockedPrivate };
  });
  assert.equal(publicReads.status, 200);
  assert(publicReads.title);
  assert(publicReads.blockedPrivate);
  await page.evaluate(async () => {
    const invoke = window.__TAURI__.core.invoke;
    try { await invoke('mastodon_login', { server: 'http://invalid.example', access: 'full' }); } catch {}
    await invoke('report_native_event', { event: 'renderer_error' });
    await invoke('report_native_event', { event: 'secret-query-token-must-not-be-logged' });
  });
  const log = readFileSync(join(profile, 'logs', 'native.log'), 'utf8');
  assert(log.includes('operation=startup result=ready'));
  assert(log.includes('operation=oauth_login result=policy'));
  assert(log.includes('operation=renderer result=renderer_error'));
  assert(!log.includes('secret-query-token-must-not-be-logged'));
  console.log('PASS: persistent startup/login/renderer diagnostics; untrusted log payload redacted.');
  const socialReads = await page.evaluate(async () => {
    const invoke = window.__TAURI__.core.invoke;
    const bluesky = await invoke('bluesky_request', { url: 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bsky.app', method: 'GET', body: null, handle: null, labelers: [] });
    const misskey = await invoke('misskey_request', { server: 'https://misskey.io', endpoint: 'meta', body: { detail: false }, handle: null });
    const discovery = await invoke('misskey_nodeinfo', { url: 'https://misskey.io/.well-known/nodeinfo' });
    const denials = [];
    for (const [command, args] of [
      ['bluesky_request', { url: 'https://127.0.0.1/xrpc/app.bsky.actor.getProfile', method: 'GET', body: null, handle: null, labelers: [] }],
      ['bluesky_request', { url: 'https://public.api.bsky.app/xrpc/com.atproto.server.deleteAccount', method: 'POST', body: {}, handle: null, labelers: [] }],
      ['misskey_request', { server: 'https://misskey.io', endpoint: 'admin/accounts/delete', body: {}, handle: null }],
      ['misskey_request', { server: 'https://misskey.io', endpoint: 'i', body: { i: 'never-forward-this-secret' }, handle: null }],
    ]) {
      try { await invoke(command, args); denials.push(false); } catch (e) { denials.push(e.kind === 'policy'); }
    }
    return { bluesky: bluesky.status, did: JSON.parse(bluesky.body).did, misskey: misskey.status, discovery: discovery.status, denials };
  });
  assert.equal(socialReads.bluesky, 200);
  assert(socialReads.did.startsWith('did:'));
  assert.equal(socialReads.misskey, 200);
  assert.equal(socialReads.discovery, 200);
  assert(socialReads.denials.every(Boolean));
  console.log('PASS: live Bluesky public profile and Misskey metadata/NodeInfo through native IPC; unsafe destinations, unapproved writes and raw tokens rejected.');
  const feedRead = await page.evaluate(async () => {
    const xml = await window.__TAURI__.core.invoke('public_feed_get', { url: 'https://news.ycombinator.com/rss' }).catch((error) => { throw new Error(JSON.stringify(error)); });
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    let blockedPrivate = false;
    try { await window.__TAURI__.core.invoke('public_feed_get', { url: 'http://127.0.0.1/rss' }); }
    catch (error) { blockedPrivate = error.kind === 'policy'; }
    return { root: doc.documentElement.localName, items: doc.querySelectorAll('item').length, blockedPrivate };
  });
  assert.equal(feedRead.root, 'rss');
  assert(feedRead.items > 0);
  assert(feedRead.blockedPrivate);
  console.log('PASS: live RSS fetched by Rust through permitted IPC; private feed destination blocked.');

  await page.goto('http://tauri.localhost/rss');
  await page.getByRole('button', { name: 'Paste a link', exact: true }).click();
  const feedInput = page.locator('app-add-feed-dialog input[name="pasted"]');
  await feedInput.fill('https://news.ycombinator.com/');
  await feedInput.press('Enter');
  await page.locator('app-add-feed-dialog').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('.rss-rail .rail-row').filter({ hasText: 'Hacker News' }).click({ timeout: 10000 });
  await page.locator('[data-rss-item]').first().waitFor({ state: 'visible', timeout: 30000 });
  console.log('PASS: native website discovery finds the RSS feed, subscribes and renders live items through Rust.');
  await page.screenshot({ path: join(tmpdir(), 'mawkingbird-native-feeds-smoke.png') });

  // Seed only a parsed RSS teaser in this isolated profile. Article transport,
  // extraction, quota and UI are real; no native bridge function is replaced.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('mockingbird_rss', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('feeds', 'readwrite');
      tx.objectStore('feeds').put({ url: 'https://article-smoke.example/rss', fetchedAt: Date.now(), feed: {
        title: 'Native article smoke', link: 'https://www.w3.org/Provider/Style/URI.html', items: [{
          guid: 'article-smoke', title: 'Cool URIs', link: 'https://www.w3.org/Provider/Style/URI.html',
          publishedAt: new Date().toISOString(), html: '<p>A short teaser for the native full-text test.</p>',
          isFullContent: false, enclosures: [], categories: [], author: null, commentsFeedUrl: null, commentCount: null,
        }],
      } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  await page.getByRole('button', { name: 'Paste a link', exact: true }).click();
  await feedInput.fill('https://article-smoke.example/rss');
  await feedInput.press('Enter');
  await page.locator('app-add-feed-dialog').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('.rss-rail .rail-row').filter({ hasText: 'Native article smoke' }).click({ timeout: 10000 });
  await page.locator('[data-rss-item]').first().waitFor({ state: 'visible', timeout: 30000 });
  const articleId = await page.locator('[data-rss-item]').first().getAttribute('data-rss-item');
  await page.goto(`http://tauri.localhost/read/${encodeURIComponent(articleId)}`);
  const expand = page.getByRole('button', { name: /Fetch article|Fetch the rest/ }).first();
  await expand.waitFor({ state: 'visible', timeout: 30000 });
  assert(await expand.isEnabled(), 'native full-text button requires no proxy setup');
  await expand.click();
  await page.locator('.reader-article-body').waitFor({ state: 'visible', timeout: 30000 });
  assert((await page.locator('.reader-article-body').innerText()).length > 500);
  assert(!(await page.locator('body').innerText()).includes('needs a CORS proxy'));
  await page.screenshot({ path: join(tmpdir(), 'mawkingbird-native-articles-smoke.png') });
  const articleBoundary = await page.evaluate(async () => {
    try { await window.__TAURI__.core.invoke('public_article_get', { url: 'http://127.0.0.1/article' }); }
    catch (error) { return error.kind; }
  });
  assert.equal(articleBoundary, 'policy');
  const articleLog = readFileSync(join(profile, 'logs/native.log'), 'utf8');
  assert(articleLog.includes('operation=article_http result=response status=200'));
  assert(!articleLog.includes('Provider/Style'));
  assert.deepEqual(errors, [], 'article extraction/rendering must not raise renderer errors');
  console.log('PASS: native full-text UI fetches live HTML through Rust and renders local extraction, without proxy setup.');

  await page.goto('http://tauri.localhost/settings/rss');
  await page.getByRole('heading', { name: /RSS feeds/ }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.proxy-summary, .proxy-switch, .proxy-badge').count(), 0);
  assert((await page.locator('body').innerText()).includes('fetched directly on this device'));
  console.log('PASS: native RSS settings explain direct reading and omit web proxy controls.');

  const mediaResponses = [];
  page.on('response', response => {
    if (response.url().startsWith('http://native-media.localhost/')) {
      mediaResponses.push({ status: response.status(), length: Number(response.headers()['content-length'] || 0) });
    }
  });
  await page.evaluate(() => {
    const panel = document.createElement('section');
    panel.id = 'native-media-smoke';
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white';
    const video = document.createElement('video');
    video.id = 'native-video-test'; video.muted = true; video.controls = true;
    video.style.width = '480px';
    video.src = 'https://media.w3.org/2010/05/sintel/trailer.mp4';
    const audio = new Audio('https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3');
    audio.id = 'native-audio-test'; audio.muted = true; audio.controls = true;
    const button = document.createElement('button'); button.textContent = 'Play native media test';
    button.onclick = () => { video.play().catch(() => {}); audio.play().catch(() => {}); };
    panel.append(video, audio, button); document.body.append(panel);
  });
  await page.waitForFunction(() => ['native-video-test','native-audio-test'].every(id => {
    const media = document.getElementById(id);
    return media.readyState >= 2 && Number.isFinite(media.duration) && media.duration > 1;
  }), null, { timeout: 45000 });
  await page.getByRole('button', { name: 'Play native media test', exact: true }).click();
  await page.waitForFunction(() => ['native-video-test','native-audio-test'].every(id => document.getElementById(id).currentTime > 0.1), null, { timeout: 15000 });
  await page.evaluate(() => {
    const video = document.getElementById('native-video-test'); video.pause(); video.currentTime = video.duration * 0.75;
    const audio = document.getElementById('native-audio-test'); audio.pause(); audio.currentTime = audio.duration * 0.5;
  });
  await page.waitForFunction(() => {
    const video = document.getElementById('native-video-test'); const audio = document.getElementById('native-audio-test');
    return !video.seeking && !audio.seeking && Math.abs(video.currentTime - video.duration * 0.75) < 0.1 && Math.abs(audio.currentTime - audio.duration * 0.5) < 0.1;
  }, null, { timeout: 45000 });
  assert(mediaResponses.filter(r => r.status === 206).length >= 2);
  assert(mediaResponses.filter(r => r.status === 206).every(r => r.length > 0 && r.length <= 2 * 1024 * 1024));
  await page.evaluate(() => {
    for (const media of document.querySelectorAll('#native-media-smoke video, #native-media-smoke audio')) { media.pause(); media.removeAttribute('src'); media.load(); }
    document.getElementById('native-media-smoke').remove();
  });
  const deniedMedia = await page.evaluate(async url => {
    const media = new Audio(url);
    return new Promise(resolve => { media.onerror = () => resolve(true); media.onloadeddata = () => resolve(false); });
  }, forbidden);
  assert(deniedMedia, 'private media destination must fail');
  assert.equal(probeHits, 0, 'private media must not reach the loopback socket');
  console.log('PASS: live MP4 video and MP3 audio decode, play and seek through bounded native byte ranges; private media is blocked.');

  const favouriteBoundary = await page.evaluate(async () => {
    try {
      await window.__TAURI__.core.invoke('mastodon_favourite', {
        handle: 'invalid-reference', server: 'https://mastodon.social', statusId: '123', liked: true,
      });
      return null;
    } catch (error) { return error; }
  });
  assert.equal(favouriteBoundary.kind, 'policy', 'typed like command is permitted but rejects invalid account references');
  const writeBoundary = await page.evaluate(async () => {
    try {
      await window.__TAURI__.core.invoke('mastodon_account_write', {
        handle: 'invalid-reference', input: { url: 'https://mastodon.social/api/v1/statuses/1', method: 'DELETE' },
      });
      return null;
    } catch (error) { return error; }
  });
  assert.equal(writeBoundary.kind, 'policy', 'account write command is permitted but rejects invalid account references');
  const rejections = await page.evaluate(async () => {
    const invoke = window.__TAURI__.core.invoke;
    const rejected = async (command, args) => {
      try { await invoke(command, args); return ''; } catch (error) { return String(error); }
    };
    return Promise.all([
      rejected('open_external', { url: 'file:///not-a-browser-link' }),
      rejected('plugin:opener|open_url', { url: 'https://example.com' }),
      rejected('plugin:opener|open_path', { path: '/not-authorized' }),
    ]);
  });
  assert.match(rejections[0], /Only external HTTP\(S\) browser links/, 'allowed command reaches its URL validator');
  assert.match(rejections[1], /not allowed|denied|forbidden/i, 'raw URL opener is not permitted');
  assert.match(rejections[2], /not allowed|denied|forbidden/i, 'filesystem opener is not permitted');
  const deniedFetch = await page.evaluate(async (url) => {
    try { await fetch(url); return false; } catch { return true; }
  }, forbidden);
  assert(deniedFetch);
  assert.equal(probeHits, 0, 'CSP-blocked fetch must not reach the socket');
  const deniedImage = await page.evaluate(async (url) => {
    const img = new Image();
    const done = new Promise((resolve) => { img.onload = () => resolve(false); img.onerror = () => resolve(true); });
    img.src = `http://native-image.localhost/?url=${encodeURIComponent(url)}`;
    document.body.append(img);
    return await done;
  }, forbidden);
  assert(deniedImage, 'native image transport refuses non-public destinations');
  assert.equal(probeHits, 0, 'blocked image must not reach the socket');

  await page.evaluate((url) => window.open(url, '_blank'), forbidden);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(context.pages().length, 1);
  assert.equal(probeHits, 0, 'denied popup must not reach the socket');
  await page.evaluate((url) => location.assign(url), forbidden);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert(page.url().startsWith('http://tauri.localhost/'));
  assert.equal(probeHits, 0, `blocked network paths must not reach actual socket: ${JSON.stringify(probeRequests)}`);
  console.log('PASS: actual Windows WebView2 reaches Home with live public posts; public Mastodon IPC succeeds; private destinations, direct renderer traffic, popups and external navigation stay blocked.');
  const publishingChecks = await page.evaluate(async () => {
    const invoke = window.__TAURI__.core.invoke;
    const results = [];
    for (const [command, args] of [
      ['shorten_link', { provider: 'tinyurl', destination: 'file:///private', slug: null }],
      ['shorten_link', { provider: 'unknown', destination: 'https://example.com', slug: null }],
      ['rentry_request', { action: 'delete', slug: 'test', handle: 'raw-edit-secret', text: null }],
      ['rentry_request', { action: 'new', slug: null, handle: null, text: '' }],
    ]) {
      try { await invoke(command, args); results.push('unexpected-success'); }
      catch (error) { results.push(error.kind); }
    }
    return results;
  });
  assert.deepEqual(publishingChecks, ['policy', 'policy', 'policy', 'policy']);
  console.log('PASS: actual publishing IPC rejects unsafe destinations, providers, raw edit codes and empty pastes before network writes.');
  const connectorChecks = await page.evaluate(async () => {
    const invoke = window.__TAURI__.core.invoke;
    const results = [];
    for (const provider of ['mataroa', 'raindrop', 'gist', 'github']) {
      try { await invoke('connector_connect', { provider, token: 'mawkingbird-invalid-smoke-credential', handle: null }); results.push('unexpected-success'); }
      catch (error) { results.push(error.kind); }
    }
    try { await invoke('connector_request', { provider: 'mataroa', handle: 'native-connector:' + 'a'.repeat(43), url: 'https://127.0.0.1/api/posts/', method: 'GET', body: null }); results.push('unexpected-success'); }
    catch (error) { results.push(error.kind); }
    return results;
  });
  assert.deepEqual(connectorChecks, ['credentials', 'credentials', 'credentials', 'credentials', 'policy']);
  const hugoChecks = await page.evaluate(async () => {
    const results = [];
    for (const [command,args] of [
      ['hugo_connect',{token:'dummy',repo:{owner:'../',repo:'blog',branch:'main',contentPath:'content/posts'},handle:null}],
      ['hugo_request',{handle:'raw-secret',url:'https://api.github.com/repos/writer/blog/contents/content/posts',method:'GET',body:null}],
      ['connector_request',{provider:'github',handle:'native-connector:'+'a'.repeat(43),url:'https://api.github.com/graphql',method:'POST',body:{query:'mutation { forbidden }'}}]
    ]) { try { await window.__TAURI__.core.invoke(command,args); results.push('unexpected-success'); } catch(error) { results.push(error.kind); } }
    return results;
  });
  assert.deepEqual(hugoChecks,['policy','policy','policy']);
  console.log('PASS: actual Hugo/GitHub IPC refuses unsafe repository, raw credential and arbitrary GraphQL without remote writes.');
  assert.equal(probeHits, 0);
  const connectorLog = readFileSync(join(profile, 'logs', 'native.log'), 'utf8');
  assert(connectorLog.includes('operation=connector_http result=response'));
  assert(connectorLog.includes('operation=connector_connect result=credentials'));
  assert(!connectorLog.includes('mawkingbird-invalid-smoke-credential'));
  console.log('PASS: actual native connector commands reach Mataroa/Raindrop/GitHub authentication endpoints, reject dummy credentials and unsafe URLs, and log outcomes without keys; no publishing performed.');
  const intelligence = await page.evaluate(async()=>{
    const invoke=window.__TAURI__.core.invoke;
    const results=[];
    for(const args of [
      {url:'https://127.0.0.1/get?q=test&langpair=en%7Ces',method:'GET',body:null},
      {url:'https://api.mymemory.translated.net/set?q=test&langpair=en%7Ces',method:'GET',body:null}
    ]) {try{await invoke('intelligence_public_request',args);results.push('unexpected');}catch(error){results.push(error.kind);}}
    const translated=await invoke('intelligence_public_request',{url:'https://api.mymemory.translated.net/get?q=Hello&langpair=en%7Ces',method:'GET',body:null});
    const pairs=await invoke('intelligence_public_request',{url:'https://apertium.org/apy/listPairs',method:'GET',body:null});
    const apertium=await invoke('intelligence_public_request',{url:'https://apertium.org/apy/translate',method:'POST',body:'q=Hola&langpair=spa%7Ceng&markUnknown=no'});
    const models=await invoke('intelligence_public_request',{url:'https://openrouter.ai/api/v1/models?q=gemma&limit=20&supported_parameters=structured_outputs',method:'GET',body:null});
    return {results,translationStatus:translated.status,translation:JSON.parse(translated.body),pairStatus:pairs.status,apertiumStatus:apertium.status,apertium:JSON.parse(apertium.body),modelStatus:models.status};
  });
  assert.deepEqual(intelligence.results,['policy','policy']);
  assert.equal(intelligence.translationStatus,200);assert.equal(Number(intelligence.translation.responseStatus),200);
  assert(intelligence.translation.responseData.translatedText);
  assert.equal(intelligence.apertiumStatus,200);assert(intelligence.apertium.responseData.translatedText);
  assert.equal(intelligence.pairStatus,200);assert.equal(intelligence.modelStatus,200);
  console.log('PASS: actual Windows native MyMemory translation, Apertium translation/language pairs and OpenRouter model lookup; unsafe routes refused. No paid inference.');
  page.on('response', async (response) => {
    if (response.url().startsWith('https:')) {
      if (response.status() === 403) console.log('Denied embed resource:', new URL(response.url()).origin, response.request().resourceType());
    }
  });
  await page.goto('http://tauri.localhost/watch?youtube=0KoeY54M5VA');
      await page.locator('app-video-player-controls').waitFor();
      const loadPlayer = page.getByRole('button', { name: 'Load YouTube player', exact: true });
      if (await loadPlayer.isVisible()) await loadPlayer.click();
      await page.locator('app-video-player-controls iframe').waitFor();
  const player = page.frameLocator('app-video-player-controls iframe');
  await player.getByRole('button', { name: /^Play/ }).first().waitFor({ state: 'visible', timeout: 45000 });
  await player.getByRole('button', { name: /^Play/ }).first().click();
  await player.locator('video').evaluate(async (video) => {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (video.currentTime > 0 && video.readyState >= 2 && !video.paused) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('YouTube playback did not advance: ' + document.body.innerText);
  });
  console.log('PASS: actual Windows YouTube iframe loads and plays video.');
  const youtubeFrame = page.frames().find((frame) => frame.url().startsWith('https://www.youtube-nocookie.com/embed/'));
  const privateResponse = page.waitForResponse((response) => response.url() === forbidden);
  const outsideResponse = page.waitForResponse('https://example.com/native-frame-policy-probe');
  const access = await youtubeFrame.evaluate(async (privateUrl) => {
    let ipc = 'unavailable';
    if (window.__TAURI__?.core?.invoke) {
      ipc = await Promise.race([
        window.__TAURI__.core.invoke('public_mastodon_get', { url: 'https://127.0.0.1/api/v1/instance' }).then(() => 'ALLOWED', (e) => JSON.stringify(e)),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 3000)),
      ]);
    }
    await fetch(privateUrl, { mode: 'no-cors', referrerPolicy: 'no-referrer' }).catch(() => {});
    await fetch('https://example.com/native-frame-policy-probe', { mode: 'no-cors', referrerPolicy: 'no-referrer' }).catch(() => {});
    const img = new Image(); img.referrerPolicy = 'no-referrer';
    await new Promise((resolve) => { img.onload = img.onerror = resolve; img.src = privateUrl; document.body.append(img); });
    return { ipc };
  }, forbidden);
  assert(access.ipc === 'unavailable' || /not allowed|not found|forbidden|denied/i.test(access.ipc), `remote IPC must be unavailable or denied: ${access.ipc}`);
  // no-cors fetch resolves an opaque response even for our local 403.
  assert.equal((await privateResponse).status(), 403);
  assert.equal((await outsideResponse).status(), 403);
  assert.equal(probeHits, 0, 'YouTube subframe cannot bypass the network policy');
  const directYoutube = await page.evaluate(() => fetch('https://www.youtube.com/s/player/blocked.js').then(() => true, () => false));
  assert.equal(directYoutube, false, 'main app does not inherit the YouTube network exception');
  await youtubeFrame.evaluate(() => { const frame = document.createElement('iframe'); frame.src = 'http://tauri.localhost/'; document.body.append(frame); });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert(!page.frames().slice(1).some((frame) => frame.url().startsWith('http://tauri.localhost/')), 'remote frame must not acquire local app origin');
  assert.equal(probeHits, 0);
  console.log('PASS: YouTube frame cannot use native IPC, reach private sockets, or load a privileged local frame; app direct network stays blocked.');

  console.log('System-browser launch and macOS/Linux runtime behavior remain separate checks.');
} catch (error) {
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) {
    console.error('Smoke page:', failedPage.url());
    for (const frame of failedPage.frames().slice(1)) console.error('Frame:', new URL(frame.url()).origin, (await frame.locator('body').innerText().catch(() => '')).slice(0, 2000));
    console.error((await failedPage.locator('body').innerText().catch(() => '')).slice(-5000));
    await failedPage.screenshot({ path: join(tmpdir(), 'mawkingbird-native-smoke-failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  child.kill();
  await browser?.close().catch(() => {});
  await new Promise((resolve) => probe.close(resolve));
}
