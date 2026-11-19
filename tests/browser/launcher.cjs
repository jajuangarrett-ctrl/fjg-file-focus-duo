// Real Chromium touch events, React/Recoil and Obsidian-compatible fixture.
const {chromium} = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
    });
    try {
        for (const width of [264, 390, 867]) {
            const page = await browser.newPage({viewport: {width, height: 750}, hasTouch: true});
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => localStorage.setItem('fjgFileFocusDuo-mobile-panel', 'folders'));
            await page.goto('http://127.0.0.1:8847/tests/browser/index.html');
            await page.evaluate(w => {
                document.body.classList.add('is-mobile', 'is-phone');
                document.querySelector('.duo-navigator').classList.add('duo-compact-text');
                Object.assign(document.getElementById('panel').style, {width: w + 'px', height: '650px'});
            }, width);
            const toolbar = page.getByRole('toolbar', {name: 'File Focus Duo', exact: true});
            const launcher = page.getByRole('dialog', {name: 'Launcher', exact: true});
            const recent = toolbar.getByRole('button', {name: 'Recent', exact: true});
            const bookmarks = toolbar.getByRole('button', {name: 'Bookmarks', exact: true});
            const close = () => launcher.getByRole('button', {name: 'Close', exact: true}).tap();
            await page.getByRole('button', {name: 'Open Projects folder', exact: true}).tap();
            await page.waitForFunction(() => document.querySelector('.duo-back')?.textContent.includes('Projects'));
            await recent.tap();
            assert.equal(await launcher.count(), 1);
            assert.equal(await launcher.getByRole('button', {name:'Recent Notes', exact:true}).getAttribute('aria-pressed'), 'true');
            assert.equal(await launcher.locator('.fjgduo-focus-panel__row').count(), 1);
            await launcher.getByRole('button', {name:'Bookmarks', exact:true}).tap();
            await launcher.getByRole('button', {name:/Group/}).tap();
            assert.match(await launcher.innerText(), /Note 0000/);
            await close();
            assert.equal(await launcher.count(), 0);
            assert.match(await toolbar.locator('.duo-back').innerText(), /Projects/);
            await bookmarks.tap();
            const search = launcher.getByRole('searchbox', {name:'Search bookmarks'});
            await search.fill('Note 0001');
            await launcher.getByRole('button', {name:/Note 0001/}).tap();
            await launcher.waitFor({state: 'detached'});
            assert.deepEqual(await page.evaluate(() => window.opened), ['Projects/Note 0001.md']);
            await recent.tap();
            assert.equal(await launcher.getByRole('searchbox', {name:'Search recent notes'}).inputValue(), '');
            await close();
            const layout = await toolbar.locator('.duo-icon-row').evaluate(row => {
                const bounds = row.getBoundingClientRect();
                const rects = [...row.querySelectorAll('button')].map(el => el.getBoundingClientRect());
                const count = {};
                for (const r of rects) count[r.top] = (count[r.top] || 0) + 1;
                return {rows: Object.values(count), valid: rects.every(r => r.width >= 44 && r.height >= 44 && r.left >= bounds.left && r.right <= bounds.right + 0.1)};
            });
            assert.equal(layout.valid, true);
            assert.deepEqual(layout.rows, width === 264 ? [4, 4] : [8]);
            await toolbar.getByRole('button', {name:'All File Focus buttons'}).tap();
            assert.ok(await page.locator('.duo-all-buttons').isVisible());
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('PASS: launcher touch tabs, search, selection, dismissal and reopen; preserved folder; balanced and accessible toolbar at 264/390/867px.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
