const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, stat, mkdir } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

const storageKey = 'novel-agent-storage-demo-v1';
const numbering = /第[零〇一二三四五六七八九十百千两\d]+章/g;
const cases = [
  { id: 'demo-school-night', folder: 'school', title: '晚自习后，别回头', characters: 12 },
  { id: 'demo-tide-remembers', folder: 'book', title: '潮汐替人记得', characters: 8 },
];
const compactText = value => value.replace(/\s/g, '');

(async () => {
  const root = resolve(__dirname, '../dist');
  const library = JSON.parse(await readFile(resolve(__dirname, '../src/demo/library.json'), 'utf8'));
  assert.deepEqual(library.novels.map(novel => novel.id), cases.map(novel => novel.id));
  assert.equal(library.characters.length, 20);
  const bodyCounts = {};
  for (const book of cases) {
    const manifest = JSON.parse(await readFile(resolve(root, `${book.folder}/manifest.json`), 'utf8'));
    const chapters = library.chapters.filter(chapter => chapter.novelId === book.id).sort((a, b) => a.sequence - b.sequence);
    const cards = library.plotCards.filter(card => card.novelId === book.id);
    assert.equal(chapters.length, 40);
    assert.equal(cards.filter(card => card.type === 'volume').length, 5);
    assert.equal(cards.filter(card => card.type === 'chapter' && card.chapterId && card.status === 'completed').length, 40);
    let total = 0;
    for (const [index, chapter] of manifest.chapters.entries()) {
      const manuscript = await readFile(resolve(root, `${book.folder}/chapters/${chapter.id}.md`), 'utf8');
      assert.equal(createHash('sha256').update(manuscript.trim() + '\n').digest('hex'), chapter.sha256);
      const body = manuscript.replace(/^# .*\n/, '').trim();
      const count = (body.match(/\p{Script=Han}/gu) || []).length;
      assert.equal(count, chapter.hanCount);
      assert.equal(chapters[index].content, body, `${book.title}: exported DB body differs from manuscript ${chapter.id}`);
      assert.equal(chapters[index].title, chapter.title);
      assert.equal(chapters[index].wordCount, count);
      assert.equal((chapter.title.match(numbering) || []).length, 0, 'Stored titles must omit generated chapter numbering');
      total += count;
    }
    assert.equal(manifest.chapterCount, 40);
    assert.ok(total >= 60000);
    if (book.folder === 'school') assert.ok(total <= 70000);
    assert.equal(total, manifest.hanCount);
    assert.equal(library.novels.find(novel => novel.id === book.id).wordCount, total);
    assert.ok(chapters.at(-1).content.endsWith('——全文完——'));
    bodyCounts[book.title] = total;
  }

  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith('/noval-agent/')) throw Error();
      let path = resolve(root, pathname.slice('/noval-agent/'.length) || 'index.html');
      if (!path.startsWith(root + '/')) throw Error();
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
      response.end(await readFile(path));
    } catch { response.statusCode = 404; response.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/noval-agent/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    await mkdir('/tmp/two-book-product-preview', { recursive: true });
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
      try {
        const page = await context.newPage(), errors = [], writes = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
        const button = name => page.getByRole('button', { name, exact: true });
        const shelf = page.locator('#workspace-bookshelf');
        const openShelf = async () => { if (width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name: '书架', exact: true }).click(); };
        const navigate = async label => { await openShelf(); await shelf.getByRole('button', { name: label, exact: true }).click(); };
        const selectBook = async book => {
          await openShelf(); await shelf.getByRole('button', { name: book.title, exact: true }).click();
          await page.waitForFunction(({ key, novelId }) => {
            const state = JSON.parse(localStorage.getItem(key)).state;
            const chapter = state.chapters.find(item => item.id === state.currentChapterId && item.novelId === novelId);
            return state.currentNovelId === novelId && chapter && document.querySelector('.manuscript-page input')?.value === chapter.title;
          }, { key: storageKey, novelId: book.id });
          await page.locator('.tiptap').waitFor();
        };
        const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, storageKey);

        await page.goto(base + 'book/');
        await page.locator('.tiptap').waitFor();
        assert.equal(new URL(page.url()).pathname, '/noval-agent/');
        const initialized = await state();
        assert.equal(initialized.novels.length, 2);
        assert.equal(initialized.novels[0].title, cases[0].title);
        assert.equal(initialized.currentNovelId, cases[0].id, 'Fresh visitors open the school case');
        assert.equal(initialized.chapters.length, 80);
        assert.equal(initialized.characters.length, 20);
        assert.equal(initialized.plotCards.length, 90);
        assert.equal(initialized.sessions.length, 0);
        assert.deepEqual(initialized.characters, library.characters, 'Both sets of DB profiles reach the product unchanged');
        const firstSchoolChapter = library.chapters.find(chapter => chapter.novelId === cases[0].id);
        assert.equal(compactText(await page.locator('.tiptap').innerText()), compactText(firstSchoolChapter.content));
        await page.screenshot({ path: `/tmp/two-book-product-preview/school-start-${width}.png` });
        await openShelf();
        assert.equal(await page.locator('.shelf-book').count(), 2);
        for (const book of cases) {
          const cover = page.getByAltText(`${book.title}封面`);
          await cover.evaluate(image => image.decode());
          assert.ok(await cover.evaluate(image => image.naturalWidth > 0));
        }
        await page.screenshot({ path: `/tmp/two-book-product-preview/bookshelf-${width}.png` });

        for (const book of cases) {
          await selectBook(book);
          const chapters = library.chapters.filter(chapter => chapter.novelId === book.id).sort((a, b) => a.sequence - b.sequence);
          const profiles = library.characters.filter(character => character.novelId === book.id);
          assert.equal(compactText(await page.locator('.tiptap').innerText()), compactText(chapters[0].content));
          assert.equal(await page.getByPlaceholder('章节标题', { exact: true }).inputValue(), chapters[0].title);

          await navigate('人物');
          await page.getByRole('status').filter({ hasText: '画布已就绪' }).waitFor();
          await page.getByRole('button', { name: /^编辑关系：/ }).first().waitFor();
          assert.equal(await page.locator('[data-character-node]').count(), book.characters);
          assert.ok(await page.getByRole('button', { name: /^编辑关系：/ }).count() > 0, `${book.title}: DB relationships must be visible`);
          assert.equal(await page.locator('[data-character-node] .character-avatar[style*="background-image"]').count(), book.characters);
          await page.locator('[data-character-node] .character-avatar img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
          for (const profile of profiles) {
            assert.ok(profile.description && profile.personality && profile.appearance && profile.background);
            assert.ok(profile.relationships?.length && profile.avatar);
            const node = button(`查看人物：${profile.name}`);
            assert.ok((await node.locator('.character-avatar').getAttribute('style')).includes(`/noval-agent/${book.folder}/images/portraits.webp`));
          }
          await button('人物列表').click();
          assert.equal(await page.locator('#workspace-content h3').count(), book.characters);
          assert.equal(await page.locator('#workspace-content .character-avatar').count(), book.characters);
          if (width < 640) {
            const fields = await page.locator('.character-profile-fields').first().boundingBox();
            const card = await page.locator('.character-profile-row').first().boundingBox();
            assert.ok(fields.width >= card.width - 1, 'Mobile character details must use the full card width');
          }
          for (const profile of profiles) {
            await page.getByRole('heading', { name: profile.name, exact: true }).waitFor();
            await page.getByText(profile.personality, { exact: true }).waitFor();
          }
          const firstProfile = profiles[0];
          await page.getByRole('heading', { name: firstProfile.name, exact: true }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByText(firstProfile.relationships[0].notes, { exact: true }).waitFor();
          assert.equal(await dialog.locator('.character-avatar').count(), 1);
          await dialog.getByRole('button', { name: '取消', exact: true }).click();
          await dialog.waitFor({ state: 'hidden' });
          await page.screenshot({ path: `/tmp/two-book-product-preview/${book.folder}-characters-${width}.png` });

          await navigate('世界观');
          const art = page.locator('.world-setting-content img').first();
          await art.waitFor(); await art.scrollIntoViewIfNeeded(); await art.evaluate(image => image.decode());
          assert.ok(await art.evaluate(image => image.naturalWidth > 0));
          await page.screenshot({ path: `/tmp/two-book-product-preview/${book.folder}-world-${width}.png` });

          await navigate('大纲');
          await page.getByText('共 5 卷，40 章', { exact: true }).waitFor();
          assert.equal(await page.locator('.chapter-outline-scroll h4').count(), 40);
          for (const title of await page.locator('.chapter-outline-scroll h4').allTextContents()) assert.equal((title.match(numbering) || []).length, 0);
          await page.screenshot({ path: `/tmp/two-book-product-preview/${book.folder}-outline-${width}.png` });

          await navigate('章节');
          if (width < 768) await page.getByRole('button', { name: /^章节目录/ }).click();
          const entries = page.locator('.chapter-entry > button');
          assert.equal(await entries.count(), 40);
          for (const text of await entries.allTextContents()) assert.equal((text.match(numbering) || []).length, 1, 'Chapter directory must show one generated number per title');
          assert.deepEqual(await page.locator('.chapter-entry-title').allTextContents(), chapters.map(chapter => chapter.title));
          await entries.last().click();
          await page.waitForFunction(() => document.querySelector('.tiptap')?.textContent.includes('——全文完——'));
          assert.equal(compactText(await page.locator('.tiptap').innerText()), compactText(chapters.at(-1).content));
          assert.equal(await page.getByPlaceholder('章节标题', { exact: true }).inputValue(), chapters.at(-1).title);
          await page.screenshot({ path: `/tmp/two-book-product-preview/${book.folder}-ending-${width}.png` });
          await page.reload(); await page.locator('.tiptap').waitFor();
          assert.match(await page.locator('.tiptap').innerText(), /——全文完——/);
          assert.equal((await state()).currentNovelId, book.id);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        }
        for (const book of cases) {
          await selectBook(book);
          assert.match(await page.locator('.tiptap').innerText(), /——全文完——/, 'Book switching keeps each reading position');
        }
        const final = await state();
        assert.equal(final.novels.length, 2); assert.equal(final.chapters.length, 80); assert.equal(final.characters.length, 20);
        assert.deepEqual(errors, []); assert.deepEqual(writes, []);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ novels: 2, chapters: 80, bodyHan: bodyCounts, checks: ['both DB snapshots equal manuscripts', 'school default and retained Tide case', 'two-book shelf and covers', '20 detailed character portraits and explicit relationships', 'five volumes / 40 completed chapter outlines each', 'single chapter numbering', 'both endings, reload and per-book reading memory', '390px and 1680px product UI'], screenshots: '/tmp/two-book-product-preview' }));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
