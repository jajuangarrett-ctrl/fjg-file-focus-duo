const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
    });
    try {
        for (const width of [390, 867]) {
            const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, hasTouch: true });
            page.setDefaultTimeout(8000);
            await page.addInitScript(() => localStorage.setItem('fjgFileFocusDuo-mobile-panel', 'folders'));
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8847/') ? route.continue() : route.abort());
            await page.goto('http://127.0.0.1:8847/tests/browser/index.html');
            await page.evaluate(width => {
                document.body.classList.add('is-mobile');
                const panel = document.getElementById('panel');
                panel.style.width = width + 'px'; panel.style.height = '558px';
            }, width);
            await page.getByRole('button', { name: 'Open Sample pages folder', exact: true }).tap();
            const row = (name) => page.getByRole('button', { name: 'Open Fixture ' + name, exact: true });
            await row('valid').waitFor();
            await row('fragment').waitFor();
            assert.equal(await row('ordinary text').count(), 1);
            assert.equal(await row('normal note').count(), 1);
            assert.equal(await row('fake').count(), 0);
            assert.equal(await row('fenced').count(), 0);
            const reads = () => page.evaluate(() => window.fixture.htmlState.reads());
            assert.deepEqual(await reads(), {
                'Sample pages/Fixture valid.html': 1,
                'Sample pages/Fixture fragment.HTM': 1,
                'Sample pages/Fixture fake.html': 1,
                'Sample pages/Fixture fenced.htm': 1,
            });
            await page.getByRole('button', { name: 'All File Focus buttons', exact: true }).tap();
            await page.locator('.duo-all-buttons').getByRole('button', { name: 'Search files by name or tag', exact: true }).tap();
            const search = page.getByRole('searchbox', { name: 'Search files by name or tag' });
            await search.fill('all:Fixture fake');
            await page.getByText('No matching files in this folder.', { exact: true }).waitFor();
            assert.equal(await row('fake').count(), 0);
            await page.evaluate(() => window.fixture.htmlState.replace('Fixture fake.html', '<main><h1>Now valid</h1></main>'));
            await row('fake').waitFor();
            await page.evaluate(() => window.fixture.htmlState.replace('Fixture fake.html', 'Now plain text again.'));
            await page.getByText('No matching files in this folder.', { exact: true }).waitFor();
            await page.waitForFunction(() => window.fixture.htmlState.reads()['Sample pages/Fixture fake.html'] === 3);
            assert.equal(await row('fake').count(), 0);
            await page.evaluate(() => {
                window.fixture.htmlState.pauseRead('Fixture fake.html');
                window.fixture.htmlState.replace('Fixture fake.html', '<main>Earlier valid edit</main>');
            });
            await page.waitForFunction(() => window.fixture.htmlState.reads()['Sample pages/Fixture fake.html'] === 4);
            await page.evaluate(() => window.fixture.htmlState.replace('Fixture fake.html', 'Latest plain text edit'));
            await page.waitForFunction(() => window.fixture.htmlState.reads()['Sample pages/Fixture fake.html'] === 5);
            await page.evaluate(() => window.fixture.htmlState.finishRead());
            assert.equal(await row('fake').count(), 0, 'late valid read must not override the newer plain text result');
            await search.fill('all:Fixture ordinary');
            await row('ordinary text').waitFor();
            await search.fill('all:Fixture valid');
            await row('valid').waitFor();
            const finalReads = await reads();
            assert.equal(finalReads['Sample pages/Fixture valid.html'], 1);
            assert.equal(finalReads['Sample pages/Fixture ordinary text.txt'], undefined);
            assert.deepEqual(errors, []);
            console.log(`PASS ${width}px Duo folder and all-file search: real HTML appears, misleading HTML excluded, generic text untouched, edits and cache verified`);
            await page.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
