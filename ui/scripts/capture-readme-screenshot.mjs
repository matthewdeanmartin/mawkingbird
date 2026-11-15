// Capture the real, signed-out web app for README.md.
// Run from ui/: npm run readme:screenshot
// Pass another origin as the first argument to capture a local deployment.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = new URL(process.argv[2] ?? 'https://mawkingbird.com/');
const output = path.resolve(import.meta.dirname, '../readme_assets/web-preview.png');
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    reducedMotion: 'reduce',
  });
  await page.goto(origin.href, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue without logging in' }).click();
  await page.getByText('Animals and Pets', { exact: false }).first().click();
  await page.getByRole('button', { name: /^Follow all \d+$/ }).click();
  await page.waitForFunction(() =>
    (document.querySelector('#main')?.textContent ?? '').includes('Followed'),
  );
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByRole('button', { name: 'Quit', exact: true }).click();
  await page.waitForFunction(() =>
    (document.querySelector('#main')?.textContent ?? '').includes('🐘 Mastodon'),
  );
  await page.waitForTimeout(1500);
  await mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output, animations: 'disabled' });
  console.log(`Captured ${output}`);
} finally {
  await browser.close();
}
