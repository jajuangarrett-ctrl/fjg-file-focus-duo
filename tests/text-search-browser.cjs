// Real dialog code + synthetic Obsidian APIs. No vault data, microphone, key or API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('playwright-core');

(async () => {
  const mock = `
export class TFile { constructor(path) { this.path=path; this.stat={size:40}; this.parent={path:path.split('/').slice(0,-1).join('/')}; } }
export const Platform={isMobile:true};
export const requestUrl=()=>{window.apiCalls++;throw Error('No network in local search');};
export class Notice { constructor(text){window.notices.push(text);} }
export class Modal {
 constructor(app){this.app=app;this.modalEl=document.createElement('section');this.modalEl.className='modal';this.titleEl=document.createElement('h2');this.contentEl=document.createElement('div');this.contentEl.className='modal-content';this.modalEl.append(this.titleEl,this.contentEl);}
 open(){this.returnFocus=document.activeElement;document.body.append(this.modalEl);this.key=e=>{if(e.key==='Escape'&&this.modalEl===document.querySelector('.modal:last-of-type')){e.stopImmediatePropagation();this.close();}};document.addEventListener('keydown',this.key);this.onOpen?.();}
 close(){document.removeEventListener('keydown',this.key);this.onClose?.();this.modalEl.remove();this.returnFocus?.focus();}
}`;
  const setup = `
import {VaultVoiceModal} from './src/live/modal';
import {TFile} from 'obsidian';
window.apiCalls=0;window.micCalls=0;window.keyCalls=0;window.opened=[];window.notices=[];window.reads=0;window.delay=0;window.fail=false;
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia(){window.micCalls++;throw Error('No microphone in local search');}}});
const proto=HTMLElement.prototype;
proto.addClass=function(...v){this.classList.add(...v)};proto.setText=function(t){this.textContent=t};proto.empty=function(){this.replaceChildren()};proto.appendText=function(t){this.append(document.createTextNode(t))};
proto.createEl=function(tag,o={}){const el=document.createElement(tag);if(o.text)el.textContent=o.text;if(o.cls)el.className=o.cls;for(const k of ['type','value','href','placeholder'])if(o[k])el[k]=o[k];Object.entries(o.attr||{}).forEach(([k,v])=>el.setAttribute(k,v));this.append(el);return el;};
proto.createDiv=function(o){return this.createEl('div',o)};proto.createSpan=function(o){return this.createEl('span',o)};
const files=Array.from({length:25},(_,i)=>new TFile('Notes/Summer '+String(i).padStart(2,'0')+'.md')).concat(new TFile('Files/Budget.pdf'),new TFile('Notes/Other.md'));
const app={vault:{getFiles:()=>{if(window.fail)throw Error('fixture failure');return files;},getAbstractFileByPath:path=>files.find(f=>f.path===path),read:async f=>{window.reads++;await new Promise(r=>setTimeout(r,window.delay));return f.path.includes('Other')?'quiet winter':'summer program';}},
workspace:{getLeavesOfType:()=>[],getLeaf:()=>({openFile:async f=>{window.opened.push(f.path);}}),revealLeaf:async()=>{}}};
const plugin={settings:{liveApiKey:'',liveBackendModel:'fixture'},resolveVoiceApiKey:async()=>{window.keyCalls++;throw Error('No key access in local search');},revealFolderPath:async()=>{}};
window.openVoice=()=>{window.voice=new VaultVoiceModal(app,plugin,{folder:'Unrelated',note:''},()=>{});window.voice.open();};
window.openVoice();`;

  const bundle = await esbuild.build({stdin:{contents:setup,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',
    plugins:[{name:'mock-obsidian',setup(build){build.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'mock'}));build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'js'}));}}]});
  const browser = await chromium.launch({executablePath:process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.abort());
    await page.setContent('<style>html{font:16px sans-serif}*{box-sizing:border-box}body{margin:0}.modal{position:fixed;inset:10px auto auto 50%;transform:translateX(-50%);background:#fff;padding:16px;overflow:auto;border:1px solid #ccc}.modal-content{overflow:auto}button,input,select{padding:8px;border:1px solid #888}a{color:blue}</style>');
    await page.addStyleTag({content:fs.readFileSync('styles.css','utf8')});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const open = async()=>{await page.getByRole('button',{name:'Type a search of the entire vault'}).click();await page.getByRole('searchbox',{name:'Search terms'}).waitFor();};
    await open();
    const input=page.getByRole('searchbox',{name:'Search terms'});
    assert.ok(await input.evaluate(el=>el===document.activeElement));
    await input.press('Enter');await page.getByText('Enter some search terms first.').waitFor();
    await input.fill('summer');await input.press('Enter');
    await page.getByText(/20 of 25 matches shown/).waitFor();
    assert.equal(await page.getByRole('link',{name:/Open Notes\/Summer/}).count(),20);
    await page.getByRole('button',{name:'Show more matches'}).click();await page.getByText(/25 of 25 matches shown/).waitFor();
    assert.equal(await page.getByRole('link',{name:/Open Notes\/Summer/}).count(),25);
    assert.equal(await page.getByRole('button',{name:'Show more matches'}).count(),0);
    for(const width of [320,390,768,1200]){
      await page.setViewportSize({width,height:844});
      const bounds=await page.locator('.fjgduo-vault-text-search-modal').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,buttons:[...el.querySelectorAll('button,input,select')].map(n=>n.getBoundingClientRect().height)}));
      assert.equal(bounds.overflow,false);assert.ok(bounds.left>=0&&bounds.right<=width+1);assert.ok(bounds.buttons.every(h=>h>=44));
    }
    await page.getByRole('link',{name:'Open Notes/Summer 00.md',exact:true}).click();
    assert.equal(await page.locator('.fjgduo-vault-text-search-modal').count(),0);assert.deepEqual(await page.evaluate(()=>window.opened),['Notes/Summer 00.md']);
    await open();await input.fill('budget');await page.getByRole('combobox',{name:'Search in'}).selectOption('filenames');
    const priorReads=await page.evaluate(()=>window.reads);await input.press('Enter');await page.getByRole('link',{name:'Open Files/Budget.pdf',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.reads),priorReads);
    await input.fill('noexist');await input.press('Enter');await page.getByText(/No matches. Try different words/).waitFor();assert.equal(await page.getByRole('link',{name:/^Open /}).count(),0);
    await page.evaluate(()=>window.fail=true);await input.fill('summer');await input.press('Enter');await page.getByText('Search could not finish. Please try again.').waitFor();assert.equal(await input.isDisabled(),false);await page.evaluate(()=>window.fail=false);
    await page.getByRole('combobox',{name:'Search in'}).selectOption('contents');await page.evaluate(()=>window.delay=60);await input.press('Enter');
    await page.getByRole('button',{name:'Searching…'}).waitFor();assert.equal(await input.isDisabled(),true);
    await page.keyboard.press('Escape');await page.waitForTimeout(150);assert.equal(await page.locator('.fjgduo-vault-text-search-modal').count(),0);
    await open();await page.evaluate(()=>window.delay=0);await input.fill('winter');await input.press('Enter');await page.getByRole('link',{name:'Open Notes/Other.md',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:/Open Notes\/Summer/}).count(),0);
    await page.evaluate(()=>window.voice.close());assert.equal(await page.locator('.modal').count(),0);
    assert.deepEqual(await page.evaluate(()=>({api:window.apiCalls,mic:window.micCalls,keys:window.keyCalls})),{api:0,mic:0,keys:0});assert.deepEqual(errors,[]);
    console.log('PASS: typed search entry, autofocus, Enter, empty input, full-vault scope, paging, filenames without reads, no matches, error retry, close cancellation, fresh reopen, parent close, 320/390/768/1200px layout, 44px controls, zero API/key/microphone access.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
