const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('fjgFileFocusDuo-mobile-panel','folders'));
  await page.goto('http://127.0.0.1:8847/tests/browser/index.html');
  for(const width of [264,382,390,867]){
   await page.evaluate(width=>{document.querySelector('#panel').style.width=width+'px';},width);
   const voice=page.getByRole('button',{name:'Talk to Vault',exact:true});await voice.waitFor();
   const info=await page.locator('.duo-icon-row').evaluate(row=>({width:row.clientWidth,scroll:row.scrollWidth,buttons:[...row.querySelectorAll('button')].map(b=>({label:b.ariaLabel,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,x:b.getBoundingClientRect().x,right:b.getBoundingClientRect().right}))}));
   console.log(JSON.stringify({panel:width,...info}));
   assert.equal(info.buttons.length,6);assert.ok(info.buttons.every(b=>b.width>=44&&b.height>=44));
   await voice.click();assert.equal(await page.evaluate(()=>window.voiceSelection.folder),'');
  }
  await page.locator('.fjgduo-folder-block').filter({hasText:'Projects'}).click();
  await page.getByRole('button',{name:'Talk to Vault',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.voiceSelection),{folder:'Projects',note:'Projects/Note 0000.md'});
  assert.deepEqual(await page.evaluate(()=>window.testVoiceKeyResolution()),{shared:true,own:true,reads:1,recoveries:0,saves:0});
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'tests/browser/voice-toolbar.png'});
  console.log('PASS: toolbar across four widths, touch targets, current folder/note, shared key read without recovery or persistence (fixtures only).');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
