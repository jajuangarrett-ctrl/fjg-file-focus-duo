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
import { AllButtonsModal } from './AllButtonsModal';
import { ShortcutPanel } from './ShortcutPanel';
import { DuoAction, FOLDER_SELECTED, FOCUS_SEARCH } from './duoActions';


export function AdaptiveNavigator({plugin}: {plugin: FileTreeAlternativePlugin}) {
    const [view, setView] = useRecoilState(state.view);
    const [path, setPath] = useRecoilState(state.activeFolderPath);
    const [folder, setFolder] = useRecoilState(state.focusedFolder);
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
            pane.current.scrollTop = fileStart.current.offsetTop - pane.current.offsetTop - (plugin.settings.fixedHeaderInFileList ? 44 : 0);
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
        const frame = requestAnimationFrame(() => { second = requestAnimationFrame(() => { scrollToFiles(); pendingJump.current=false; }); });
        return () => { cancelAnimationFrame(frame); cancelAnimationFrame(second); };
    }, [path, wide, files, focusMode, jump]);
    useEffect(() => {
        const choose = (event: Event) => {
            setShortcuts(false);
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
        setShortcuts(false);
        setRootFilesVisible(false);
        setFolder(target); setPath(target.path); setView('file'); setJump(value => value + 1);
        requestAnimationFrame(scrollToFiles);
    };
    const goBack = () => {
        if (focusMode) { setView('file'); return; }
        const current = plugin.app.vault.getAbstractFileByPath(path);
        if (current instanceof TFolder && current.parent) navigate(current.parent);
        else { setRootFilesVisible(false); if (pane.current) pane.current.scrollTop = 0; }
    };
    const backPress = useLongPress(() => navigate(plugin.app.vault.getRoot()), 500);
    const run = (action: DuoAction, event?: any) => {
        try { Promise.resolve(action.run(event)).catch(error => new Notice(`${action.title}: ${error?.message || error}`)); }
        catch (error) { new Notice(`${action.title}: ${error instanceof Error ? error.message : String(error)}`); }
    };
    const fileAction = (id: string, event?: any) => {
        const action = fileActions.current.find(item => item.id === id);
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
                {id:'back', title:'Back to parent folder', run:goBack},
                {id:'folders', title:'Go Back to Folder View / Close File Pane', run:browseFolders},
                {id:'root', title:'Jump to vault root', run:()=>navigate(plugin.app.vault.getRoot())},
                ...(atRoot ? [{id:'root-files',title:rootFilesVisible ? 'Hide vault-root files' : 'Show vault-root files',run:()=>setRootFilesVisible(value=>!value)}] : []),
                {id:'recent',title:'Recent Notes',run:()=>{setShortcuts(false);setView('recent');}},
                {id:'bookmarks',title:'Bookmarks',run:()=>{setShortcuts(false);setView('bookmarks');}},
            ]],
            ['Folder buttons', folderActions.current],
            ['Note buttons', fileActions.current.map(action=>action.id==='search' ? {...action,run:()=>{setShortcuts(false);if(focusMode)window.dispatchEvent(new Event(FOCUS_SEARCH));else {if(atRoot)setRootFilesVisible(true);fileAction('search');}}} : action)],
        ];
    };
    const allButtons=()=>new AllButtonsModal(plugin.app,actionSections(),run).open();
    const runShortcut=(action:DuoAction,event?:MouseEvent)=>{
        // Resolve the current handler: note/folder context can change while this panel stays open.
        const latest=actionSections().reduce<DuoAction[]>((all,[,items])=>all.concat(items),[]).find(item=>item.id===action.id) || action;
        run(latest,event);
        requestAnimationFrame(()=>refreshShortcuts(value=>value+1));
    };
    const toolbar = <div className={`duo-toolbar${plugin.settings.fixedHeaderInFileList ? ' duo-toolbar-fixed' : ''}`} role="toolbar" aria-label="File Focus Duo">
        <button className="duo-back" data-ignore-swipe="true" aria-label={`Back from ${path || 'vault root'}. Hold to jump to root.`} title={path || 'Vault root'} onClick={goBack} onContextMenu={e => {e.preventDefault();navigate(plugin.app.vault.getRoot());}} {...backPress}><Icons.FaArrowCircleLeft/><span>{focusMode ? view : (path?.split('/').pop() || plugin.app.vault.getName())}</span></button>
        <button aria-label="Search" title="Search" onClick={e => { setShortcuts(false); if(focusMode) window.dispatchEvent(new Event(FOCUS_SEARCH)); else { if(atRoot) setRootFilesVisible(true); fileAction('search',e); } }}><Icons.IoIosSearch/></button>
        <button aria-label="New note" title="New note" onClick={e => fileAction('new-note',e)}><Icons.IoIosAddCircle/></button>
        <button aria-label="Recent" title="Recent" aria-pressed={view==='recent'} onClick={() => {setShortcuts(false);setView('recent');}}><Icons.FaHistory/></button>
        <button aria-label="Bookmarks" title="Bookmarks" aria-pressed={view==='bookmarks'} onClick={() => {setShortcuts(false);setView('bookmarks');}}><Icons.FaRegBookmark/></button>
        <button aria-label="All File Focus buttons" title="All File Focus buttons" onClick={allButtons} onContextMenu={e=>{e.preventDefault();overflow(e);}}>⋯</button>
    </div>;
    const resize = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!host.current) return;
        const rect = host.current.getBoundingClientRect();
        const next = Math.max(.25, Math.min(.55, (e.clientX - rect.left) / rect.width));
        setRatio(next); localStorage.setItem('fjgFileFocusDuo-column-ratio', String(next));
    };
    return <div ref={host} className={`duo-navigator ${wide ? 'duo-wide' : 'duo-compact'} ${plugin.settings.fixedHeaderInFileList ? '' : 'duo-unpinned'} ${showFiles ? '' : 'duo-root-folders-only'}`} data-layout={wide ? 'columns':'drilldown'} style={{'--duo-folder-ratio': `${ratio*100}%`} as React.CSSProperties}>
        <div ref={pane} className="duo-pane duo-main-scroll">
            {toolbar}
            {Platform.isMobile && <div className="duo-panel-switch" role="group" aria-label="Left panel contents">
                <button aria-pressed={shortcuts} onClick={()=>choosePanel(true)}>Shortcuts</button>
                <button aria-pressed={!shortcuts} onClick={()=>choosePanel(false)}>Folders</button>
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
