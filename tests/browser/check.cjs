const {chromium}=require('playwright-core');
const fs=require('fs');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1100,height:800},hasTouch:true});
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.goto('http://127.0.0.1:8847/tests/browser/index.html');await page.waitForTimeout(600);
console.log('errors',errors);console.log(await page.locator('body').innerText());
console.log('folder count',await page.locator('.fjgduo-folder-block').count());
await page.locator('.fjgduo-folder-block').filter({hasText:'Projects'}).click();await page.waitForTimeout(300);
console.log('errors',errors);
console.log(await page.evaluate(()=>({layout:document.querySelector('.duo-navigator')?.getAttribute('data-layout'),rows:document.querySelectorAll('.fjgduo-nav-file').length,scroll:document.querySelector('.duo-main-scroll')?.scrollTop,toolbar:document.querySelector('.duo-toolbar')?.getBoundingClientRect().toJSON(),first:document.querySelector('.fjgduo-nav-file')?.getBoundingClientRect().toJSON()})));
await page.screenshot({path:'tests/browser/outer-debug.png'});
await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
