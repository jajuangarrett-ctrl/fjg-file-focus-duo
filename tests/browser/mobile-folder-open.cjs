const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
    });
    try {
        const page = await browser.newPage({ viewport: { width: 867, height: 669 }, hasTouch: true });
        page.setDefaultTimeout(8000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('fjgFileFocusDuo-mobile-panel', 'folders'));
        const start = async (scenario) => {
            await page.goto('http://127.0.0.1:8847/tests/browser/index.html');
            await page.evaluate(s => { window.route = window.fixture.tabRouting(s); }, scenario);
            await page.getByRole('button', { name: 'Open Projects folder', exact: true }).tap();
            await page.getByRole('button', { name: 'Open Note 0001', exact: true }).waitFor();
        };
        const tap = n => page.getByRole('button', { name: `Open Note 000${n}`, exact: true }).tap();
        const callCount = n => page.waitForFunction(n => window.route.calls.length === n, n);
        const snapshot = () => page.evaluate(() => ({
            calls: window.route.calls, requests: window.route.requests,
            count: window.route.count(), active: window.route.active(),
        }));
        for (const scenario of ['root', 'drawer', 'deferred', 'pinned', 'closed', 'absent', 'linked', 'failed']) {
            await start(scenario);
            const before = (await snapshot()).count;
            await tap(1);
            await callCount(1);
            const existing = ['root','drawer','deferred'].includes(scenario);
            const target = existing ? 'A' : 'new-1';
            await page.waitForFunction(id => window.route.active() === id, target);
            await page.evaluate(() => window.route.enterNavigator());
            await tap(2);
            await callCount(2);
            await page.waitForFunction(id => window.route.active() === id, target);
            const result = await snapshot();
            assert.deepEqual(result.requests, existing ? [] : [true], scenario);
            assert.equal(result.count, before + (existing ? 0 : 1), scenario);
            assert.deepEqual(result.calls, [
                { id: target, path: 'Projects/Note 0001.md' },
                { id: target, path: 'Projects/Note 0002.md' },
            ], scenario);
            assert.equal(await page.locator('.duo-navigator').count(), 1);
        }
        await start('absent');
        await page.evaluate(() => {
            for (const n of [1,2]) document.querySelector(`[aria-label="Open Note 000${n}"]`).click();
        });
        await callCount(2);
        assert.deepEqual((await snapshot()).requests, [true], 'two quick taps share the first new tab');

        await start('root');
        const row = page.getByRole('button', { name: 'Open Note 0001', exact: true });
        await row.evaluate(el => {
            const box = el.getBoundingClientRect();
            const touch = new Touch({identifier:1,target:el,clientX:box.left+10,clientY:box.top+10});
            el.dispatchEvent(new TouchEvent('touchstart', {bubbles:true,touches:[touch]}));
        });
        await page.waitForFunction(() => window.lastMenu?.some(item => item.title === 'Open in a new tab'));
        await page.evaluate(() => window.lastMenu.find(item => item.title === 'Open in a new tab').run(new MouseEvent('click')));
        await callCount(1);
        assert.deepEqual((await snapshot()).requests, [true], 'explicit new tab bypasses reuse');

        await start('root');
        await page.getByRole('button', { name: 'Open Note 0001', exact: true }).click({ button: 'right' });
        await page.evaluate(() => window.lastMenu.find(item => item.title === 'Open to right').run(new MouseEvent('click')));
        await callCount(1);
        assert.deepEqual((await snapshot()).requests, [true,true], 'explicit open-to-right keeps the existing mobile new-tab fallback');
        assert.ok(await page.evaluate(() => window.notices.some(message => message.includes('new tab on mobile'))));

        await start('root');
        await page.evaluate(() => window.route.openTextAttachment());
        assert.deepEqual((await snapshot()).calls, [{id:'A', path:'Projects/Visible text file.txt'}], 'the router handles non-Markdown files');

        await start('desktop');
        await page.getByRole('button', { name: 'Open Note 0001', exact: true }).click();
        await callCount(1);
        assert.deepEqual((await snapshot()).requests, [true], 'desktop keeps normal opener behavior when Duo is active');

        await start('no new tab');
        await tap(1);
        await page.waitForFunction(() => window.notices.some(message => message.includes('Simulated open error')));
        assert.deepEqual((await snapshot()).requests, [true], 'failed fallback never tries the dashboard/current leaf');
        assert.deepEqual(errors, []);
        console.log('Mobile folder-open fixture passed: main tab/drawer, deferred, pinned, closed, absent, linked, failed reuse, rapid taps, explicit long-press new tab, unchanged desktop and safe failure.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
