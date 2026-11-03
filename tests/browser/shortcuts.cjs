const {chromium}=require('playwright-core');
const assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const [width,height] of [[264,403],[390,448],[382,567],[867,558],[567,382]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8847/tests/browser/index.html');
  await page.evaluate(({width,height})=>{document.body.classList.add('is-mobile');const p=document.getElementById('panel');p.style.width=width+'px';p.style.height=height+'px';},{width,height});
  const panel=page.getByRole('region',{name:'File Focus shortcuts'});
  await panel.waitFor();
  for(const id of ['home','brief','tasks','agenda','voice','dashboard','new-folder','folder-tags','folder-navigator','omnisearch','follow','folder-sort','folder-path','collapse','expand','search','new-note','delete-note','quick-format','properties','move-note','auto-title','semantic-links','copy-text','copy-path','file-sort','back','folders','root','recent','bookmarks']) assert.equal(await panel.locator(`[data-action-id="${id}"]`).count(),1,id);
  assert.ok(await panel.locator('button').evaluateAll(bs=>bs.every(b=>b.getBoundingClientRect().height>=44 && b.getBoundingClientRect().width>=44)));
  assert.ok(await page.locator('.duo-main-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'horizontal overflow');
  await panel.getByRole('searchbox').fill('folder navigator');
  assert.equal(await panel.locator('button:visible').count(),1);
  await panel.locator('button:visible').click();
  assert.ok((await page.evaluate(()=>window.notices)).some(n=>n.includes('FJG Note Navigator Toolbar')));
  for(let i=0;i<3;i++){
   await page.getByRole('button',{name:'Folders',exact:true}).click();
   assert.equal(await panel.count(),0);
   await page.getByRole('button',{name:'Shortcuts',exact:true}).click();
   await panel.waitFor();
  }
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fjg-vcc-folder-context',{detail:{path:'Projects/Subfolder'}})));
  await page.waitForTimeout(100);
  assert.ok((await panel.locator('.duo-shortcut-context').textContent()).includes('Projects/Subfolder'));
  await page.getByRole('button',{name:'Folders',exact:true}).click();
  assert.ok(await page.getByRole('button',{name:'Open Child note',exact:true}).isVisible());
  // The entire 44px expansion target must respond, including padding outside the SVG.
  await page.locator('.duo-back').click();
  const toggle=page.getByRole('button',{name:'Expand or collapse Projects',exact:true});
  const before=await toggle.getAttribute('aria-expanded');
  await toggle.click({position:{x:2,y:22}});
  assert.notEqual(await toggle.getAttribute('aria-expanded'),before,'folder expansion target padding');

  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}x${height}: all actions, 44px targets, no horizontal overflow, search/error notice, repeated switch`);
  await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
