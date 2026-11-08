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
export const requestUrl=async options=>{window.apiCalls++;window.requestBody=JSON.parse(options.body);return {status:201,json:{transport:{sdp:'fixture-answer'}}};};
export class Notice { constructor(text){window.notices.push(text);} }
export class Modal {
 constructor(app){this.app=app;this.modalEl=document.createElement('section');this.modalEl.className='modal';this.titleEl=document.createElement('h2');this.contentEl=document.createElement('div');this.contentEl.className='modal-content';this.modalEl.append(this.titleEl,this.contentEl);}
 open(){this.returnFocus=document.activeElement;document.body.append(this.modalEl);this.key=e=>{if(e.key==='Escape'&&this.modalEl===document.querySelector('.modal:last-of-type')){e.stopImmediatePropagation();this.close();}};document.addEventListener('keydown',this.key);this.onOpen?.();}
 close(){document.removeEventListener('keydown',this.key);this.onClose?.();this.modalEl.remove();this.returnFocus?.focus();}
}`;
  const setup = `
import {VaultVoiceModal} from './src/live/modal';
import {TFile} from 'obsidian';
let eventId=0;crypto.randomUUID=()=>String(++eventId);window.apiCalls=0;window.micCalls=0;window.keyCalls=0;window.opened=[];window.notices=[];window.reads=0;window.responseDelay=10;window.startDelay=100;
const stream=()=>{const track={readyState:'live',enabled:true,muted:false,stop(){this.readyState='ended';}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};};
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{window.micCalls++;return stream();}}});
window.AudioContext=class {state='suspended';createMediaStreamDestination(){return {stream:stream()};}createOscillator(){return {connect(){},start(){},stop(){}};}createGain(){return {gain:{value:1},connect(){}};}async resume(){this.state='running';}async close(){this.state='closed';}};
class Channel extends EventTarget {
 readyState='open';sent=[];round=0;question='';
 event(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
 send(raw){const e=JSON.parse(raw);this.sent.push(e);if(e.type==='response.item.create'&&e.item.type==='message'){this.question=e.item.content[0].text;this.round=0;}
 if(e.type==='response.create'){const id='r'+this.sent.length;const round=++this.round;setTimeout(()=>{if(this.readyState!=='open')return;this.event({type:'response.event',delegation_id:'d',event:{type:'response.created',response:{id}}});
 if(round===1)this.event({type:'response.event',delegation_id:'d',event:{type:'response.output_item.done',response_id:id,item:{type:'function_call',call_id:id,name:'search_vault',arguments:JSON.stringify({query:'winter',folder:'',mode:'contents',offset:0})}}});
 else this.event({type:'session.output_transcript.delta',delta:'Here is the AI answer about your winter plan.'});
 this.event({type:'response.event',delegation_id:'d',event:{type:'response.completed',response:{id}}});},window.responseDelay);}
 if(e.type==='session.close')setTimeout(()=>this.event({type:'session.closed'}),0);
 }
 close(){this.readyState='closed';}
}
window.RTCPeerConnection=class extends EventTarget {connectionState='connected';iceGatheringState='complete';localDescription={sdp:'fixture-offer'};channel=new Channel();constructor(){super();window.peer=this;}addTrack(){return {replaceTrack:async()=>{}};}createDataChannel(){return this.channel;}async createOffer(){return this.localDescription;}async setLocalDescription(){}async setRemoteDescription(){setTimeout(()=>this.channel.event({type:'session.started'}),window.startDelay);}async getStats(){return new Map();}close(){this.connectionState='closed';}};
const proto=HTMLElement.prototype;
proto.addClass=function(...v){this.classList.add(...v)};proto.setText=function(t){this.textContent=t};proto.empty=function(){this.replaceChildren()};proto.appendText=function(t){this.append(document.createTextNode(t))};
proto.createEl=function(tag,o={}){const el=document.createElement(tag);if(o.text)el.textContent=o.text;if(o.cls)el.className=o.cls;for(const k of ['type','value','href','placeholder'])if(o[k])el[k]=o[k];Object.entries(o.attr||{}).forEach(([k,v])=>el.setAttribute(k,v));this.append(el);return el;};
proto.createDiv=function(o){return this.createEl('div',o)};proto.createSpan=function(o){return this.createEl('span',o)};
const files=Array.from({length:25},(_,i)=>new TFile('Notes/Summer '+String(i).padStart(2,'0')+'.md')).concat(new TFile('Files/Budget.pdf'),new TFile('Notes/Other.md'));
const app={vault:{getName:()=>'Synthetic vault',getFiles:()=>files,getAbstractFileByPath:path=>files.find(f=>f.path===path),read:async f=>{window.reads++;return f.path.includes('Other')?'quiet winter':'summer program';}},
workspace:{getActiveFile:()=>null,getLeavesOfType:()=>[],getLeaf:()=>({openFile:async f=>{window.opened.push(f.path);}}),revealLeaf:async()=>{}}};
const plugin={settings:{liveApiKey:'',liveBackendModel:'fixture'},resolveVoiceApiKey:async()=>{window.keyCalls++;return 'fixture-key';},revealFolderPath:async()=>{}};
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

    assert.deepEqual(await page.evaluate(()=>({api:window.apiCalls,mic:window.micCalls,keys:window.keyCalls})),{api:0,mic:0,keys:0});
    await page.getByRole('button',{name:'Type a message',exact:true}).click();
    const input=page.getByRole('textbox',{name:'Message to your vault assistant'});
    assert.ok(await input.evaluate(el=>el===document.activeElement));
    assert.deepEqual(await page.evaluate(()=>({api:window.apiCalls,mic:window.micCalls,keys:window.keyCalls})),{api:0,mic:0,keys:0});
    await input.press('Enter');await page.getByText('Type a message first.',{exact:true}).waitFor();
    await input.fill('IME draft');await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));assert.equal(await page.evaluate(()=>window.apiCalls),0);
    await input.fill('Summarize my winter plan');await input.press('Enter');await input.fill('New draft while connecting');
    await page.getByText('Here is the AI answer about your winter plan.',{exact:true}).waitFor();assert.equal(await input.inputValue(),'New draft while connecting');
    await page.getByRole('button',{name:'Send message',exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>({api:window.apiCalls,mic:window.micCalls,keys:window.keyCalls})),{api:1,mic:0,keys:1});
    const protocol=await page.evaluate(()=>window.peer.channel.sent.map(e=>e.type));assert.ok(protocol.includes('response.item.create'));assert.equal(protocol.filter(t=>t==='response.create').length,2);
    for(const width of [320,390,768,1200]){
      await page.setViewportSize({width,height:844});
      const bounds=await page.locator('.fjgduo-vault-live-modal').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,textarea:el.querySelector('textarea').getBoundingClientRect().height,buttons:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height).map(n=>n.getBoundingClientRect().height)}));
      assert.equal(bounds.overflow,false);assert.ok(bounds.left>=0&&bounds.right<=width+1);assert.ok(bounds.textarea>=88);assert.ok(bounds.buttons.every(h=>h>=44));
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/duo-typed-conversation.png',fullPage:true});
    await input.fill('Now add my update to that note');await input.press('Shift+Enter');assert.ok((await input.inputValue()).includes('\n'));
    await page.evaluate(()=>window.responseDelay=100);await input.press('Enter');
    assert.equal(await page.getByRole('button',{name:'Assistant working…'}).isDisabled(),true);
    await input.press('Enter');await page.getByRole('button',{name:'Send message',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.apiCalls),1);
    await page.getByRole('button',{name:'Turn on microphone',exact:true}).click();await page.getByText('Warming up microphone… You can keep typing while it gets ready.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.micCalls),1);assert.equal(await page.evaluate(()=>window.apiCalls),1);
    await page.getByRole('button',{name:'End conversation',exact:true}).click();await page.getByText('Conversation ended.',{exact:true}).waitFor();
    await input.fill('Restart by typing');await input.press('Enter');await page.getByRole('button',{name:'Send message',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.micCalls),1);assert.equal(await page.evaluate(()=>window.apiCalls),2);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.modal').count(),0);assert.deepEqual(errors,[]);
    console.log('PASS: inline typed composer, no requests on open/toggle/empty submit, exact AI tool continuation, spoken transcript in same conversation, follow-up, keyboard input, busy duplicate block, mic opt-in only, end/restart, 320/390/768/1200px layout and 44px buttons. Synthetic API/audio only.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
