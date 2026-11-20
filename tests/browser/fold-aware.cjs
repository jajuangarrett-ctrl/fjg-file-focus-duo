// Local-only. Run from the plugin root: node tests/browser/fold-aware.cjs /path/to/0.1.14/git/checkout
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { chromium } = require('playwright-core');
const repo = process.cwd();
const base = process.argv[2];
const baseCommit = 'e32c7d6d43ada1c622c15c617e17559e4c87f470';

async function build(root) {
    const fixture = path.join(root, 'tests/browser/fixture.tsx');
    const obsidian = path.join(root, 'tests/browser/obsidian.ts');
    return (await esbuild.build({
        absWorkingDir: root,
        stdin: {
            contents: `import './fixture';
import Plugin from '../../src/main';
import { FileTreeView } from '../../src/FileTreeView';
import { DEFAULT_SETTINGS } from '../../src/settings';
const f = (window as any).fixture;
const plugin:any = new Plugin();
const leaves:any[] = [];
const events = new Map<string,Set<Function>>();
const existing = f.app.workspace;
const commands = new Map();
let stored:any = (window as any).initialDuoSettings || {};
let drafts:any[] = [];
let collision:string | null = null;
let settingsTab:any;
Object.assign(existing, {
    on: (name:string, fn:Function) => {
        if (!events.has(name)) events.set(name,new Set());
        events.get(name)!.add(fn);
        return {name,fn};
    },
    offref: ({name,fn}:any) => events.get(name)?.delete(fn),
    trigger: (name:string,...args:any[]) => [...(events.get(name)??[])].forEach(fn=>fn(...args)),
    onLayoutReady: ()=>{},
    getLeavesOfType: ()=>leaves.slice(),
});
Object.assign(f.app.vault,{on:()=>({}),off:()=>{},
 adapter:{exists:async (path:string)=>path===collision},
 create:async (name:string,content:string)=>{
   if(collision===null){collision=name;throw new Error('Fixture collision');}
   drafts.push({name,content});return {path:name};
 },
});
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async (text:string)=>{(window as any).fixtureClipboard=text;}}});
Object.assign(f.app.commands,{addCommand:(cmd:any)=>commands.set(cmd.id,cmd),removeCommand:(id:string)=>commands.delete(id)});
const noop = ()=>{};
Object.assign(plugin,{
 app:f.app, manifest:{id:'fjg-file-focus-duo'}, addSettingTab:(tab:any)=>{settingsTab=tab;},
 registerView:noop,addCommand:(cmd:any)=>commands.set('fjg-file-focus-duo:'+cmd.id,cmd),
 removeCommand:(id:string)=>commands.delete(id)||commands.delete('fjg-file-focus-duo:'+id),
 registerEvent:noop, addRibbonIcon:()=>document.createElement('div'),
 register:noop, bookmarksRemoveEventListener:noop,
 loadData:async()=>JSON.parse(JSON.stringify(stored)),
 saveData:async (settings:any)=>{stored=JSON.parse(JSON.stringify(settings));},
});
async function open(panel:HTMLElement) {
    const leaf:any={app:f.app,contentEl:panel, getViewState:()=>({type:plugin.VIEW_TYPE}), detach:()=>{const i=leaves.indexOf(leaf);if(i>=0)leaves.splice(i,1)}};
    leaf.view = new FileTreeView(leaf,plugin);
    leaves.push(leaf);
    await leaf.view.onOpen();
    return leaf;
}
(async () => {
    document.body.classList.add('is-mobile');
    document.getElementById('mount')!.remove();
    await plugin.onload();
    const primary = await open(document.getElementById('panel')!);
    (window as any).foldHarness={
      primary,plugin,commands,events,drafts,open,
      close: async (leaf:any)=>{await leaf.view.onClose();leaf.detach();},
      set: async (name:string,value:any)=>{plugin.settings[name]=value;await plugin.saveSettings();},
      stored:()=>stored, reload:()=>plugin.loadSettings(),
      defaults:DEFAULT_SETTINGS,
      settingsRows:()=>{settingsTab.display();return [...settingsTab.containerEl.querySelectorAll('[data-label]')].map((el:any)=>el.dataset.label);},
    };
})().catch(error=>setTimeout(()=>{throw error},0));
`,
            loader: 'tsx',
            sourcefile: 'tests/browser/fold-aware-harness.tsx',
            resolveDir: path.dirname(fixture),
        },
        bundle: true, write: false, platform: 'browser', format: 'iife',
        tsconfig: 'tsconfig.json',
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: { obsidian },
        plugins: [{
            name:'adapt-existing-offline-fixture',
            setup(build) {
                build.onLoad({filter:/\/tests\/browser\/fixture\.tsx$/}, ({path:p}) => ({
                    loader:'tsx', contents:fs.readFileSync(p,'utf8').replace(/^createRoot\(document\.getElementById\('mount'\).+$/m,''),
                }));
                build.onLoad({filter:/\/tests\/browser\/obsidian\.ts$/}, ({path:p}) => ({
                    loader:'ts', contents:fs.readFileSync(p,'utf8').replace('export class ItemView {}','export class ItemView { app:any; contentEl:any; containerEl:any; constructor(leaf:any) { this.app=leaf.app; this.contentEl=leaf.contentEl; this.containerEl=leaf.contentEl.parentElement; } }')
                        .replace('export class Modal {','export class Modal {setTitle(title:string){this.titleEl.textContent=title;}')
                        .replace('export class PluginSettingTab {}','export class PluginSettingTab { containerEl=document.createElement("div"); }')
                        .replace('export class Setting {}',`export class Setting {
                            element:HTMLElement;
                            constructor(parent:HTMLElement){this.element=document.createElement('div');parent.append(this.element);}
                            setName(name:string){this.element.dataset.label=name;return this;}
                            setDesc(){return this;} setClass(){return this;}
                            addControl(callback:Function){
                                const field:any={inputEl:document.createElement('input'),buttonEl:document.createElement('button'),selectEl:document.createElement('select')};
                                for(const method of ['setValue','setPlaceholder','setTooltip','setButtonText','setDisabled','addOption','onChange','onClick','setCta','setWarning','setClass'])field[method]=()=>field;
                                callback(field);return this;
                            }
                            addToggle(cb:Function){return this.addControl(cb);}
                            addButton(cb:Function){return this.addControl(cb);}
                            addDropdown(cb:Function){return this.addControl(cb);}
                            addText(cb:Function){return this.addControl(cb);}
                            addTextArea(cb:Function){return this.addControl(cb);}
                        }`),
                }));
            },
        }],
    })).outputFiles[0].text;
}

async function main() {
    assert.ok(base, 'Pass the verified local 0.1.14 Git checkout path');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'duo-fold-base-'));
    let browser;
    try {
        const tracked = spawnSync('git',['-C',base,'archive',baseCommit],{encoding:'buffer',maxBuffer:20_000_000});
        assert.equal(tracked.status,0,String(tracked.stderr));
        const extracted = spawnSync('tar',['-xf','-','-C',tmp],{input:tracked.stdout});
        assert.equal(extracted.status,0,String(extracted.stderr));
        fs.symlinkSync(fs.realpathSync(path.join(repo,'node_modules')),path.join(tmp,'node_modules'),'dir');
        const folders={base:tmp,next:repo};
        const bundles={base:await build(tmp),next:await build(repo)};
        const url='http://duo-fold-fixture.test';
        browser=await chromium.launch({executablePath:process.env.DUO_BROWSER_BIN||'/Volumes/Extreme SSD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking','--no-first-run','--disable-component-update','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND']});
        const context=await browser.newContext({viewport:{width:386,height:678},hasTouch:true,isMobile:true,deviceScaleFactor:2});
        await context.route('**/*',route=>{
            const address=route.request().url();
            if(!address.startsWith(url+'/'))return route.abort();
            const [,kind,file]=new URL(address).pathname.split('/');
            const folder=folders[kind];
            if(!folder)return route.fulfill({status:404});
            if(file==='fixture.js')return route.fulfill({contentType:'application/javascript',body:bundles[kind]});
            if(file==='styles.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(folder,'styles.css'))});
            if(file==='index.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(folder,'tests/browser/index.html'),'utf8').replace('../../styles.css','styles.css')});
            return route.fulfill({status:404});
        });
        await context.addInitScript(()=>{
            localStorage.setItem('fjgFileFocusDuo-mobile-panel','folders');
            Object.assign(HTMLElement.prototype,{
                empty(){this.replaceChildren()},
                addClass(cls){this.classList.add(cls)},
                setText(text){this.textContent=text},
                createDiv(opts){return this.createEl('div',opts)},
                createEl(tag,opts={}){
                    const elem=document.createElement(tag);
                    if(opts.cls)elem.className=opts.cls;
                    if(opts.text)elem.textContent=opts.text;
                    this.append(elem);return elem;
                },
            });
            const counts={global:new Map(),ro:new Set(),frames:new Set(),timers:new Set()};
            const add=EventTarget.prototype.addEventListener, remove=EventTarget.prototype.removeEventListener;
            EventTarget.prototype.addEventListener=function(type,listener,opts){
                if(this===window||this===document||this===visualViewport){
                    const key=(this===window?'window':this===document?'document':'viewport')+':'+type;
                    if(!counts.global.has(key))counts.global.set(key,new Set());
                    counts.global.get(key).add(listener);
                }
                return add.call(this,type,listener,opts);
            };
            EventTarget.prototype.removeEventListener=function(type,listener,opts){
                if(this===window||this===document||this===visualViewport){
                    const key=(this===window?'window':this===document?'document':'viewport')+':'+type;
                    counts.global.get(key)?.delete(listener);
                }
                return remove.call(this,type,listener,opts);
            };
            const NativeRO=ResizeObserver;
            window.ResizeObserver=class extends NativeRO{
                observe(...args){counts.ro.add(this);return super.observe(...args);}
                disconnect(){counts.ro.delete(this);return super.disconnect();}
                unobserve(...args){counts.ro.delete(this);return super.unobserve(...args);}
            };
            const raf=requestAnimationFrame.bind(window),caf=cancelAnimationFrame.bind(window);
            window.requestAnimationFrame=cb=>{const id=raf(t=>{counts.frames.delete(id);cb(t)});counts.frames.add(id);return id;};
            window.cancelAnimationFrame=id=>{counts.frames.delete(id);caf(id)};
            const later=setTimeout.bind(window),cancel=clearTimeout.bind(window);
            window.setTimeout=(fn,ms,...args)=>{const id=later(()=>{counts.timers.delete(id);if(typeof fn==='function')fn(...args);},ms);counts.timers.add(id);return id;};
            window.clearTimeout=id=>{counts.timers.delete(id);cancel(id)};
            window.foldResourceCounts=()=>({
                listeners:Object.fromEntries([...counts.global].map(([key,items])=>[key,items.size]).filter(([,n])=>n).sort()),
                observers:counts.ro.size, frames:counts.frames.size,timers:counts.timers.size,
                workspace:[...(window.foldHarness?.events||[])].map(([key,set])=>[key,set.size]).filter(([,n])=>n),
            });
        });
        const errors=[];
        async function open(kind, settings) {
            const page=await context.newPage();
            page.setDefaultTimeout(6000);
            if(settings)await page.addInitScript(settings=>window.initialDuoSettings=settings,settings);
            page.on('pageerror',err=>errors.push(err.message));
            await page.goto(url+'/'+kind+'/index.html');
            await page.waitForFunction(()=>!!window.foldHarness);
            await page.locator('.fjgduo-folder-block').filter({hasText:'Projects'}).click();
            await page.waitForTimeout(200);
            return page;
        }
        async function size(page,width,height=567,viewport=null) {
            if(viewport)await page.setViewportSize(viewport);
            await page.evaluate(({width,height})=>{
                const el=document.getElementById('panel');
                Object.assign(el.style,{width:width+'px',height:height+'px'});
            },{width,height});
            await page.waitForTimeout(230);
        }
        const profile=page=>page.evaluate(()=>[...document.querySelector('#panel').querySelectorAll('*'),document.querySelector('#panel')].flatMap(el=>[...el.classList]).find(c=>/fold.*(?:unknown|compact|expanded)$/.test(c))?.match(/(unknown|compact|expanded)$/)?.[1]||null);
        const layout=page=>page.locator('.duo-navigator').getAttribute('data-layout');
        const set=(page,name,value)=>page.evaluate(({name,value})=>window.foldHarness.set(name,value),{name,value});
        const count=page=>page.evaluate(()=>{
            const resources=window.foldResourceCounts();
            // React Dropzone shares its dragover callback across leaves. A baseline open/close
            // may remove it while another leaf remains; it is not a fold-owned subscription.
            delete resources.listeners['document:dragover'];
            return resources;
        });
        const offSnapshot=page=>page.evaluate(()=>({dom:document.querySelector('#panel').outerHTML,body:{className:document.body.className,style:document.body.getAttribute('style')},resources:window.foldResourceCounts(),commands:[...window.foldHarness.commands.keys()]}));
        const before=await open('base');
        const oldSettings=await before.evaluate(()=>window.foldHarness.stored());
        assert.equal(Object.hasOwn(oldSettings,'foldAwareLayout'),false);
        assert.equal(Object.hasOwn(oldSettings,'foldDebugOverlay'),false);
        const page=await open('next',oldSettings);
        for (const [width,height,vp] of [[264.23,403,{width:386,height:678}],[390,448,{width:871,height:669}],[382,567,{width:386,height:678}],[867,558,{width:871,height:669}]]){
            await size(before,width,height,vp);
            await size(page,width,height,vp);
            assert.deepEqual(await offSnapshot(page),await offSnapshot(before),'OFF baseline '+width);
        }
        console.log('PASS OFF: four endpoint DOM/body/root/style/listener/observer/command snapshots identical to '+baseCommit);
        const master='foldAwareLayout', debug='foldDebugOverlay';
        assert.equal(await page.evaluate(key=>window.foldHarness.plugin.settings[key],master),false);
        assert.equal(await page.evaluate(key=>window.foldHarness.plugin.settings[key],debug),false);
        let settingsRows=()=>page.evaluate(()=>window.foldHarness.settingsRows());
        assert.ok((await settingsRows()).includes('Fold-aware layout'));
        assert.ok(!(await settingsRows()).includes('Fold debug overlay'));
        assert.ok(!(await settingsRows()).includes('Fold hysteresis'));
        const offCounts=await count(page);
        const node=await page.locator('.duo-navigator').elementHandle();
        await set(page,master,true);
        await page.waitForTimeout(230);
        const onCounts=await count(page);
        assert.ok(onCounts.observers>offCounts.observers,'controller adds root observer');
        assert.notDeepEqual(onCounts,offCounts);
        const actual=await profile(page);
        assert.equal(actual,'expanded');
        assert.equal(await layout(page),'columns');
        for (const [width,height,vp,state,columns] of [
            [264.23,403,{width:386,height:678},'compact','drilldown'],
            [390,448,{width:871,height:669},'compact','drilldown'],
            [382,567,{width:386,height:678},'compact','drilldown'],
            [386,567,{width:386,height:678},'compact','drilldown'],
            [867,558,{width:871,height:669},'expanded','columns'],
            [871,558,{width:871,height:669},'expanded','columns'],
            [548,558,null,'expanded','columns'], [536,558,null,'compact','drilldown'], [548,558,null,'compact','drilldown'],
        ]) {
            await size(page,width,height,vp);
            assert.equal(await profile(page),state,'profile '+width);
            assert.equal(await layout(page),columns,'columns '+width);
            const targets=await page.locator('.duo-toolbar button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height};}));
            assert.ok(targets.length>0&&targets.every(r=>r.width>=44&&r.height>=44),'44px toolbar targets at '+width);
            if(columns==='columns'){
                const paneWidths=await page.locator('.duo-columns > .duo-folder-column, .duo-columns > .duo-file-column').evaluateAll(panes=>panes.map(p=>p.getBoundingClientRect().width));
                if(width>=560)assert.ok(paneWidths.length===2&&paneWidths.every(w=>w>=112),'both columns usable at '+width);
            }
        }
        for(const [width,state,columns] of [[559,'unknown','drilldown'],[560,'expanded','columns'],[561,'expanded','columns']]){
            await set(page,master,false);
            await size(page,width);
            await set(page,master,true);
            await page.waitForTimeout(240);
            assert.equal(await profile(page),state,'fresh '+width);
            assert.equal(await layout(page),columns,'fresh '+width);
        }
        console.log('PASS ON: 386/871, all four measured panels, 536/548 history and 559/560/561 fresh boundaries');
        assert.ok(await node.evaluate(el=>el===document.querySelector('.duo-navigator')));
        await size(page,867,558,{width:871,height:669});
        const scroll=page=>page.evaluate(()=>{
            const nav=document.querySelector('.duo-navigator');
            const mode=nav.dataset.layout;
            const pane=nav.querySelector(mode==='columns'?'.duo-file-column.duo-pane':'.duo-main-scroll');
            const origin=nav.querySelector('.duo-file-content');
            const toolbar=nav.querySelector('.duo-toolbar');
            return {relative:Math.max(pane.getBoundingClientRect().top,toolbar.getBoundingClientRect().bottom)-origin.getBoundingClientRect().top,mode};
        });
        await page.locator('.duo-file-column.duo-pane').evaluate(el=>{el.scrollTop=850;});
        await page.waitForTimeout(130);
        const anchor=await scroll(page);
        assert.ok(anchor.relative>700);
        await size(page,382,567,{width:386,height:678});
        assert.equal((await scroll(page)).mode,'drilldown');
        const failures=[];
        const foldedAnchor=await scroll(page);
        if(Math.abs(foldedAnchor.relative-anchor.relative)>=48)failures.push({anchor,foldedAnchor});
        await size(page,867,558,{width:871,height:669});
        const restoredAnchor=await scroll(page);
        if(Math.abs(restoredAnchor.relative-anchor.relative)>=48)failures.push({anchor,restoredAnchor});
        await size(page,548,558);
        await set(page,master,false);
        await page.waitForTimeout(220);
        assert.equal((await scroll(page)).mode,'drilldown');
        const offAnchor=await scroll(page);
        if(Math.abs(offAnchor.relative-anchor.relative)>=48)failures.push({anchor,offAnchor});
        await set(page,master,true);
        await size(page,867,558,{width:871,height:669});
        console.log(failures.length?'FAIL anchors '+JSON.stringify(failures):'PASS anchor across synthetic fold changes and OFF handoff');
        await page.getByRole('button',{name:'All File Focus buttons',exact:true}).click();
        await page.locator('.duo-all-buttons').getByRole('button',{name:'Search files by name or tag',exact:true}).click();
        const query=page.getByRole('searchbox',{name:'Search files by name or tag'});
        await query.fill('Note 002');
        await query.evaluate(el=>el.setSelectionRange(3,3));
        await size(page,382,567,{width:386,height:678});
        assert.equal(await query.inputValue(),'Note 002');
        assert.equal(await query.evaluate(el=>el.selectionStart),3);
        assert.ok(await query.evaluate(el=>document.activeElement===el));
        const firstCommands = await page.evaluate(()=>[...window.foldHarness.commands.keys()].filter(id=>id.includes('fold')));
        assert.equal(firstCommands.length,3);
        const command=label=>page.evaluate(label=>[...window.foldHarness.commands.values()].find(cmd=>cmd.name===label).callback(),label);
        await command('Inspect local fold trace');
        assert.equal(await page.locator('.fjgduo-fold-overlay').count(),0,'inspect cannot create overlay');
        await command('Copy local fold trace');
        await command('Save fold trace in this vault');
        await page.waitForFunction(()=>window.foldHarness.drafts.length===1);
        const trace=await page.evaluate(()=>({copy:window.fixtureClipboard,saved:window.foldHarness.drafts[0]}));
        assert.ok(trace.copy&&!trace.copy.includes('Note 002')&&!trace.copy.includes('Projects/Note'));
        assert.ok(JSON.parse(trace.copy));
        assert.ok(/-1\.json$/.test(trace.saved.name),'race collision retries with fresh filename');
        assert.ok(JSON.parse(trace.saved.content).length>=JSON.parse(trace.copy).length);
        assert.ok((await settingsRows()).includes('Fold debug overlay'));
        assert.ok((await settingsRows()).includes('Fold hysteresis'));
        console.log('PASS trace: inspect respects overlay gate, copy captures no fixture note/search path, save retries collision');
        assert.equal(await page.locator('.fjgduo-fold-overlay').count(),0);
        await set(page,'foldCompactSidebarWidth',300);
        await page.waitForTimeout(180);
        assert.equal(await page.locator('.fjgduo-host').evaluate(el=>el.style.getPropertyValue('--fjgduo-fold-sidebar-width')),'300px');
        await set(page,'foldCompactSidebarWidth',null);
        await page.waitForTimeout(180);
        const beforeLater = await count(page);
        await page.evaluate(async()=>{
            const leafContainer=document.createElement('div');
            leafContainer.className='workspace-leaf-content';
            const panel=document.createElement('div');panel.className='view-content';panel.style.cssText='width:390px;height:440px';
            leafContainer.append(panel);document.body.append(leafContainer);
            window.laterFoldLeaf={leafContainer,leaf:await window.foldHarness.open(panel)};
        });
        await page.waitForTimeout(240);
        assert.equal(await page.locator('.workspace-leaf-content').last().locator('.fjgduo-fold-compact').count(),1);
        assert.ok((await count(page)).observers>beforeLater.observers);
        await page.evaluate(async()=>{const later=window.laterFoldLeaf;await window.foldHarness.close(later.leaf);later.leafContainer.remove();});
        await page.waitForTimeout(200);
        assert.deepEqual(await count(page),beforeLater);
        await set(page,debug,true);
        await page.waitForTimeout(220);
        assert.ok(await page.locator('[class*="fold"][class*="debug"], [class*="fold"][class*="overlay"]').count(),'overlay is present while enabled');
        for(let i=0;i<5;i++){await set(page,master,false);await set(page,master,true);}
        await page.waitForTimeout(240);
        assert.deepEqual(await count(page),onCounts,'rapid retoggle creates no duplicates');
        await set(page,master,false);
        await page.waitForTimeout(230);
        assert.equal(await profile(page),null);
        assert.equal(await page.evaluate(()=>[...window.foldHarness.commands.keys()].filter(id=>id.includes('fold')).length),0);
        assert.deepEqual(await count(page),offCounts);
        assert.equal(await query.inputValue(),'Note 002');
        assert.equal(await query.evaluate(el=>el.selectionStart),3);
        assert.ok(await node.evaluate(el=>el===document.querySelector('.duo-navigator')));
        assert.equal(await page.locator('[class*="fold"][class*="debug"], [class*="fold"][class*="overlay"]').count(),0);
        assert.equal(await page.evaluate(key=>window.foldHarness.stored()[key],debug),true);
        assert.ok(!(await settingsRows()).includes('Fold debug overlay'));
        assert.ok(!(await settingsRows()).includes('Fold hysteresis'));
        await page.evaluate(()=>window.foldHarness.reload());
        assert.equal(await page.evaluate(key=>window.foldHarness.plugin.settings[key],debug),true);
        console.log('PASS live toggles: preserves mounted navigator, query/focus/caret/debug persistence; clears resources and overlay');
        await set(page,master,true);
        await set(page,'foldCompactSidebarWidth',320);
        await page.waitForTimeout(240);
        assert.equal(await page.locator('#panel').evaluate(el=>el.style.getPropertyValue('--fjgduo-fold-sidebar-width')),'320px');
        await set(page,master,false);
        assert.equal(await page.locator('#panel').evaluate(el=>el.style.getPropertyValue('--fjgduo-fold-sidebar-width')),'');
        await set(page,master,true);
        await page.waitForTimeout(200);
        await page.locator('.duo-back').click();
        await page.getByRole('button',{name:'Open Projects folder',exact:true}).tap();
        await page.waitForTimeout(400);
        assert.match(await page.locator('.duo-back').innerText(),/Projects/);
        await page.locator('.duo-back').click();
        await page.waitForTimeout(200);
        assert.doesNotMatch(await page.locator('.duo-back').innerText(),/Projects/);
        console.log('PASS ON interaction: 44px controls, real tap opens Projects, Back returns, optional CSS variable cleaned');
        await page.evaluate(()=>window.foldHarness.plugin.onunload());
        await page.waitForTimeout(240);
        assert.equal(await profile(page),null);
        assert.equal(await page.locator('.duo-navigator').count(),0);
        assert.equal(await page.locator('.fjgduo-fold-overlay').count(),0);
        assert.equal(await page.evaluate(()=>[...window.foldHarness.commands.keys()].filter(id=>id.includes('fold')).length),0);
        assert.equal((await count(page)).observers,0);
        assert.deepEqual(errors,[]);
        assert.deepEqual(failures,[],'anchor failures');
    } finally {
        if(browser)await browser.close();
        fs.rmSync(tmp,{recursive:true,force:true});
    }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
