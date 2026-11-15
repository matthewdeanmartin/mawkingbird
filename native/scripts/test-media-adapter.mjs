// Fast source-level browser checks: no Angular/Rust rebuild needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = resolve(process.env.MAWKINGBIRD_SOURCE || resolve(root, '../mawkingbird'));
const { chromium } = createRequire(resolve(shared, 'ui/package.json'))('@playwright/test');
const csp = readFileSync(resolve(shared, 'ui/src/index.native.html'), 'utf8').match(/content="(default-src[^"]+)"/)[1];
const wav = Buffer.alloc(44 + 32000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32);
wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(32000,40);
const browser = await chromium.launch({ headless:true, args:['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('http://tauri.localhost/**', r => r.fulfill({ contentType:'text/html',
    body:'<meta http-equiv="Content-Security-Policy" content="' + csp + '"><body></body>' }));
  const targets = [];
  await page.route('http://native-media.localhost/**', async route => {
    targets.push(new URL(route.request().url()).searchParams.get('url'));
    const match = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers()['range'] || 'bytes=0-');
    const start = Number(match?.[1] || 0);
    const end = Math.min(Number(match?.[2] || wav.length - 1), wav.length - 1);
    await route.fulfill({ status:206, contentType:'audio/wav', headers: {
      'Content-Range': 'bytes ' + start + '-' + end + '/' + wav.length,
      'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*',
    }, body:wav.subarray(start,end+1) });
  });
  await page.addInitScript({ path:resolve(root,'src-tauri/src/media.js') });
  await page.goto('http://tauri.localhost/');
  await page.evaluate(() => {
    const audio = new Audio('https://publisher.example/detached.wav');
    audio.id='detached'; audio.muted=true; document.body.append(audio);
    const box = document.createElement('div');
    box.innerHTML='<audio id="source-audio" muted preload="auto"><source src="https://publisher.example/source.wav" type="audio/wav"></audio>';
    document.body.append(box);
    const video = document.createElement('video');
    video.id='video-sink'; video.preload='none'; video.src='https://publisher.example/clip.mp4'; document.body.append(video);
  });
  await page.waitForFunction(() => document.querySelector('#detached').readyState >= 2 && document.querySelector('#source-audio').readyState >= 2).catch(async e => { console.error(await page.evaluate(() => [...document.querySelectorAll('audio,video,source')].map(x => ({tag:x.tagName,src:x.src,current:x.currentSrc,ready:x.readyState,error:x.error?.code})))); throw e; });
  assert(await page.locator('#video-sink').evaluate(e => e.src.startsWith('http://native-media.localhost/')));
  await page.locator('#detached').evaluate(async e => { await e.play(); });
  await page.waitForFunction(() => document.querySelector('#detached').currentTime > 0.1);
  await page.locator('#detached').evaluate(e => { e.pause(); e.currentTime=1; });
  await page.waitForFunction(() => !document.querySelector('#detached').seeking && Math.abs(document.querySelector('#detached').currentTime - 1) < 0.05).catch(async e => { console.error(await page.locator('#detached').evaluate(x => ({time:x.currentTime,duration:x.duration,seeking:x.seeking,seekable:Array.from({length:x.seekable.length},(_,i)=>[x.seekable.start(i),x.seekable.end(i)])}))); throw e; });
  await page.locator('#detached').evaluate(e => { e.src='https://publisher.example/changed.wav'; });
  await page.waitForFunction(() => document.querySelector('#detached').readyState >= 2 && document.querySelector('#detached').src.includes('changed.wav'));
  assert(targets.includes('https://publisher.example/detached.wav'));
  assert(targets.includes('https://publisher.example/source.wav'));
  assert(targets.includes('https://publisher.example/changed.wav'));
  assert.deepEqual(errors, []);
  console.log('PASS: native media adapter maps detached Audio, properties, source markup and changed URLs; audio decodes, plays and seeks under native CSP.');
} finally { await browser.close(); }
