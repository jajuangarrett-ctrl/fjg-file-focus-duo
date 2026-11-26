import React from 'react';
import FileTreePlugin from '../../src/main';
import { createRoot } from 'react-dom/client';
import { RecoilRoot } from 'recoil';
import MainTreeComponent from '../../src/components/MainView/MainComponent';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { TFolder,TFile,FileView,Platform } from './obsidian';
import { openMobileFolderFile, rememberMobileFolderDocument } from '../../src/utils/mobileFolderOpen';
import { eventTypes } from '../../src/utils/types';
(Array.prototype as any).contains=Array.prototype.includes;
(String.prototype as any).contains=String.prototype.includes;
(HTMLElement.prototype as any).scrollIntoViewIfNeeded=function(){this.scrollIntoView({block:'nearest'});};
(window as any).notices=[];(window as any).modals=[];(window as any).opened=[];
const root=new TFolder();root.path='/';root.name='Fixture vault';
const map=new Map<string,any>([['/',root],['',root]]);
function folder(name:string,parent:TFolder){const f=new TFolder();f.name=name;f.path=(parent.isRoot()?'':parent.path+'/')+name;f.parent=parent;parent.children.push(f);map.set(f.path,f);return f;}
function file(name:string,parent:TFolder,extension='md'){const f=new TFile();f.extension=extension;f.name=name+'.'+extension;f.basename=name;f.path=(parent.isRoot()?'':parent.path+'/')+f.name;f.parent=parent;parent.children.push(f);map.set(f.path,f);return f;}
const projects=folder('Projects',root);const child=folder('Subfolder',projects);folder('Archive',root);
for(let i=0;i<3000;i++)file(`Note ${String(i).padStart(4,'0')}`,projects);
file('Child note',child);file('Visible text file',projects,'txt');file('Root note',root);file('__init__',projects,'py');file('__init__.cpython-314',projects,'pyc');
const htmlSamples=folder('Sample pages',root);
const htmlSources=new Map<string,string>();
for(const [name,ext,source] of [
    ['Fixture valid','html','<!doctype html><html><p>Page</p></html>'],
    ['Fixture fragment','HTM','<article><p>Fragment</p></article>'],
    ['Fixture fake','html','This is plain prose with <div>quoted tags</div>.'],
    ['Fixture fenced','htm','```html\n<!doctype html>\n<html></html>\n```'],
    ['Fixture ordinary text','txt','This is a text attachment.'],
    ['Fixture normal note','md','# This is a Markdown note'],
]) {
    const item=file(name,htmlSamples,ext);
    htmlSources.set(item.path,source);
}
const htmlReads=new Map<string,number>();
const htmlChanges=new Set<(file:TFile)=>void>();
let pauseHtml: string | undefined;
let releaseHtml: (() => void) | undefined;

const listeners=new Map<any,(folder:TFolder)=>void>();
const fixtureView = { containerEl:document.getElementById('mount'), activate:()=>{} };
const mainRoot = {};
const leaf:any={getRoot:()=>mainRoot,view:{getViewType:()=> 'fjg-file-focus-duo-view'},openFile:async(f:any)=>(window as any).opened.push(f.path)};
const app:any={
 vault:{getRoot:()=>root,getName:()=>root.name,getAbstractFileByPath:(path:string)=>map.get(path),getFiles:()=>[...map.values()].filter(f=>f instanceof TFile),getAllLoadedFiles:()=>[...map.values()],getMarkdownFiles:()=>[...map.values()].filter(f=>f instanceof TFile),cachedRead:async()=> '# Fixture',getConfig:()=>false,
  read:async(f:TFile)=>{
      htmlReads.set(f.path,(htmlReads.get(f.path)??0)+1);
      const source=htmlSources.get(f.path)??'';
      if (pauseHtml===f.path) {
          pauseHtml=undefined;
          await new Promise<void>(resolve=>{releaseHtml=resolve;});
      }
      return source;
  },
  on:(event:string,callback:(file:TFile)=>void)=>{if(event==='modify')htmlChanges.add(callback);return callback;},
  offref:(callback:(file:TFile)=>void)=>htmlChanges.delete(callback)},
 workspace:{rootSplit:mainRoot,iterateRootLeaves:()=>{},getActiveFile:()=>map.get('Projects/Note 0000.md'),getLastOpenFiles:()=>['Projects/Note 0000.md'],getLeaf:()=>leaf,setActiveLeaf:()=>{},trigger:()=>{},getLeavesOfType:()=>[],activeLeaf:leaf},
 metadataCache:{getFileCache:()=>({tags:[],frontmatter:{}})},
 internalPlugins:{plugins:{},getEnabledPluginById:(id:string)=>id==='bookmarks'?{items:[{type:'group',title:'Group',items:[{type:'file',path:'Projects/Note 0000.md'}]},{type:'file',path:'Projects/Note 0001.md'}]}:null},
 commands:{commands:{},executeCommandById:()=>false},plugins:{getPlugin:()=>null},
};
const plugin:any={app,manifest:{id:'fjg-file-focus-duo'},settings:{...DEFAULT_SETTINGS,folderNote:false,excludedExtensions:'.PY, pyc'},keys:{activeFolderPathKey:'fixture-active',focusedFolder:'fixture-focus',pinnedFilesKey:'fixture-pins',openFoldersKey:'fixture-open'},VIEW_TYPE:'fjg-file-focus-duo-view',saveSettings:async()=>{},shouldBuildFolderTreeRecursively:()=>true,isMobilePerformanceModeEnabled:()=>false,shouldFollowActiveFile:()=>false,openFileTreeLeaf:async()=>{},registerFolderRevealListener:(view:any,fn:(folder:TFolder)=>void)=>{listeners.set(view,fn);return()=>listeners.delete(view);},openInboxMorningBrief:()=>{},openVaultVoice:(selection:any)=>{(window as any).voiceSelection=selection;}};
(window as any).fixture={plugin,app,root,projects,child,refresh:()=>window.dispatchEvent(new Event(eventTypes.refreshView)),reveal:(path:string)=>window.dispatchEvent(new CustomEvent(eventTypes.revealFile,{detail:{file:map.get(path)}})),setSetting:(key:string,value:any)=>{plugin.settings[key]=value;window.dispatchEvent(new Event(eventTypes.refreshView));}};
(window as any).fixture.htmlState = {
    reads:()=>Object.fromEntries(htmlReads),
    pauseRead:(name:string)=>{pauseHtml='Sample pages/'+name;},
    finishRead:async()=>{
        releaseHtml?.();releaseHtml=undefined;
        await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    },
    replace:(name:string,source:string)=>{
        const path='Sample pages/'+name;
        htmlSources.set(path,source);
        const item=map.get(path);
        for(const listener of htmlChanges)listener(item);
    }
};
(window as any).fixture.tabRouting = (scenario: string) => {
    const workspace = app.workspace;
    const folders = { id:'duo', getRoot:()=>scenario === 'drawer' ? {} : mainRoot, view:{getViewType:()=> 'fjg-file-focus-duo-view'} };
    const dashboard = { id:'dashboard', getRoot:()=>mainRoot, view:{getViewType:()=> 'dashboard'} };
    const calls:{ id:string; path:string; }[] = [];
    const requests:boolean[] = [];
    let sequence = 0;
    const makeTab = (id: string, path?: string, pinned=false, deferred=false) => {
        const view = Object.assign(new FileView(), {file:path ? map.get(path) : null,getViewType:()=> 'markdown'});
        const tab:any = {
            id, getRoot:()=>mainRoot, view:deferred?{getViewType:()=> 'deferred'}:view, isDeferred:deferred,
            getViewState:()=>({ type:'markdown', state:{file:view.file?.path}, pinned, group:scenario==='linked'&&id==='A'?{}:undefined }),
            loadIfDeferred:()=>{throw new Error('Do not load to find the tab');},
            openFile:async (f:any) => {
                if (scenario === 'failed' && id === 'A') throw new Error('Simulated tab closed after selection');
                if (scenario === 'no new tab') throw new Error('Simulated open error');
                calls.push({id, path:f.path});
                await new Promise(resolve=>setTimeout(resolve,25));
                view.file=f; tab.view=view; tab.isDeferred=false;
            },
        };
        return tab;
    };
    const noteA = makeTab('A','Projects/Note 0000.md',scenario==='pinned',scenario==='deferred');
    const noteOther = makeTab('unrelated','Projects/Note 0006.md');
    const rootLeaves:any[] = [dashboard,noteOther];
    if (scenario !== 'closed' && scenario !== 'absent') rootLeaves.push(noteA);
    if (scenario !== 'drawer') rootLeaves.push(folders);
    if (scenario !== 'absent') rememberMobileFolderDocument(workspace,noteA);
    Object.assign(workspace, {
        activeLeaf: folders,
        iterateRootLeaves: (visit:Function)=>rootLeaves.forEach(tab=>visit(tab)),
        getLeaf:(isNew:boolean) => {
            requests.push(isNew);
            if (!isNew) return dashboard;
            const tab=makeTab('new-'+(++sequence));
            rootLeaves.push(tab);
            return tab;
        },
        setActiveLeaf:(tab:any) => { workspace.activeLeaf=tab; if (Platform.isMobile) rememberMobileFolderDocument(workspace,tab); },
    });
    Platform.isMobile=scenario!=='desktop';
    return {
        calls, requests,
        openTextAttachment:()=>openMobileFolderFile(app,'Projects/Visible text file.txt'),
        enterNavigator:()=>{workspace.setActiveLeaf(folders);},
        count:()=>rootLeaves.length,
        active:()=>workspace.activeLeaf.id,
    };
};
createRoot(document.getElementById('mount')!).render(<RecoilRoot><MainTreeComponent plugin={plugin} fileTreeView={fixtureView as any}/></RecoilRoot>);

(window as any).fixture.objectiveFolderReveal = async (reuse: boolean, path: string) => {
    const realPlugin = new (FileTreePlugin as any)();
    const calls: string[] = [];
    const workspace = app.workspace;
    const tab = {
        view: fixtureView, getRoot: () => mainRoot,
        setViewState: async (state: {type: string}) => {
            if (state.type !== realPlugin.VIEW_TYPE) throw Error('Wrong view type');
            calls.push('mount-tab');
        }
    };
    const sidebarView = {activate:()=>{}};
    const sidebar = { view: sidebarView, getRoot: () => ({}) };
    const objective = { view: {getViewType:()=> 'task-manager'}, getRoot:()=>mainRoot };
    const sidebarListener = () => calls.push('changed-sidebar');
    listeners.set(sidebarView, sidebarListener);
    realPlugin.folderRevealListeners = listeners;
    realPlugin.app = {...app, workspace:{
        ...workspace, activeLeaf: objective,
        getLeavesOfType: () => reuse ? [sidebar,tab] : [sidebar],
        getLeaf: (placement: string) => { if(placement !== 'tab') throw Error('Not a new tab'); calls.push('new-tab'); return tab; },
        revealLeaf: async (which: unknown) => { if (which !== tab) throw Error('Revealed wrong pane'); calls.push('revealed-tab'); },
        setActiveLeaf: (which: unknown) => { if (which !== tab) throw Error('Activated wrong pane'); calls.push('active-tab'); },
    }};
    try { await realPlugin.revealFolderPath(path); }
    catch (error) { calls.push((error as Error).message); }
    finally { listeners.delete(sidebarView); }
    return calls;
};

(window as any).testVisibilityImport=async()=>{
    const original={excludedExtensions:'.JS, .PDF',excludedFolders:'Private archive',hideAttachments:true,attachmentsFolderName:'Media',showOnlySupportedFileTypes:true,folderNote:true,showRootFolder:false,liveApiKey:'fixture-only-original-key'};
    const snapshot=JSON.stringify(original);
    const context:any={app:{vault:{getName:()=> 'visibility-import-fixture'},plugins:{plugins:{'fjg-file-focus':{settings:original}}}},settings:{...DEFAULT_SETTINGS,liveApiKey:'fixture-only-duo-key'},saveSettings:async()=>{}};
    localStorage.removeItem('fjgFileFocusDuo-visibility-v1-visibility-import-fixture');
    const changed=await FileTreePlugin.prototype.importOriginalVisibilitySettings.call(context);
    const unchanged=await FileTreePlugin.prototype.importOriginalVisibilitySettings.call(context);
    return {changed,secondImportSkipped:!unchanged,extensions:context.settings.excludedExtensions,folders:context.settings.excludedFolders,onlySupported:context.settings.showOnlySupportedFileTypes,originalUnchanged:JSON.stringify(original)===snapshot,ownCredentialPreserved:context.settings.liveApiKey==='fixture-only-duo-key'};
};

(window as any).testVoiceKeyResolution=async()=>{
 let reads=0,recoveries=0,saves=0;
 const context:any={settings:{liveApiKey:''},app:{vault:{configDir:'.fixture',adapter:{read:async()=>{reads++;return JSON.stringify({openAiApiKey:'fixture-shared'});}}},plugins:{plugins:{'fjg-task-manager':{resolveOpenAiApiKey:async()=>{recoveries++;throw Error('Must not invoke persistent recovery');}}}}},saveSettings:async()=>{saves++;}};
 const shared=await FileTreePlugin.prototype.resolveVoiceApiKey.call(context);
 context.settings.liveApiKey='fixture-own';
 const own=await FileTreePlugin.prototype.resolveVoiceApiKey.call(context);
 return {shared:shared==='fixture-shared',own:own==='fixture-own',reads,recoveries,saves};
};
