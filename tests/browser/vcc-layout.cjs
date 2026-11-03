// Cross-plugin CSS regression: point VCC_CSS at the Vault Control Center stylesheet.
const {chromium}=require('playwright-core');const fs=require('fs');const assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:867,height:558}});
 await page.setContent('<body><div class="sidebar-toggle-button"><div class="clickable-icon">◧</div></div><div class="fjg-vcc" data-theme="light"><main class="fjg-vcc-content"><div class="fjg-vcc-page-layout fjg-vcc-program-layout"><section class="fjg-vcc-folder-rail"><div class="fjg-vcc-panel-header"><button class="fjg-vcc-folder-rail-toggle">Show list</button></div><div class="fjg-vcc-panel-body">Departments</div></section><section>Opened folder contents</section></div></main></div></body>');
 await page.addStyleTag({content:fs.readFileSync(process.env.VCC_CSS,'utf8')});
 const columns=()=>page.locator('.fjg-vcc-program-layout').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
 assert.equal(await columns(),1,'desktop retains original viewport layout');
 await page.evaluate(()=>document.body.classList.add('is-mobile'));
 assert.equal(await columns(),2,'wide mobile uses side by side columns');
 await page.evaluate(()=>document.querySelector('.fjg-vcc').style.width='390px');
 assert.equal(await columns(),1,'narrow panel in a wide viewport uses drill-down');
 await page.evaluate(()=>document.querySelector('.fjg-vcc').setAttribute('data-folder-rail-collapsed','true'));
 assert.equal(await page.locator('.fjg-vcc-panel-body').isVisible(),false);
 assert.ok(await page.locator('.fjg-vcc-folder-rail-toggle').evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44}));
 assert.ok(await page.locator('.sidebar-toggle-button > .clickable-icon').evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44}));
 console.log('PASS: mobile wide columns, narrow panel in wide viewport, collapsed list/reopen button, 44px sidebar toggles, desktop unchanged');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
