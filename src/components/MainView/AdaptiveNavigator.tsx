import { LuMic } from 'react-icons/lu';
import React, { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { Menu, Notice, TFolder, Platform } from 'obsidian';
import { useRecoilState } from 'recoil';
import * as state from 'recoil/pluginState';
import FileTreeAlternativePlugin from 'main';
import { MainFolder } from 'components/FolderView/MainFolder';
import { FileComponent } from 'components/FileView/FileComponent';
import { FocusPanel } from 'components/FocusView/FocusPanel';
import * as Icons from 'utils/icons';
import {eventTypes} from 'utils/types';
import useLongPress from 'hooks/useLongPress';
import type { FileTreeView } from '../../FileTreeView';
import { backAction, breadcrumbLabel } from '../../layoutNavigation';
import { AllButtonsModal } from './AllButtonsModal';
import { ShortcutPanel } from './ShortcutPanel';
import { DuoAction, FOLDER_SELECTED, FOCUS_SEARCH } from './duoActions';


export function AdaptiveNavigator({plugin, fileTreeView}: {plugin: FileTreeAlternativePlugin; fileTreeView: FileTreeView}) {
    const [view, setView] = useRecoilState(state.view);
    const [path, setPath] = useRecoilState(state.activeFolderPath);
    const [folder, setFolder] = useRecoilState(state.focusedFolder);
    const [topFocus,setTopFocus] = useRecoilState(state.topFolderFocus);
    const [files] = useRecoilState(state.ozFileList);
    const host = useRef<HTMLDivElement>(null), pane = useRef<HTMLDivElement>(null), fileStart = useRef<HTMLDivElement>(null);
    const folderActions = useRef<DuoAction[]>([]), fileActions = useRef<DuoAction[]>([]);
    const [width, setWidth] = useState(0);
    const [shortcuts, setShortcuts] = useState(()=>Platform.isMobile && localStorage.getItem('fjgFileFocusDuo-mobile-panel')!=='folders');
    const [,refreshShortcuts]=useState(0);
    const choosePanel=(show:boolean)=>{setShortcuts(show);localStorage.setItem('fjgFileFocusDuo-mobile-panel',show?'shortcuts':'folders');};
    useEffect(()=>{
        const select=(event:Event)=>{
            const target=plugin.app.vault.getAbstractFileByPath((event as CustomEvent).detail?.path || '');
            if(Platform.isMobile && target instanceof TFolder){setFolder(target);setPath(target.path);}
        };
        window.addEventListener('fjg-vcc-folder-context',select);
        return ()=>window.removeEventListener('fjg-vcc-folder-context',select);
    },[]);
    const pendingJump = useRef(false);
    const jumpGeneration = useRef(0);
    const currentPath = useRef(path); currentPath.current = path;
    const [jump, setJump] = useState(0);
    const [ratio, setRatio] = useState(() => {
        const value = Number(localStorage.getItem('fjgFileFocusDuo-column-ratio'));
        return value >= .25 && value <= .55 ? value : .35;
    });
    const wide = width >= plugin.settings.duoColumnWidth;
    const focusMode = view === 'recent' || view === 'bookmarks';
    const atRoot = !path || path === '/';
    const [rootFilesVisible, setRootFilesVisible] = useState(false);
    const showFiles = !atRoot || rootFilesVisible;
    useEffect(() => { setRootFilesVisible(false); }, [path]);
    useEffect(() => {
        const show = () => setRootFilesVisible(true);
        window.addEventListener('fjgduo-show-root-files',show);
        return () => window.removeEventListener('fjgduo-show-root-files',show);
    }, []);
    const scrollToFiles = () => {
        if (!wide && showFiles && fileStart.current && pane.current && files.length) {
            pane.current.scrollTop = fileStart.current.offsetTop - pane.current.offsetTop - (plugin.settings.fixedHeaderInFileList ? (host.current?.querySelector('.duo-toolbar')?.getBoundingClientRect().height || 0) : 0);
        }
    };
    useLayoutEffect(() => {
        const observer = new ResizeObserver(() => setWidth(host.current?.getBoundingClientRect().width || 0));
        if (host.current) observer.observe(host.current);
        return () => observer.disconnect();
    }, []);
    useLayoutEffect(() => { pendingJump.current = Boolean(path) && !focusMode; }, [path, wide, focusMode, jump]);
    useLayoutEffect(() => {
        if (!path || focusMode || !pendingJump.current || !files.length) return;
        if (!wide) { const selected=plugin.app.vault.getAbstractFileByPath(path); if(selected instanceof TFolder && selected !== folder) setFolder(selected); }
        let second = 0;
        const generation=jumpGeneration.current;
        const frame = requestAnimationFrame(() => { second = requestAnimationFrame(() => { if(generation!==jumpGeneration.current)return; scrollToFiles(); pendingJump.current=false; }); });
        return () => { cancelAnimationFrame(frame); cancelAnimationFrame(second); };
    }, [path, wide, files, focusMode, jump]);
    useEffect(() => {
        const choose = (event: Event) => {
            setShortcuts(false); setTopFocus(false); jumpGeneration.current++;
            const selected = (event as CustomEvent<TFolder>).detail;
            if (!(selected instanceof TFolder)) return;
            if (!wide) setFolder(selected);
            setPath(selected.path); setView('file'); setJump(value => value + 1);
            requestAnimationFrame(scrollToFiles);
        };
        window.addEventListener(FOLDER_SELECTED, choose);
        return () => window.removeEventListener(FOLDER_SELECTED, choose);
    }, [wide, files]);
    const navigate = (target: TFolder) => {
        jumpGeneration.current++; pendingJump.current=false; currentPath.current=target.path; setTopFocus(false);
        setShortcuts(false);
        setRootFilesVisible(false);
        setFolder(target); setPath(target.path); setView('file'); setJump(value => value + 1);
    };
    const closePane = () => {
        const leaf=fileTreeView?.leaf;
        const workspace=plugin.app.workspace;
        if(workspace.leftSplit && leaf?.getRoot?.()===workspace.leftSplit){workspace.leftSplit.collapse();return;}
        if(workspace.rightSplit && leaf?.getRoot?.()===workspace.rightSplit){workspace.rightSplit.collapse();return;}
        if(leaf){leaf.detach();return;}
        new Notice('Close this File Focus pane using its tab close button.');
    };
    const goBack = () => {
        jumpGeneration.current++; pendingJump.current=false;
        const current=plugin.app.vault.getAbstractFileByPath(currentPath.current || '/');
        const action=backAction({focusMode,topFocus,path:currentPath.current,parent:current?.parent?.path});
        if(action==='exit-mode'){setView('file');return;}
        if(action==='clear-focus'){navigate(plugin.app.vault.getRoot());return;}
        if(action==='parent' && current?.parent){navigate(current.parent);return;}
        closePane();
    };
    const jumpToRoot=()=>{navigate(plugin.app.vault.getRoot());new Notice('At vault root');};
    // Retain the tested touch timer and click suppression; do not add pointer activation.
    const backPress = useLongPress(jumpToRoot, 500);
    const nextBack=focusMode?'Back to folder view':topFocus?'Clear top-folder focus':atRoot?'Close pane':`Back to ${plugin.app.vault.getAbstractFileByPath(path)?.parent?.name || plugin.app.vault.getName()}`;
    const crumb=breadcrumbLabel(plugin.app.vault.getName(),path);
    const run = (action: DuoAction, event?: any) => {
        try { Promise.resolve(action.run(event)).catch(error => new Notice(`${action.title}: ${error?.message || error}`)); }
        catch (error) { new Notice(`${action.title}: ${error instanceof Error ? error.message : String(error)}`); }
    };
    const fileAction = (id: string, event?: any) => {
        const action = fileActions.current.find(item => item.id === id);
        if (action) run(action, event); else new Notice('The navigator is still loading. Try again shortly.');
    };
    const folderAction = (id: string, event?: any) => {
        const action = folderActions.current.find(item => item.id === id);
        if (action) run(action, event); else new Notice('The navigator is still loading. Try again shortly.');
    };
    const overflow = (event: React.MouseEvent) => {
        const menu = new Menu();
        const add = (title: string, action: () => unknown) => menu.addItem(item => item.setTitle(title).onClick(() => run({id:title,title,run:action},event)));
        add('Browse subfolders', () => { setView('file'); if (pane.current) pane.current.scrollTop = 0; });
        if (atRoot) add(rootFilesVisible ? 'Hide vault-root files' : 'Show vault-root files', () => setRootFilesVisible(value => !value));
        add('Jump to vault root', () => navigate(plugin.app.vault.getRoot()));
        const sections: [string, DuoAction[]][] = [['Folders', folderActions.current], ['Notes', fileActions.current.filter(a => !['search','new-note'].includes(a.id))]];
        for (const [label, actions] of sections) {
            menu.addSeparator(); menu.addItem(item => item.setTitle(label).setDisabled(true));
            for (const action of actions.filter(a => a.visible !== false)) menu.addItem(item => item.setTitle(action.title).onClick(e => run(action, e)));
        }
        menu.showAtPosition({x:event.clientX,y:event.clientY});
    };
    const actionSections = (): [string,DuoAction[]][] => {
        const browseFolders = () => { setShortcuts(false); setView('file'); if (pane.current) pane.current.scrollTop = 0; };
        return [
            ['Navigation', [
                {id:'back', title:nextBack, run:goBack},
                {id:'close-pane',title:'Close File Focus pane',run:closePane},
                ...(topFocus?[{id:'clear-focus',title:'Clear top-folder focus',run:()=>navigate(plugin.app.vault.getRoot())}]:[]),
                {id:'folders', title:'Go Back to Folder View / Close File Pane', run:browseFolders},
                {id:'root', title:'Jump to vault root', run:()=>navigate(plugin.app.vault.getRoot())},
                ...(atRoot ? [{id:'root-files',title:rootFilesVisible ? 'Hide vault-root files' : 'Show vault-root files',run:()=>setRootFilesVisible(value=>!value)}] : []),
                {id:'recent',title:'Recent Notes',run:()=>{setShortcuts(false);setView('recent');}},
                {id:'bookmarks',title:'Bookmarks',run:()=>{setShortcuts(false);setView('bookmarks');}},
            ]],
            ['Folder buttons', folderActions.current],
            ['Pane', [{id:'settings',title:'File Focus settings',run:settingsAction},{id:'pin',title:'Toggle pane pin',run:pinAction}]],
            ['Note buttons', fileActions.current.map(action=>action.id==='search' ? {...action,run:()=>{setShortcuts(false);if(focusMode)window.dispatchEvent(new Event(FOCUS_SEARCH));else {if(atRoot)setRootFilesVisible(true);fileAction('search');}}} : action)],
        ];
    };
    const settingsAction=()=>{const settings=(plugin.app as any).setting;settings?.open();settings?.openTabById(plugin.manifest.id);};
    const pinAction=()=>{const pin=host.current?.closest('.workspace-drawer')?.querySelector<HTMLElement>('.workspace-drawer-header .mod-pin');if(pin)pin.click();else if(fileTreeView?.leaf)fileTreeView.leaf.setPinned(!fileTreeView.leaf.getViewState().pinned);};
    const allButtons=()=>new AllButtonsModal(plugin.app,actionSections(),run).open();
    const runShortcut=(action:DuoAction,event?:MouseEvent)=>{
        // Resolve the current handler: note/folder context can change while this panel stays open.
        const latest=actionSections().reduce<DuoAction[]>((all,[,items])=>all.concat(items),[]).find(item=>item.id===action.id) || action;
        run(latest,event);
        requestAnimationFrame(()=>refreshShortcuts(value=>value+1));
    };
    const toolbar = <div className={`duo-toolbar${plugin.settings.fixedHeaderInFileList ? ' duo-toolbar-fixed' : ''}`} role="toolbar" aria-label="File Focus Duo">
        <button className="duo-back" data-ignore-swipe="true" aria-label={nextBack} title={`${plugin.app.vault.getName()} / ${path || ''}`} onClick={goBack} onContextMenu={e => {e.preventDefault();jumpToRoot();}} {...backPress}>
            {atRoot && !focusMode && !topFocus ? <span className="duo-close-icon" aria-hidden="true">×</span> : <Icons.FaArrowCircleLeft/>}
            <span className="duo-breadcrumb"><span className="duo-crumb-first">{crumb.first}</span>{crumb.last && <><span className="duo-crumb-middle"> / {crumb.collapsed ? '… / ' : ''}</span><span className="duo-crumb-last">{crumb.last}</span></>}</span>
        </button>
        <div className="duo-icon-row">
        <button data-ignore-swipe="true" aria-label="Open Vault Control Center" title="Vault Control Center" onClick={e => folderAction('home',e)}><Icons.FaHome aria-hidden="true"/></button>
        <button data-ignore-swipe="true" aria-label="Open FJG Objective Manager" title="FJG Objective Manager" onClick={e => folderAction('tasks',e)}><Icons.LuListChecks aria-hidden="true"/></button>
        <button data-ignore-swipe="true" aria-label="Search" title="Search" onClick={e => { setShortcuts(false); if(focusMode) window.dispatchEvent(new Event(FOCUS_SEARCH)); else { if(atRoot) setRootFilesVisible(true); fileAction('search',e); } }}><Icons.IoIosSearch/></button>
        <button data-ignore-swipe="true" aria-label="New note" title="New note" onClick={e => fileAction('new-note',e)}><Icons.IoIosAddCircle/></button>
        <button data-ignore-swipe="true" aria-label="Recent" title="Recent" aria-pressed={view==='recent'} onClick={() => {setShortcuts(false);setView('recent');}}><Icons.FaHistory/></button>
        <button data-ignore-swipe="true" aria-label="Bookmarks" title="Bookmarks" aria-pressed={view==='bookmarks'} onClick={() => {setShortcuts(false);setView('bookmarks');}}><Icons.FaRegBookmark/></button>
        <button data-ignore-swipe="true" aria-label="Talk to Vault" title="Talk to Vault" onClick={() => plugin.openVaultVoice({ folder: path, note: plugin.app.workspace.getActiveFile()?.path || '' })}><LuMic aria-hidden="true"/></button>
        <button data-ignore-swipe="true" aria-label="All File Focus buttons" title="All File Focus buttons" onClick={allButtons} onContextMenu={e=>{e.preventDefault();overflow(e);}}>⋯</button>
        </div>
    </div>;
    const resize = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!host.current) return;
        const rect = host.current.getBoundingClientRect();
        const next = Math.max(.25, Math.min(.55, (e.clientX - rect.left) / rect.width));
        setRatio(next); localStorage.setItem('fjgFileFocusDuo-column-ratio', String(next));
    };
    return <div ref={host} className={`duo-navigator ${Platform.isPhone && plugin.settings.compactTextPhone ? 'duo-compact-text' : ''} ${wide ? 'duo-wide' : 'duo-compact'} ${plugin.settings.fixedHeaderInFileList ? '' : 'duo-unpinned'} ${showFiles ? '' : 'duo-root-folders-only'}`} data-layout={wide ? 'columns':'drilldown'} style={{'--duo-folder-ratio': `${ratio*100}%`} as React.CSSProperties}>
        <div ref={pane} className="duo-pane duo-main-scroll">
            {toolbar}
            {Platform.isMobile && <div className="duo-panel-switch" role="group" aria-label="Left panel contents">
                <button data-ignore-swipe="true" aria-pressed={shortcuts} onClick={()=>choosePanel(true)}>Shortcuts</button>
                <button data-ignore-swipe="true" aria-pressed={!shortcuts} onClick={()=>choosePanel(false)}>Folders</button>
            </div>}
            {shortcuts && <ShortcutPanel context={path || plugin.app.vault.getName()} sections={actionSections} run={runShortcut}/>}
            <div className="duo-columns" hidden={focusMode || shortcuts}>
                <div className="duo-folder-column" aria-label="Folders"><MainFolder plugin={plugin} adaptive actionsRef={folderActions}/></div>
                {wide && showFiles && <div className="duo-divider" role="separator" aria-label="Resize folder column" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={55} aria-valuenow={Math.round(ratio*100)} tabIndex={0} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);resize(e);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resize(e);}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault(); const n=Math.max(.25,Math.min(.55,ratio+(e.key==='ArrowLeft'?-.025:.025)));setRatio(n);localStorage.setItem('fjgFileFocusDuo-column-ratio',String(n));}}}/>}
                <div ref={fileStart} hidden={!showFiles} className={`duo-file-column${wide ? ' duo-pane':''}`} aria-label="Folder files"><FileComponent plugin={plugin} wide={wide} adaptive actionsRef={fileActions}/></div>
            </div>
            {focusMode && !shortcuts && <FocusPanel plugin={plugin} mode={view as 'recent'|'bookmarks'} adaptive/>}
        </div>
    </div>;
}
