// Actual Duo components with synthetic notes and a local Omnisearch command stub.
const {chromium} = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
(async () => {
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    const allowed = {'/tests/browser/index.html':'text/html', '/tests/browser/fixture.js':'application/javascript', '/styles.css':'text/css'};
    if (!allowed[name]) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', allowed[name]);
    response.end(fs.readFileSync(path.join(process.cwd(), name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
    for (const width of [264, 390, 867]) {
      const page = await browser.newPage({viewport:{width:1100, height:850}, hasTouch:true});
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/tests/browser/index.html`);
      await page.getByRole('region', {name:'File Focus shortcuts'}).waitFor();
      await page.evaluate(width => { document.getElementById('panel').style.width = width + 'px'; }, width);
      const toolbar = page.getByRole('toolbar', {name:'File Focus Duo', exact:true});
      const search = toolbar.getByRole('button', {name:'Open Omnisearch', exact:true});
      assert.equal(await search.getAttribute('title'), 'Open Omnisearch');
      // Missing dependency is actionable and does not navigate away from Shortcuts.
      await search.click();
      assert.ok((await page.evaluate(() => window.notices)).at(-1).includes('Enable or install'));
      assert.ok(await page.getByRole('region', {name:'File Focus shortcuts'}).isVisible());
      await page.evaluate(() => {
        window.executedCommands = [];
        window.fixture.app.commands.commands['omnisearch:show-modal'] = {};
        window.fixture.app.commands.executeCommandById = id => {
          window.executedCommands.push(id);
          const modal = document.createElement('dialog'); modal.className = 'test-omnisearch';
          modal.innerHTML = '<button>Close search</button>';
          modal.firstChild.onclick = () => modal.remove(); document.body.appendChild(modal); modal.showModal();
          return true;
        };
      });
      async function openAndDismiss() {
        const before = await page.locator('.duo-breadcrumb').innerText();
        const count = await page.evaluate(() => window.executedCommands.length);
        await search.click();
        assert.deepEqual(await page.evaluate(() => window.executedCommands.slice(-1)), ['omnisearch:show-modal']);
        assert.equal(await page.evaluate(() => window.executedCommands.length), count + 1);
        await page.getByRole('button', {name:'Close search', exact:true}).click();
        assert.equal(await page.locator('.test-omnisearch').count(), 0);
        assert.equal(await page.locator('.duo-breadcrumb').innerText(), before);
      }
      // Repeated launches preserve Shortcuts; no local list search is substituted.
      await openAndDismiss(); await openAndDismiss();
      assert.ok(await page.getByRole('region', {name:'File Focus shortcuts'}).isVisible());
      await page.getByRole('button', {name:'Folders', exact:true}).click();
      await page.locator('.fjgduo-folder-block').filter({hasText:'Projects'}).click();
      await openAndDismiss();
      assert.equal(await page.getByRole('searchbox', {name:'Search files by name or tag'}).count(), 0);
      // Local folder filtering remains separately reachable and survives Omnisearch.
      await toolbar.getByRole('button', {name:'All File Focus buttons', exact:true}).click();
      await page.locator('.duo-all-buttons').getByRole('button', {name:'Search files by name or tag', exact:true}).click();
      const filter = page.getByRole('searchbox', {name:'Search files by name or tag'});
      await filter.fill('Note 002'); await openAndDismiss();
      assert.equal(await filter.inputValue(), 'Note 002');
      for (const mode of ['Recent', 'Bookmarks']) {
        await toolbar.getByRole('button', {name:mode, exact:true}).click();
        const before = await page.locator('.fjgduo-focus-panel').innerText();
        await openAndDismiss();
        assert.equal(await toolbar.getByRole('button', {name:mode, exact:true}).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.fjgduo-focus-panel').innerText(), before);
        assert.equal(await page.locator('.fjgduo-focus-panel input').count(), 0);
      }
      await page.evaluate(() => { window.fixture.app.commands.executeCommandById = () => false; });
      await search.click();
      assert.ok((await page.evaluate(() => window.notices)).at(-1).includes('could not open'));
      await page.evaluate(() => { window.fixture.app.commands.executeCommandById = () => {throw new Error('fixture unavailable');}; });
      await search.click();
      assert.ok((await page.evaluate(() => window.notices)).at(-1).includes('Open Omnisearch: fixture unavailable'));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: Omnisearch toolbar at 264/390/867px; missing/refused/throwing commands, repeated open/dismiss, Shortcuts/Folders/Recent/Bookmarks, preserved local filter and no page errors.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
