// Local fixtures only: no vault data, credentials, microphone or OpenAI requests.
const {chromium} = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
(async () => {
  const root = process.cwd(), baseline = process.env.DUO_BASELINE;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const isBaseline = url.pathname.startsWith('/baseline/');
    const name = isBaseline ? url.pathname.slice('/baseline'.length) : url.pathname;
    const allowed = {'/tests/browser/index.html': 'text/html', '/tests/browser/fixture.js': 'application/javascript', '/styles.css': 'text/css'};
    if (!allowed[name] || (isBaseline && !baseline)) {response.writeHead(404).end(); return;}
    response.setHeader('Content-Type', allowed[name]);
    response.end(fs.readFileSync(path.join(isBaseline ? baseline : root, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
    const origin = `http://127.0.0.1:${server.address().port}`;
    const results = [];
    async function measure(width, height, old = false) {
      const page = await browser.newPage({viewport: {width, height}, hasTouch: true});
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + (old ? '/baseline' : '') + '/tests/browser/index.html');
      await page.getByRole('region', {name: 'File Focus shortcuts'}).waitFor();
      await page.evaluate(({width, height}) => {
        document.body.classList.add('is-mobile', 'is-phone');
        document.querySelector('.duo-navigator').classList.add('duo-compact-text');
        Object.assign(document.getElementById('panel').style, {width: width + 'px', height: height + 'px'});
      }, {width, height});
      await page.waitForTimeout(100);
      const metrics = await page.evaluate(() => {
        const panel = document.querySelector('.duo-main-scroll').getBoundingClientRect();
        const tabs = document.querySelector('.duo-panel-switch').getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.duo-shortcuts [data-action-id]')];
        const first = buttons[0].getBoundingClientRect();
        return {headerSpace: first.top - tabs.bottom, visibleActions: buttons.filter(button => {const b = button.getBoundingClientRect(); return b.top >= panel.top && b.bottom <= panel.bottom;}).length, horizontalOverflow: document.querySelector('.duo-main-scroll').scrollWidth > document.querySelector('.duo-main-scroll').clientWidth + 1};
      });
      if (old) {await page.close(); return metrics;}
      const region = page.getByRole('region', {name: 'File Focus shortcuts'});
      assert.ok(metrics.headerSpace <= 76, `Header consumes ${metrics.headerSpace}px`);
      assert.equal(metrics.horizontalOverflow, false);
      assert.equal(await region.locator('.duo-buttons-hint').count(), 0);
      assert.equal(await region.getByRole('searchbox').isVisible(), false);
      await region.getByRole('button', {name: 'Find a button', exact: true}).click();
      await region.getByRole('searchbox').fill('no such shortcut');
      assert.ok(await region.getByText('No matching buttons.').isVisible());
      await region.getByRole('button', {name: 'Find a button', exact: true}).click();
      assert.equal(await region.getByRole('searchbox').isVisible(), false);
      assert.equal(await region.getByText('No matching buttons.').isVisible(), false);
      assert.ok(await region.locator('.duo-buttons-grid button').evaluateAll(buttons => buttons.every(button => {const b = button.getBoundingClientRect(); return b.width >= 44 && b.height >= 44;})));
      const toolbar = page.getByRole('toolbar', {name: 'File Focus Duo', exact: true});
      const rects = await toolbar.locator('.duo-icon-row').evaluate(row => {
        const r = row.getBoundingClientRect();
        return [...row.querySelectorAll('button')].map(button => {const b = button.getBoundingClientRect(); return {label: button.ariaLabel, x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height, contained: b.left >= r.left - .5 && b.right <= r.right + .5};});
      });
      assert.equal(rects.length, 8);
      assert.ok(rects.every(b => b.width >= 44 && b.height >= 44 && b.contained));
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j]; assert.ok(a.right <= b.x + .5 || b.right <= a.x + .5 || a.bottom <= b.y + .5 || b.bottom <= a.y + .5, 'overlapping toolbar targets');
      }
      await toolbar.getByRole('button', {name: 'Open Vault Control Center', exact: true}).click();
      assert.ok((await page.evaluate(() => window.notices)).some(n => n.includes('Vault Control Center')));
      await toolbar.getByRole('button', {name: 'Open FJG Objective Manager', exact: true}).click();
      assert.ok((await page.evaluate(() => window.notices)).some(n => n.includes('Task Manager')));
      await page.evaluate(() => {
        window.executedCommands = [];
        window.fixture.app.commands.commands['fjg-task-manager:open-dashboard'] = {};
        window.fixture.app.commands.executeCommandById = id => {window.executedCommands.push(id); return true;};
      });
      await toolbar.getByRole('button', {name: 'Open Vault Control Center', exact: true}).click();
      await toolbar.getByRole('button', {name: 'Open FJG Objective Manager', exact: true}).click();
      assert.deepEqual(await page.evaluate(() => window.executedCommands), ['vault-control-center:open-vault-control-center', 'fjg-task-manager:open-dashboard']);
      await toolbar.getByRole('button', {name: 'Talk to Vault', exact: true}).click();
      assert.equal(await page.evaluate(() => window.voiceSelection.folder), '');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('fjg-vcc-folder-context', {detail: {path: 'Projects/Subfolder'}})));
      await page.waitForTimeout(100);
      assert.equal(await region.locator('.duo-shortcut-context').getAttribute('title'), 'Selected folder: Projects/Subfolder');
      await page.getByRole('button', {name: 'Folders', exact: true}).click();
      assert.equal(await region.count(), 0);
      await page.getByRole('button', {name: 'Shortcuts', exact: true}).click();
      assert.ok(await region.isVisible());
      assert.deepEqual(errors, []);
      if (width === 390 || width === 264) await page.screenshot({path: `tests/browser/compact-${width}.png`});
      await page.close(); return {...metrics, toolbarRows: new Set(rects.map(b => b.y)).size};
    }
    for (const [width, height] of [[264,403], [390,448], [382,567], [867,558], [567,382]]) {
      const before = baseline ? await measure(width, height, true) : undefined;
      const after = await measure(width, height);
      if (before) {assert.ok(after.headerSpace < before.headerSpace); assert.ok(after.visibleActions > before.visibleActions, `Expected more visible actions at ${width}: ${before.visibleActions} -> ${after.visibleActions}`);}
      results.push({width, height, before, after});
    }
    console.log(JSON.stringify(results, null, 2));
    console.log('PASS: compact header/search, more visible actions, context/switching, 44px non-overlapping toolbar buttons, missing/available companion commands and voice access at five mobile sizes.');
  } finally {if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
