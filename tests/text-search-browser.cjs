// Real dialog code + synthetic Obsidian APIs. No vault data, microphone, key or API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('esbuild');
const { chromium } = require('playwright-core');

(async () => {
  const mock = `
export class TFile { constructor(path) { this.path=path; this.stat={size:40}; this.parent={path:path.split('/').slice(0,-1).join('/')}; } }
export const Platform={isMobile:true};
export class FileView { constructor(file){this.file=file;} }
export class WorkspaceMobileDrawer { collapse(){window.drawerCollapses++;} }
export const setIcon=(el,icon)=>{el.dataset.icon=icon;};
export const requestUrl=async options=>{window.apiCalls++;window.requestBody=JSON.parse(options.body);return {status:201,json:{transport:{sdp:'fixture-answer'}}};};
export class Notice { constructor(text){window.notices.push(text);} }
export class Modal {
 constructor(app){
  this.app=app;this.shouldRestoreSelection=true;
  this.containerEl=document.createElement('div');this.containerEl.className='modal-container';
  const backdrop=document.createElement('div');backdrop.className='modal-bg';
  this.modalEl=document.createElement('section');this.modalEl.className='modal';
  const close=document.createElement('button');close.className='modal-close-button';close.textContent='Close';close.addEventListener('click',()=>this.close());
  const header=document.createElement('div');header.className='modal-header';this.titleEl=document.createElement('h2');this.titleEl.className='modal-title';header.append(this.titleEl);
  this.contentEl=document.createElement('div');this.contentEl.className='modal-content';
  this.modalEl.append(close,header,this.contentEl);this.containerEl.append(backdrop,this.modalEl);
 }
 open(){
  this.returnFocus=document.activeElement;document.body.append(this.containerEl);window.scopes++;
  this.key=e=>{if(e.key==='Escape'&&this.containerEl===[...document.querySelectorAll('.modal-container')].at(-1)){e.stopImmediatePropagation();this.close();}};
  document.addEventListener('keydown',this.key);this.onOpen?.();
 }
 close(){
  document.removeEventListener('keydown',this.key);window.scopes--;
  if(this.shouldRestoreSelection)this.returnFocus?.focus();
  const detach=()=>{this.containerEl.remove();this.onClose?.();};
  if(Platform.isMobile)setTimeout(detach,25);else detach();
 }
}`;
  const setup = `
import {VaultVoiceModal} from './src/live/modal';
import {TFile,FileView,Platform,WorkspaceMobileDrawer} from 'obsidian';
let eventId=0;crypto.randomUUID=()=>String(++eventId);window.apiCalls=0;window.micCalls=0;window.keyCalls=0;window.opened=[];window.notices=[];window.reads=0;window.responseDelay=10;window.startDelay=100;window.scopes=0;window.drawerCollapses=0;window.folderReveals=0;window.leavesCreated=0;window.noteOpens=[];window.releases=0;window.mobile=Platform;window.startOrder=[];window.menuHits=[];
const stream=()=>{const track={readyState:'live',enabled:true,muted:false,stop(){this.readyState='ended';}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};};
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{window.micCalls++;const input=stream();window.liveTrack=input.getAudioTracks()[0];return input;}}});
const BrowserAudioContext=window.AudioContext;
window.AudioContext=class {state='suspended';createMediaStreamDestination(){return {stream:stream()};}createOscillator(){return {connect(){},start(){},stop(){}};}createGain(){return {gain:{value:1},connect(){}};}async resume(){window.startOrder.push('audio-resume');this.state='running';}async close(){this.state='closed';}};
class Channel extends EventTarget {
 readyState='open';sent=[];round=0;question='';
 event(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
 send(raw){const e=JSON.parse(raw);this.sent.push(e);if(e.type==='response.item.create'&&e.item.type==='message'){this.question=e.item.content[0].text;this.round=0;}
 if(e.type==='response.create'){const id='r'+this.sent.length;const round=++this.round;setTimeout(()=>{if(this.readyState!=='open')return;
 const envelope=event=>this.event({type:'response.event',...(round===1?{delegation_id:null}:{}),event});
 envelope({type:'response.created',response:{id}});
 if(round===1)envelope({type:'response.output_item.done',response_id:id,item:{type:'function_call',call_id:id,name:'search_vault',arguments:JSON.stringify({query:this.question.includes('summer')?'summer':'winter',folder:'',mode:'contents',offset:0})}});
 else this.event({type:'session.output_transcript.delta',delta:'Here is the AI answer about your winter plan.'});
 envelope({type:'response.completed',response:{id}});},window.responseDelay);}
 if(e.type==='session.close')setTimeout(()=>this.event({type:'session.closed'}),0);
 }
 close(){this.readyState='closed';}
}
window.RTCPeerConnection=class extends EventTarget {connectionState='connected';iceGatheringState='complete';localDescription={sdp:'fixture-offer'};channel=new Channel();constructor(){super();window.peer=this;}addTrack(){return {replaceTrack:async()=>{}};}createDataChannel(){return this.channel;}async createOffer(){return this.localDescription;}async setLocalDescription(){}async setRemoteDescription(){setTimeout(()=>this.channel.event({type:'session.started'}),window.startDelay);}async getStats(){return new Map([['fixture',{type:'outbound-rtp',kind:'audio',bytesSent:Date.now()}]]);}close(){this.connectionState='closed';}};
const proto=HTMLElement.prototype;
proto.addClass=function(...v){this.classList.add(...v)};proto.setText=function(t){this.textContent=t};proto.empty=function(){this.replaceChildren()};proto.appendText=function(t){this.append(document.createTextNode(t))};
proto.createEl=function(tag,o={}){const el=document.createElement(tag);if(o.text)el.textContent=o.text;if(o.cls)el.className=o.cls;for(const k of ['type','value','href','placeholder'])if(o[k])el[k]=o[k];Object.entries(o.attr||{}).forEach(([k,v])=>el.setAttribute(k,v));this.append(el);return el;};
proto.createDiv=function(o){return this.createEl('div',o)};proto.createSpan=function(o){return this.createEl('span',o)};
const files=Array.from({length:25},(_,i)=>new TFile('Notes/Summer '+String(i).padStart(2,'0')+'.md')).concat(new TFile('Files/Budget.pdf'),new TFile('Notes/Other.md'));
const rootSplit={};
const leaves=[];
const workspace={rootSplit,containerEl:document.querySelector('.workspace'),activeLeaf:null,getActiveFile:()=>workspace.activeLeaf?.view.file,
  leftSplit:new WorkspaceMobileDrawer(),rightSplit:new WorkspaceMobileDrawer(),
  getLeavesOfType:()=>leaves,iterateRootLeaves:visit=>leaves.forEach(visit),
  getLeaf:()=>{window.leavesCreated++;const leaf={getRoot:()=>rootSplit,view:new FileView(null),getViewState:()=>({state:{file:leaf.view.file?.path}}),
    openFile:async f=>{if(window.failNote===f.path)throw Error('Synthetic file open failure');leaf.view.file=f;window.noteOpens.push(f.path);}};leaves.push(leaf);return leaf;},
  revealLeaf:async leaf=>{const note=document.querySelector('#note-title');note.textContent=leaf.view.file.path;window.opened.push(leaf.view.file.path);},
  setActiveLeaf:(leaf,{focus})=>{workspace.activeLeaf=leaf;if(focus)throw Error('Should not summon note keyboard');}};
const app={vault:{getName:()=>'Synthetic vault',getFiles:()=>files,getAbstractFileByPath:path=>files.find(f=>f.path===path),read:async f=>{window.reads++;return f.path.includes('Other')?'quiet winter':'summer program';}},workspace};
const plugin={settings:{liveApiKey:'',liveBackendModel:'fixture'},resolveVoiceApiKey:async()=>{window.startOrder.push('key-read');window.keyCalls++;await new Promise(r=>setTimeout(r,40));return 'fixture-key';},revealFolderPath:async()=>{window.folderReveals++;}};
window.openVoice=()=>{window.voice=new VaultVoiceModal(app,plugin,{folder:'Unrelated',note:''},()=>window.releases++);window.voice.open();};
window.tool=(name,args)=>{const d='inject',id='inject'+(++eventId),ch=window.peer.channel;ch.event({type:'response.event',delegation_id:d,event:{type:'response.created',response:{id}}});
ch.event({type:'response.event',delegation_id:d,event:{type:'response.output_item.done',item:{type:'function_call',call_id:id,name,arguments:JSON.stringify(args)}}});
ch.event({type:'response.event',delegation_id:d,event:{type:'response.completed',response:{id}}});return id;};
window.playSyntheticAudio=async()=>{const audio=window.voice.audio;const ac=new BrowserAudioContext();const output=ac.createMediaStreamDestination();const osc=ac.createOscillator();const gain=ac.createGain();gain.gain.value=0;osc.connect(gain);gain.connect(output);osc.start();await ac.resume();audio.srcObject=output.stream;await audio.play();window.syntheticAudio=audio;window.playbackContext=ac;};
document.querySelector('#note-test').addEventListener('click',()=>window.noteClicks=(window.noteClicks||0)+1);
document.querySelector('#note-more').addEventListener('click',()=>{
 document.querySelector('.menu')?.remove();
 const menu=document.body.createDiv({cls:'menu'});
 for(const action of ['Backlinks','Reading view','Split right']){
   const item=menu.createEl('button',{text:action,cls:'menu-item'});
   item.addEventListener('click',()=>{window.menuHits.push(action);menu.remove();});
 }
});
window.openVoice();`;

  const bundle = await esbuild.build({stdin:{contents:setup,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',
    plugins:[{name:'mock-obsidian',setup(build){build.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'mock'}));build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'js'}));}}]});
  const browser = await chromium.launch({executablePath:process.env.DUO_BROWSER_BIN || '/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    page.setDefaultTimeout(6000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.abort());
    await page.setContent('<style>html{font:16px sans-serif;--background-primary:#fff;--text-muted:#454545}*{box-sizing:border-box}body{margin:0}.workspace{width:100vw}.workspace-split.mod-root{display:flex;width:100%;height:100dvh;position:relative}#note{flex:1 1 auto;min-width:0;position:relative;height:100%}#note-more{position:absolute;right:8px;top:8px}.mobile-navbar{position:fixed;bottom:0;left:0;width:100%;height:44px}.menu{position:fixed;z-index:65;right:12px;top:58px;display:grid;background:#fff}.menu-item{min-height:44px}.modal-container{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:50}.modal-bg{position:absolute;inset:0;background:#0008}.modal{position:relative;background:#fff;padding:16px;overflow:auto;border:1px solid #ccc}.modal-close-button{position:absolute;top:4px;right:4px}.modal-content{overflow:auto}.modal-title{margin:0;font-size:18px}button,input,select{padding:8px;border:1px solid #888}a{color:blue}</style><div class="workspace"><div class="workspace-split mod-root"><main id="note" tabindex="0"><span id="note-title">Fixture document</span><button id="note-more" aria-label="Note menu">⋯</button><button id="note-test" style="position:absolute;left:8px;top:90px;">Click note</button></main></div><div class="mobile-navbar"></div></div>');
    await page.addStyleTag({content:fs.readFileSync('styles.css','utf8')});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const centerTap = async (target) => {
      await target.scrollIntoViewIfNeeded();
      const center = await target.evaluate(el=>{
        const r=el.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
        return {x,y,hits:el.contains(document.elementFromPoint(x,y)),html:el.outerHTML.slice(0,110)};
      });
      assert.ok(center.hits, `Wrong hit target: ${JSON.stringify(center)}`);
      await page.touchscreen.tap(center.x,center.y);
    };
    const send = page.getByRole('button',{name:'Send message',exact:true});
    const noteMenu = async action => {
      await centerTap(page.getByRole('button',{name:'Note menu'}));
      await centerTap(page.getByRole('button',{name:action,exact:true}));
      assert.equal(await page.evaluate(()=>window.menuHits.at(-1)),action);
    };

    assert.deepEqual(await page.evaluate(()=>({api:window.apiCalls,mic:window.micCalls,keys:window.keyCalls})),{api:0,mic:0,keys:0});
    await page.getByRole('button',{name:'Type a message',exact:true}).click();
    const input=page.getByRole('textbox',{name:'Message to your vault assistant'});
    assert.ok(await input.evaluate(el=>el===document.activeElement));
    assert.deepEqual(await page.evaluate(()=>({api:window.apiCalls,mic:window.micCalls,keys:window.keyCalls})),{api:0,mic:0,keys:0});
    await input.press('Enter');await page.getByText('Type a message first.',{exact:true}).waitFor();
    await input.fill('IME draft');await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));assert.equal(await page.evaluate(()=>window.apiCalls),0);
    await input.fill('Summarize my winter plan');await centerTap(send);await input.fill('New draft while connecting');
    assert.deepEqual(await page.evaluate(()=>window.startOrder.slice(0,2)),['audio-resume','key-read']);

    await page.getByText('Here is the AI answer about your winter plan.',{exact:true}).first().waitFor();assert.equal(await input.inputValue(),'New draft while connecting');
    await page.getByRole('button',{name:'Send message',exact:true}).waitFor();
    assert.match(await page.locator('.fjgduo-vault-live-status').innerText(),/Ready.*Microphone off/);
    assert.deepEqual(await page.evaluate(()=>({api:window.apiCalls,mic:window.micCalls,keys:window.keyCalls})),{api:1,mic:0,keys:1});
    const protocol=await page.evaluate(()=>window.peer.channel.sent.map(e=>e.type));assert.ok(protocol.includes('response.item.create'));assert.equal(protocol.filter(t=>t==='response.create').length,2);
    for(const width of [320,390,768,1200]){
      await page.setViewportSize({width,height:844});
      await page.waitForFunction(width=>parseFloat(document.querySelector('.modal-container').style.getPropertyValue('--fjgduo-voice-width'))===width,width);
      const bounds=await page.locator('.fjgduo-vault-live-modal').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,textarea:el.querySelector('textarea').getBoundingClientRect().height,buttons:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height).map(n=>n.getBoundingClientRect().height)}));
      assert.equal(bounds.overflow,false);assert.ok(bounds.left>=-1&&bounds.right<=width+1,JSON.stringify({width,bounds}));assert.ok(bounds.textarea>=44);assert.ok(bounds.buttons.every(h=>h>=44));
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
    await page.keyboard.press('Escape');await page.locator('.modal').waitFor({state:'detached'});assert.deepEqual(errors,[]);
    await page.evaluate(()=>window.openVoice());
    const visual = await page.evaluateHandle(()=>window.visualViewport);
    // Emulate keyboard-induced shrink/scroll in Chromium without access to a physical phone.
    await visual.evaluate(vv=>{Object.defineProperty(vv,'height',{configurable:true,value:264});Object.defineProperty(vv,'offsetTop',{configurable:true,value:38});vv.dispatchEvent(new Event('resize'));});
    await page.getByRole('button',{name:'Type a message',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.modal-container').classList.contains('fjgduo-vault-live-keyboard'));
    const keyboard = await page.locator('.fjgduo-vault-live-modal').evaluate(el=>{const modal=el.getBoundingClientRect(), composer=el.querySelector('form').getBoundingClientRect(), send=el.querySelector('form button').getBoundingClientRect();return {top:modal.top,left:modal.left,right:modal.right,bottom:modal.bottom,composer:composer.bottom,send:send.bottom};});
    assert.ok(Math.abs(keyboard.top-38)<=1&&keyboard.left===0&&keyboard.right===390&&keyboard.bottom<=303&&keyboard.composer<=302&&keyboard.send<=302, JSON.stringify(keyboard));
    await page.screenshot({path:'/tmp/duo-vault-keyboard.png'});
    await input.fill('Find summer');await centerTap(send);
    await visual.evaluate(vv=>{delete vv.height;delete vv.offsetTop;vv.dispatchEvent(new Event('resize'));});
    await page.getByRole('heading',{name:'Choose a search result'}).waitFor();
    assert.equal(await page.locator('.modal-container').count(),1);
    assert.equal(await input.isVisible(),false);
    await page.getByRole('button',{name:'Back to Chat'}).click();
    assert.equal(await input.isVisible(),true);
    assert.equal(await page.locator('.fjgduo-vault-live-restore-dock').count(),0);
    assert.equal(await page.evaluate(()=>window.opened.length),0);
    await page.getByRole('button',{name:'Send message',exact:true}).waitFor();
    await input.fill('Find summer again');await input.press('Enter');
    const first=page.getByRole('link',{name:'Open Notes/Summer 00.md',exact:true});
    await first.waitFor();
    await page.evaluate(()=>window.failNote='Notes/Summer 00.md');
    await first.click();
    await page.waitForFunction(()=>window.notices.some(n=>n.includes('could not be opened')));
    assert.equal(await first.isVisible(),true);
    assert.equal(await page.locator('.fjgduo-vault-live-restore-dock').count(),0);
    await page.evaluate(()=>window.playSyntheticAudio());
    await centerTap(page.getByRole('link',{name:'Open Notes/Summer 01.md',exact:true}));
    const restore = page.getByRole('button',{name:/^Show Chat/});
    await restore.waitFor();
    assert.equal(await restore.getByText('Mic off',{exact:true}).count(),1);
    assert.equal(await page.evaluate(()=>window.syntheticAudio===window.voice.audio&&!window.syntheticAudio.paused),true,'same audio keeps playing during note handoff');
    assert.equal(await page.locator('.modal-container').count(),0);
    await centerTap(page.getByRole('button',{name:'Click note'}));
    await centerTap(page.getByRole('button',{name:'Note menu'}));
    assert.equal(await restore.isVisible(),false,'compact chat chip yields to the native menu');
    await centerTap(page.getByRole('button',{name:'Backlinks',exact:true}));
    await restore.waitFor();
    await page.screenshot({path:'/tmp/duo-vault-note-handoff.png'});
    assert.deepEqual(await page.evaluate(()=>({note:document.querySelector('#note-title').textContent,width:document.querySelector('#note').offsetWidth,scope:window.scopes,clicked:window.noteClicks,folderReveals:window.folderReveals,collapses:window.drawerCollapses,connected:window.peer.connectionState,audio:window.voice.audio.isConnected,released:window.releases})),
      {note:'Notes/Summer 01.md',width:390,scope:0,clicked:1,folderReveals:0,collapses:2,connected:'connected',audio:true,released:1});
    const counters=await page.evaluate(()=>({keys:window.keyCalls,api:window.apiCalls,mic:window.micCalls}));
    await restore.click();await input.waitFor();
    await page.getByText('Here is the AI answer about your winter plan.',{exact:true}).first().waitFor();
    assert.deepEqual(await page.evaluate(()=>({keys:window.keyCalls,api:window.apiCalls,mic:window.micCalls})),counters);
    await page.getByRole('button',{name:'Turn on microphone',exact:true}).click();
    await page.getByText('Ready — start speaking',{exact:true}).waitFor({timeout:8000});
    await input.fill('Unsent draft stays here');
    await page.setViewportSize({width:844,height:390});
    const split = page.locator('.fjgduo-vault-live-split-pane');
    await split.waitFor();
    let geometry = await split.evaluate(el=>({chat:el.getBoundingClientRect().toJSON(),note:document.querySelector('#note').getBoundingClientRect().toJSON()}));
    assert.ok(geometry.chat.left===0&&geometry.chat.width>=288&&geometry.chat.right<=geometry.note.left+1&&geometry.note.right===844,JSON.stringify(geometry));
    assert.equal(await page.locator('.modal-container').count(),0);
    assert.equal(await input.inputValue(),'Unsent draft stays here');
    await noteMenu('Reading view');
    assert.equal(await split.count(),1);
    const callId=await page.evaluate(()=>window.tool('open_note',{path:'Notes/Summer 01.md'}));
    await page.waitForFunction(id=>window.peer.channel.sent.some(e=>e.item?.call_id===id&&JSON.parse(e.item.output).opened),callId);
    assert.equal(await split.count(),1);
    assert.equal(await page.evaluate(()=>window.noteOpens.filter(p=>p==='Notes/Summer 01.md').length),1,'existing exact root tab reused');
    await send.waitFor();
    await page.evaluate(()=>window.tool('search_vault',{query:'summer',folder:'',mode:'contents',offset:0}));
    await centerTap(page.getByRole('link',{name:'Open Notes/Summer 03.md',exact:true}));
    assert.equal(await page.locator('#note-title').innerText(),'Notes/Summer 03.md');
    assert.equal(await split.count(),1);
    assert.equal(await input.inputValue(),'Unsent draft stays here');
    await send.waitFor();
    await visual.evaluate(vv=>{Object.defineProperty(vv,'height',{configurable:true,value:226});Object.defineProperty(vv,'offsetTop',{configurable:true,value:14});vv.dispatchEvent(new Event('resize'));});
    await page.waitForFunction(()=>document.querySelector('.workspace-split').classList.contains('fjgduo-vault-live-keyboard'));
    await input.fill('Find winter in wide chat');
    await centerTap(send);
    const sendBottom=await split.locator('form button').evaluate(el=>el.getBoundingClientRect().bottom);
    assert.ok(sendBottom<=240, sendBottom);
    await visual.evaluate(vv=>{delete vv.height;delete vv.offsetTop;vv.dispatchEvent(new Event('resize'));});
    await send.waitFor();
    await page.screenshot({path:'/tmp/duo-vault-wide-019.png'});
    await input.fill('Fold keeps my draft');
    await centerTap(split.getByRole('button',{name:'Show Note',exact:true}));
    await restore.waitFor();assert.equal(await split.count(),0);
    assert.equal(await restore.getByText('Mic on').count(),1);
    await centerTap(page.getByRole('button',{name:'Mute microphone',exact:true}));
    assert.equal(await page.evaluate(()=>window.liveTrack.enabled),false);
    assert.equal(await restore.getByText('Muted').count(),1);
    await page.evaluate(()=>{
      const otherChat=document.createElement('aside');otherChat.className='fjg-live-lane';
      document.querySelector('.workspace-split').append(otherChat);
    });
    await centerTap(restore);await page.locator('.fjgduo-vault-live-modal').waitFor();
    assert.equal(await split.count(),0,'do not overlap Objective Manager’s existing chat lane');
    assert.equal(await input.inputValue(),'Fold keeps my draft');
    await page.evaluate(()=>{document.querySelector('.fjg-live-lane').remove();window.dispatchEvent(new Event('resize'));});
    await split.waitFor();
    assert.equal(await input.inputValue(),'Fold keeps my draft');
    await centerTap(page.getByRole('button',{name:'Note menu'}));await centerTap(page.getByRole('button',{name:'Split right'}));
    await page.setViewportSize({width:390,height:844});await restore.waitFor();
    assert.equal(await split.count(),0);
    await centerTap(restore);await input.waitFor();
    assert.equal(await input.inputValue(),'Fold keeps my draft');
    assert.equal(await page.evaluate(()=>window.liveTrack.enabled),false);
    assert.deepEqual(await page.evaluate(()=>({keys:window.keyCalls,api:window.apiCalls,mic:window.micCalls})),{...counters,mic:counters.mic+1});
    await page.getByRole('button',{name:'End conversation',exact:true}).click();
    await page.getByText('Conversation ended.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.liveTrack.readyState),'ended');
    await page.evaluate(()=>window.playbackContext.close());
    await page.keyboard.press('Escape');await page.locator('.modal').waitFor({state:'detached'});
    assert.equal(await page.locator('.fjgduo-vault-live-split-root').count(),0);
    // Desktop still uses its existing modal and separate result chooser.
    await page.setViewportSize({width:1200,height:800});
    await page.evaluate(()=>{window.mobile.isMobile=false;window.openVoice();});
    await page.getByRole('button',{name:'Type a message',exact:true}).click();await input.fill('Find summer desktop');await input.press('Enter');
    await page.getByText('Choose a search result',{exact:true}).waitFor();
    assert.equal(await page.locator('.modal-container').count(),2);
    await page.getByRole('link',{name:'Open Notes/Summer 02.md',exact:true}).click();
    await page.getByRole('button',{name:'Expand conversation',exact:true}).waitFor();
    assert.equal(await page.locator('.fjgduo-vault-live-restore-dock').count(),0);
    assert.equal(await page.evaluate(()=>window.folderReveals),1);
    await page.keyboard.press('Escape');await page.locator('.modal').waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    console.log('PASS: inline typed composer, no requests on open/toggle/empty submit, exact AI tool continuation, spoken transcript in same conversation, follow-up, keyboard input, busy duplicate block, mic opt-in only, end/restart, 320/390/768/1200px layout and 44px buttons. Also passed: visual viewport keyboard, mobile inline search cancel and failed selection, note handoff to the full canvas, retained playback/connection, direct tool open and tab reuse, one-tap mute, restore, and desktop result modal. Typed null/omitted delegation IDs, tap-before-key startup, compact and wide keyboard hit testing, wide native note/menu hit testing, and fold/draft continuity passed. Synthetic API/audio only.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
