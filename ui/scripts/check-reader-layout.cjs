/**
 * Real-browser regression check. Start `ng serve` with development settings,
 * then run with Playwright available in NODE_PATH (or installed locally):
 * node scripts/check-reader-layout.cjs http://127.0.0.1:4200/_ui/
 * READER_BROWSER_EXECUTABLE optionally selects an existing Chromium binary.
 * Uses an isolated browser profile and local fixtures; no paid article fetches.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const base = process.argv[2] ?? 'http://127.0.0.1:4217/_ui/';
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.READER_BROWSER_EXECUTABLE || undefined,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/article?**', (route) => route.abort());
    await page.goto(base);
    await page.getByRole('button', { name: 'Continue without logging in' }).click();
    const id =
      'message-status.' +
      Buffer.from(
        JSON.stringify({
          content: 'Local pagination fixture. '.repeat(30),
          spoiler: '',
          language: 'plaintext',
        }),
      ).toString('base64url');
    await page.goto(base + 'read/' + id);
    await page.waitForSelector('app-reader-core');
    await settle(page);

    const prose = Array.from({ length: 180 }, (_, i) => `Sentence${i} ends here.`).join(' ');
    const markdown =
      '# Heading without a blank line\n' +
      prose +
      '\n\n' +
      '> ' +
      prose +
      '\n\n' +
      Array.from({ length: 45 }, (_, i) => `- List item ${i} contains several words.`).join('\n') +
      '\n\n```\n' +
      Array.from(
        { length: 70 },
        (_, i) => `const line${i} = "a code line that must remain reachable";`,
      ).join('\n') +
      '\n```\n\nLast sentence of the article.';
    const fixtures = [
      { name: 'single long paragraph', content: `<p>${prose}</p>` },
      {
        name: 'tweet storm with media-only post',
        content: `<p>${prose.slice(0, 600)}</p>`,
        storm: true,
      },
      {
        name: 'RSS HTML with line breaks and long list',
        content: `<div>${prose.replaceAll(' ', '<br>')}</div><ul>${'<li>List item text.</li>'.repeat(35)}</ul>`,
        rss: true,
      },
      {
        name: 'fetched article: heading, long paragraph, quote, list and code',
        content: '<p>Introduction.</p>',
        markdown,
      },
    ];
    let checkedPages = 0;
    for (const viewport of [
      { width: 900, height: 600 },
      { width: 390, height: 420 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      for (const fixture of fixtures) {
        await installFixture(page, fixture);
        await page.evaluate(
          ({ large }) => {
            const core = window.ng.getComponent(document.querySelector('app-reader-core'));
            core.prefs.setReaderFontSize(large ? 24 : 18);
            core.prefs.setReaderLineHeight(large ? 2.4 : 1.65);
            core.prefs.setReaderLetterSpacing(large ? 1 : 0);
            core.prefs.setReaderWordSpacing(large ? 2 : 0);
            core.prefs.setReaderPageFlip(true);
          },
          { large: viewport.width === 390 },
        );
        await settle(page);
        const result = await verifyPages(page);
        checkedPages += result;
        console.log(`PASS ${viewport.width}x${viewport.height}: ${fixture.name} (${result} pages)`);
      }
    }
    // Check page location through reflow, and search/notes on a split paragraph.
    await installFixture(page, { name: 'navigation', content: '<p>Introduction.</p>', markdown });
    await settle(page);
    await page.evaluate(() =>
      window.ng.getComponent(document.querySelector('app-reader-core')).goToPage(3),
    );
    const before = await page.evaluate(
      () =>
        window.ng.getComponent(document.querySelector('app-reader-core')).columnLayout.starts[2]
          ?.startContainer.textContent,
    );
    await page.setViewportSize({ width: 600, height: 500 });
    await settle(page);
    assert(
      await page.evaluate((text) => {
        const core = window.ng.getComponent(document.querySelector('app-reader-core'));
        return core.columnLayout.starts[core.pageNumber() - 1]?.startContainer.textContent === text;
      }, before),
      'Resize lost the current passage',
    );

    await page.evaluate(() => {
      const core = window.ng.getComponent(document.querySelector('app-reader-core'));
      core.tools.selection.set('Sentence160 ends here.');
      core.tools.startNote();
      core.tools.draftNote.set('Layout regression note');
      core.tools.saveNote();
    });
    await settle(page);
    const notePage = await page.evaluate(() => {
      const core = window.ng.getComponent(document.querySelector('app-reader-core'));
      const note = core.railNotes()[0];
      core.goToNote(note);
      return note.page;
    });
    assert(notePage > 1, 'Note should locate its passage within the long paragraph');
    await settle(page);
    assert(
      await page.evaluate(() => {
        const host = document.querySelector('app-reader-core');
        const viewport = host.querySelector('.reader-viewport').getBoundingClientRect();
        return [...host.querySelectorAll('.reader-highlight')].some((mark) =>
          [...mark.getClientRects()].some(
            (rect) =>
              rect.left >= viewport.left - 1 &&
              rect.right <= viewport.right + 1 &&
              rect.top >= viewport.top - 1 &&
              rect.bottom <= viewport.bottom + 1,
          ),
        );
      }),
      'Note navigation did not reveal highlighted text',
    );
    console.log('PASS resize preserves passage; note navigation locates a split paragraph');

    // Scroll mode still exposes the complete article and removes the height constraint.
    await page.evaluate(() =>
      window.ng
        .getComponent(document.querySelector('app-reader-core'))
        .prefs.setReaderPageFlip(false),
    );
    await settle(page);
    assert(
      await page.evaluate(() => {
        const host = document.querySelector('app-reader-core');
        return (
          !host.classList.contains('reader-paged') &&
          host.getBoundingClientRect().height > window.innerHeight &&
          host
            .querySelector('.reader-article-body')
            .textContent.includes('Last sentence of the article.')
        );
      }),
      'Scroll mode lost content',
    );
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log(`PASS ${checkedPages} real page turns; scroll mode; no browser runtime errors`);
  } finally {
    await browser.close();
  }
}

async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      ),
  );
  await page.waitForTimeout(100);
}

async function installFixture(page, fixture) {
  await page.evaluate((fixture) => {
    const parent = window.ng.getComponent(document.querySelector('app-read-page'));
    const core = window.ng.getComponent(document.querySelector('app-reader-core'));
    const original = core.chain()[0];
    const root = {
      ...original,
      id: fixture.name,
      content: fixture.content,
      provider: fixture.rss ? 'rss' : 'paste',
      in_reply_to_id: null,
      media_attachments: [],
    };
    const image = {
      id: 'image',
      type: 'image',
      url:
        'data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="1800"><rect width="100" height="1800" fill="blue"/></svg>',
        ),
      preview_url: '',
      description: 'Tall fixture image',
    };
    const chain = fixture.storm
      ? [
          root,
          {
            ...root,
            id: root.id + '2',
            content: '',
            in_reply_to_id: root.id,
            media_attachments: [image],
          },
          {
            ...root,
            id: root.id + '3',
            in_reply_to_id: root.id + '2',
            content: '<p>Final storm sentence follows the picture.</p>',
          },
        ]
      : [root];
    parent.displayedThread.set(chain);
    parent.displayedId.set(root.id);
  }, fixture);
  await settle(page);
  if (fixture.markdown) {
    await page.evaluate((markdown) => {
      const core = window.ng.getComponent(document.querySelector('app-reader-core'));
      core.expansion.result.set({
        requestedUrl: 'https://example.test/article',
        finalUrl: 'https://example.test/article',
        card: null,
        diagnosis: 'ok',
        fetchedAt: new Date().toISOString(),
        article: {
          title: 'Reader layout fixture',
          byline: 'Test author',
          siteName: 'Fixture',
          markdown,
          images: [],
          quality: 'good',
          metrics: { wordCount: 1000, linkDensity: 0, paragraphCount: 6, textToMarkupRatio: 1 },
        },
      });
    }, fixture.markdown);
    await settle(page);
  }
}

async function verifyPages(page) {
  await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-reader-core')).goToPage(1),
  );
  await settle(page);
  const count = await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-reader-core')).pageCountForTest(),
  );
  assert(count > 1, 'Long fixture must paginate');
  // Record each actual line rectangle's identity across successive arrow presses.
  // Every line must be fully visible exactly once, rather than partly below the fold.
  const seen = new Set();
  let expected = 0;
  for (let index = 0; index < count; index++) {
    const geometry = await page.evaluate(() => {
      const host = document.querySelector('app-reader-core');
      const core = window.ng.getComponent(host);
      const viewport = host.querySelector('.reader-viewport').getBoundingClientRect();
      const body = host.querySelector('.reader');
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const visible = [],
        bad = [];
      let total = 0,
        nodeIndex = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        nodeIndex++;
        if (
          !node.textContent.trim() ||
          !node.parentElement.closest('.reader-posts,.reader-article-body')
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        [...range.getClientRects()]
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .forEach((rect, rectIndex) => {
            total++;
            if (rect.right > viewport.left + 1 && rect.left < viewport.right - 1) {
              if (
                rect.top < viewport.top - 1 ||
                rect.bottom > viewport.bottom + 1 ||
                rect.left < viewport.left - 1 ||
                rect.right > viewport.right + 1
              )
                bad.push({
                  text: node.textContent.slice(0, 80),
                  top: rect.top,
                  bottom: rect.bottom,
                  left: rect.left,
                  right: rect.right,
                });
              visible.push(nodeIndex + ':' + rectIndex);
            }
          });
      }
      for (const image of body.querySelectorAll('img.reader-media,.reader-article-body img')) {
        for (const rect of image.getClientRects()) {
          if (
            rect.right > viewport.left + 1 &&
            rect.left < viewport.right - 1 &&
            (rect.top < viewport.top - 1 || rect.bottom > viewport.bottom + 1)
          )
            bad.push({ image: true, top: rect.top, bottom: rect.bottom });
        }
      }
      return {
        page: core.pageNumber(),
        total,
        visible,
        bad,
        bottom: viewport.bottom,
        height: window.innerHeight,
      };
    });
    assert.equal(geometry.page, index + 1, 'Right arrow skipped or repeated a page');
    assert(geometry.bottom <= geometry.height + 1, 'Reader extends below the viewport');
    assert.deepEqual(geometry.bad, [], `Clipped content on page ${index + 1}`);
    expected = geometry.total;
    for (const line of geometry.visible) {
      assert(!seen.has(line), 'Line repeated on two pages');
      seen.add(line);
    }
    if (index < count - 1) {
      await page.keyboard.press('ArrowRight');
      await settle(page);
    }
  }
  assert.equal(seen.size, expected, 'Arrow navigation skipped some text lines');
  return count;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
