const { chromium } = require('C:/Users/matth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath:'C:/Users/matth/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', err => console.log('PAGE ERROR', err.message));
  await page.goto('http://127.0.0.1:4217/_ui/');
  await page.getByRole('button', {name:'Continue without logging in'}).click();
  const id = 'message-status.' + Buffer.from(JSON.stringify({content: 'Every sentence must be readable. '.repeat(120), spoiler: '', language:'plaintext'})).toString('base64url');
  await page.goto('http://127.0.0.1:4217/_ui/read/'+id);
  await page.waitForSelector('app-reader-core', {timeout:20000}).catch(async e=>{ console.log('URL',page.url(),(await page.locator('body').innerText()).slice(0,1000)); throw e; });
  await page.waitForTimeout(1500);
  console.log(await page.evaluate(() => {
    const host=document.querySelector('app-reader-core');
    const core=window.ng.getComponent(host);
    const viewport=host.querySelector('.reader-viewport');
    const columns=host.querySelector('.reader');
    return {pageCount:core.pageCountForTest(), text:columns.textContent.slice(0,250),
      host:host.getBoundingClientRect().toJSON(), viewport:viewport.getBoundingClientRect().toJSON(), columns:columns.getBoundingClientRect().toJSON(), scrollWidth:columns.scrollWidth, scrollHeight:columns.scrollHeight, style:getComputedStyle(columns).columnCount, toolbar:host.querySelector('.reader-bar').getBoundingClientRect().toJSON()};
  }));
  await page.screenshot({path:'C:/github/mimb/mastodon_mock/ui/scratchpad/reader-layout.png'});
  await browser.close();
})();
