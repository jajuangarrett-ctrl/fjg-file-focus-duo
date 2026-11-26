const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.DUO_BROWSER_BIN || undefined });
    try {
        for (const [width, reuse] of [[386, false], [871, true]]) {
            const page = await browser.newPage({ viewport: { width, height: 700 }, hasTouch: true });
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto('http://127.0.0.1:8847/tests/browser/index.html');
            await page.evaluate(width => {
                document.body.classList.add('is-mobile');
                document.getElementById('panel').style.width = width + 'px';
            }, width);
            const shortcuts = page.getByRole('button',{name:'Shortcuts',exact:true});
            const folders = page.getByRole('button',{name:'Folders',exact:true});
            await shortcuts.waitFor();
            assert.equal(await shortcuts.getAttribute('aria-pressed'), 'true');
            const reveal = path => page.evaluate(({reuse,path}) => window.fixture.objectiveFolderReveal(reuse,path), {reuse,path});
            assert.deepEqual(await reveal('Projects/Subfolder'), reuse
                ? ['revealed-tab','active-tab']
                : ['new-tab','mount-tab','revealed-tab','active-tab']);
            await page.getByRole('button',{name:'Open Child note',exact:true}).waitFor();
            assert.equal(await folders.getAttribute('aria-pressed'), 'true');
            assert.equal(await page.locator('.duo-back').getAttribute('title'), 'Fixture vault / Projects/Subfolder');
            const missing = await reveal('missing');
            assert.deepEqual(missing,['Folder not found: missing']);
            assert.deepEqual(errors, []);
            console.log(`PASS ${width}px: ${reuse?'reuses':'opens'} the foreground File Focus Duo tab, reveals the exact folder from Shortcuts, leaves sidebar alone, rejects a missing folder`);
            await page.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
