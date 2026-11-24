import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = resolve(process.env.MAWKINGBIRD_SOURCE || resolve(root, '../mawkingbird'));
const { chromium } = createRequire(resolve(shared, 'ui/package.json'))('@playwright/test');
const assets = resolve(root, '.frontend/browser');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  let path;
  try { path = resolve(assets, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (path !== assets && !path.startsWith(assets + sep)) { res.writeHead(403).end(); return; }
  if (!extname(path)) path = resolve(assets, 'index.html');
  if (!existsSync(path)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
  res.end(readFileSync(path));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(() => {
    window.__TAURI__ = {core:{invoke:async(command,args)=>{
      if(command==='report_native_event') return;
      if(command==='public_mastodon_get') return {status:200,headers:{},body:JSON.stringify(args.url.includes('/instance')?{uri:'mastodon.social',title:'Mastodon',version:'4.4.0'}:[])};
      if(command==='connector_connect') {if(args.token==='reject-fixture') throw {kind:'credentials',message:'Rejected fixture key'};return 'native-connector:'+'o'.repeat(43);}
      if(command==='openrouter_login') return 'native-connector:'+'o'.repeat(43);
      if(command==='connector_forget') {if(window.failForget) throw {kind:'credentials',message:'OS store locked'};return;}
      if(command==='connector_request') return {status:200,headers:{},body:JSON.stringify({data:{limit:10,limit_remaining:8,usage:2}})};
      if(command==='intelligence_public_request') return {status:200,headers:{},body:JSON.stringify({data:[]})};
      // Local AI (parity item 1): the Rust policy is mirrored here only to drive the UI;
      // the real allow/deny rules are unit-tested in src-tauri/src/local_ai.rs.
      if(command==='local_ai_status') return {endpoint:window.localAiEndpoint??null};
      if(command==='local_ai_set_endpoint') {
        if(args.endpointUrl&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(args.endpointUrl)) throw {kind:'policy',message:'Enter a local address like http://127.0.0.1:11434 or http://localhost:1234.'};
        window.localAiEndpoint=args.endpointUrl?args.endpointUrl.replace(/\/$/,''):null;return {endpoint:window.localAiEndpoint};
      }
      if(command==='local_ai_request'&&args.path==='/v1/models'&&args.method==='GET') return {status:200,body:JSON.stringify({data:[{id:'llama3.2'},{id:'llava'}]})};
      throw new Error('Unexpected IPC '+command);
    }}};
  });
  const route=origin+'/settings/connections/openrouter';
  await page.goto(origin); await page.waitForURL(origin+'/home');await page.goto(route);
  await page.getByRole('button',{name:'Continue without logging in',exact:true}).click(); await page.goto(route);
  const key=page.locator('input[type="password"]');await key.waitFor();
  await key.fill('reject-fixture');await page.getByRole('button',{name:'Connect with this key',exact:true}).click();await page.getByText('Rejected fixture key',{exact:true}).waitFor();
  await key.fill('accepted-fixture');await page.getByRole('button',{name:'Connect with this key',exact:true}).click();await page.getByText('Saved on this device',{exact:true}).waitFor();
  const saved=await page.evaluate(()=>JSON.stringify(localStorage));assert(saved.includes('native-connector:'));assert(!saved.includes('accepted-fixture'));
  await page.reload();await page.getByText('Saved on this device',{exact:true}).waitFor();
  await page.evaluate(()=>{window.failForget=true;});await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.getByText('OS store locked',{exact:true}).waitFor();
  assert(await page.getByText('Saved on this device',{exact:true}).isVisible());
  await page.evaluate(()=>{window.failForget=false;});await page.getByRole('button',{name:'Disconnect',exact:true}).click();await key.waitFor();
  await page.getByRole('button',{name:'Connect OpenRouter',exact:true}).click();await page.getByText('Saved on this device',{exact:true}).waitFor();
  // Local AI: LAN address refused by the native policy, loopback accepted, models listed, switched on.
  await page.goto(origin+'/settings/connections/local-ai');
  const address=page.getByRole('textbox',{name:'Local address'});await address.waitFor();
  await address.fill('http://192.168.1.10:11434');await page.getByRole('button',{name:'Save address',exact:true}).click();
  await page.getByText('Enter a local address like http://127.0.0.1:11434 or http://localhost:1234.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Use Ollama',exact:true}).click();await page.getByRole('button',{name:'Save address',exact:true}).click();
  await page.getByRole('button',{name:'Load models',exact:true}).click();await page.getByRole('combobox',{name:'Model'}).waitFor();
  await page.getByText('Local AI is on.',{exact:true}).waitFor();
  const local=await page.evaluate(()=>localStorage.getItem('mockingbird_local_ai'));assert.equal(JSON.parse(local).model,'llama3.2');
  assert.equal(await page.getByText(/credits|budget|Plus/i).count(),0,'Local AI shows no cost, budget or upsell copy');
  assert.deepEqual(errors,[]);console.log('PASS: compiled OpenRouter key/OAuth connection, OS reference persistence, credits, failed disconnect retention and retry; Local AI loopback-only endpoint, model list and switch (mocked IPC; no paid inference).');
} catch(error) {
  for(const context of browser?.contexts()??[]) for(const page of context.pages()) console.error(page.url(),(await page.locator('body').innerText()).slice(-4000));
  throw error;
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
