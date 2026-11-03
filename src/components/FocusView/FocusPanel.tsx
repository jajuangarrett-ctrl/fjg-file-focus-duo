import useLongPress from 'hooks/useLongPress';
import { menuPosition } from 'utils/duoRuntime';
import { openFile as openDuoFile } from 'utils/newFile';
import { FOCUS_SEARCH } from 'components/MainView/duoActions';
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Menu, Notice, TFile, TFolder } from 'obsidian';
import FileTreeAlternativePlugin from 'main';
import * as Icons from 'utils/icons';
import * as FileTreeUtils from 'utils/Utils';
import * as recoilState from 'recoil/pluginState';
import { useRecoilState } from 'recoil';
import {
    AppWithInternalPlugins,
    CoreBookmarksPluginInstance,
    CoreGlobalSearchPluginInstance,
    CoreWebViewerPluginInstance,
    FocusBookmarkItem,
    FocusPanelMode,
    FocusRecentFileEntry,
    eventTypes,
} from 'utils/types';

type BookmarkLevel = {
    title: string;
    items: FocusBookmarkItem[];
};

interface FocusPanelProps {
    plugin: FileTreeAlternativePlugin;
    mode: FocusPanelMode;
    adaptive?: boolean;
}

interface FocusRowConfig {
    icon: React.ComponentType<{ className?: string; size?: number }>;
    title: string;
    subtitle?: string;
    onClick: () => void;
    onContextMenu?: (event: React.MouseEvent | React.TouchEvent) => void;
}

const PANEL_LABELS: Record<FocusPanelMode, string> = {
    recent: 'Recent Notes',
    bookmarks: 'Bookmarks',
};

export function FocusPanel(props: FocusPanelProps) {
    const { plugin, mode } = props;
    const search = useRef<HTMLInputElement>(null);
    const [searchVisible, setSearchVisible] = useState(false);
    useEffect(() => { const toggle = () => setSearchVisible(value => !value); window.addEventListener(FOCUS_SEARCH,toggle);return () => window.removeEventListener(FOCUS_SEARCH,toggle); }, []);
    useEffect(() => { if(searchVisible) search.current?.focus(); }, [searchVisible]);
    const [query, setQuery] = useState<string>('');
    const [bookmarkStack, setBookmarkStack] = useState<BookmarkLevel[]>([]);
    const [_view, setView] = useRecoilState(recoilState.view);
    const [_activeFolderPath, setActiveFolderPath] = useRecoilState(recoilState.activeFolderPath);
    const [_activeOZFile, setActiveOzFile] = useRecoilState(recoilState.activeOZFile);

    const switchMode = (nextMode: FocusPanelMode) => {
        setQuery('');
        setBookmarkStack([]);
        setView(nextMode);
    };

    const closePanel = () => {
        setView('folder');
        setActiveFolderPath('');
    };

    const openFilePath = async (path: string, subpath?: string) => {
        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice('File not found.');
            return;
        }

        await openDuoFile({file:FileTreeUtils.TFile2OZFile(file),app:plugin.app,newLeaf:plugin.settings.focusOpenInNewTab,subpath});
        setActiveOzFile(FileTreeUtils.TFile2OZFile(file));
    };

    const revealFolder = (folder: TFolder) => {
        setActiveFolderPath(folder.path);
        setView('file');
        window.dispatchEvent(new CustomEvent(eventTypes.revealFolder, { detail: { folder } }));
    };

    const openBookmark = async (bookmark: FocusBookmarkItem, bookmarksPlugin: CoreBookmarksPluginInstance) => {
        try {
            switch (bookmark.type) {
                case 'file':
                    await openFilePath(bookmark.path || '', bookmark.subpath);
                    break;
                case 'folder':
                    openFolderBookmark(bookmark);
                    break;
                case 'search':
                    await openSearchBookmark(bookmark, bookmarksPlugin);
                    break;
                case 'url':
                    openUrlBookmark(bookmark);
                    break;
                case 'graph':
                    await bookmarksPlugin.openBookmark(bookmark, plugin.settings.focusOpenInNewTab ? 'tab' : false, { focus: true });
                    break;
                case 'group':
                    return;
            }
        } catch (error) {
            new Notice(`Could not open bookmark: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const openFolderBookmark = (bookmark: FocusBookmarkItem) => {
        const folder = plugin.app.vault.getAbstractFileByPath(bookmark.path || '');

        if (folder instanceof TFolder) {
            revealFolder(folder);
            return;
        }

        new Notice(`Folder not found: ${bookmark.path || 'Untitled'}`);
    };

    const openSearchBookmark = async (bookmark: FocusBookmarkItem, bookmarksPlugin: CoreBookmarksPluginInstance) => {
        const globalSearchPlugin = getEnabledPlugin<CoreGlobalSearchPluginInstance>(plugin, 'global-search');

        if (globalSearchPlugin) {
            globalSearchPlugin.openGlobalSearch(bookmark.query || '');
            return;
        }

        await bookmarksPlugin.openBookmark(bookmark, plugin.settings.focusOpenInNewTab ? 'tab' : false, { focus: true });
    };

    const openUrlBookmark = (bookmark: FocusBookmarkItem) => {
        if (!bookmark.url) {
            new Notice('Bookmarked URL is empty.');
            return;
        }

        const webViewerPlugin = getEnabledPlugin<CoreWebViewerPluginInstance>(plugin, 'webviewer');
        if (webViewerPlugin?.options?.openExternalURLs) {
            webViewerPlugin.openUrl(bookmark.url, plugin.settings.focusOpenInNewTab);
            return;
        }

        const opened = window.open(bookmark.url, '_blank');
        if (!opened) { new Notice('External browser opening was not confirmed. Copy the URL from the bookmark menu if needed.'); }
    };

    return (
        <div className="fjgduo-focus-panel">
            <div className="fjgduo-focus-panel__header fjgduo-tree-header-fixed">
                {!props.adaptive && <div className="fjgduo-flex-container">
                    <div className="fjgduo-nav-action-button" style={{ marginLeft: '0px' }}>
                        <Icons.IoIosCloseCircleOutline onClick={closePanel} size={19} aria-label="Close Focus Panel" />
                    </div>
                    <div className="fjgduo-focus-panel__tabs" role="tablist" aria-label="FJG File Focus Duo panels">
                        <button
                            type="button"
                            className={`fjgduo-focus-panel__tab${mode === 'recent' ? ' is-active' : ''}`}
                            onClick={() => switchMode('recent')}>
                            <Icons.FaHistory size={13} />
                            <span>Recent</span>
                        </button>
                        <button
                            type="button"
                            className={`fjgduo-focus-panel__tab${mode === 'bookmarks' ? ' is-active' : ''}`}
                            onClick={() => switchMode('bookmarks')}>
                            <Icons.FaRegBookmark size={13} />
                            <span>Bookmarks</span>
                        </button>
                    </div>
                </div>}
                {(!props.adaptive || searchVisible) && <div className="fjgduo-input-container">
                    <input
                        ref={search}
                        type="search"
                        placeholder={mode === 'bookmarks' ? 'Search bookmarks...' : 'Search recent notes...'}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>}
                <div className="fjgduo-file-tree-header">{PANEL_LABELS[mode]}</div>
            </div>

            <div className="fjgduo-focus-panel__body">
                {mode === 'bookmarks' ? (
                    <BookmarkPanel
                        plugin={plugin}
                        query={query}
                        bookmarkStack={bookmarkStack}
                        setBookmarkStack={setBookmarkStack}
                        openBookmark={openBookmark}
                    />
                ) : (
                    <RecentPanel plugin={plugin} query={query} openFilePath={openFilePath} />
                )}
            </div>
        </div>
    );
}

function RecentPanel(props: { plugin: FileTreeAlternativePlugin; query: string; openFilePath: (path: string) => Promise<void> }) {
    const { plugin, query, openFilePath } = props;
    const recentFiles = useMemo(() => getWorkspaceRecentFiles(plugin), [plugin, plugin.settings.excludedFolders, plugin.settings.focusMaxRecentFiles]);
    const visibleFiles = useMemo(() => filterRecentFiles(recentFiles, query), [recentFiles, query]);

    if (visibleFiles.length === 0) {
        return <EmptyState title="No recent notes yet" body="Open a few notes or canvases and they will appear here." />;
    }

    return (
        <div className="fjgduo-focus-panel__list">
            {visibleFiles.map((entry) => (
                <FocusRow
                    key={entry.path}
                    icon={entry.extension === 'canvas' ? Icons.FaProjectDiagram : Icons.BiFile}
                    title={entry.basename}
                    subtitle={plugin.settings.focusShowPaths ? entry.path : ''}
                    onContextMenu={event => showFocusContextMenu(plugin,{type:'file',path:entry.path},event)}
                    onClick={() => {
                        void openFilePath(entry.path);
                    }}
                />
            ))}
        </div>
    );
}

function BookmarkPanel(props: {
    plugin: FileTreeAlternativePlugin;
    query: string;
    bookmarkStack: BookmarkLevel[];
    setBookmarkStack: React.Dispatch<React.SetStateAction<BookmarkLevel[]>>;
    openBookmark: (bookmark: FocusBookmarkItem, bookmarksPlugin: CoreBookmarksPluginInstance) => Promise<void>;
}) {
    const { plugin, query, bookmarkStack, setBookmarkStack, openBookmark } = props;
    const bookmarksPlugin = getEnabledPlugin<CoreBookmarksPluginInstance>(plugin, 'bookmarks');

    if (!bookmarksPlugin) {
        return <EmptyState title="Bookmarks are unavailable" body="Enable Obsidian's core Bookmarks plugin to use this panel." />;
    }

    const level = bookmarkStack[bookmarkStack.length - 1];
    const items = level?.items || bookmarksPlugin.items || [];
    const visibleItems = items.filter((item) => bookmarkMatchesQuery(item, query));

    return (
        <div className="fjgduo-focus-panel__list">
            {level && (
                <button
                    type="button"
                    className="fjgduo-focus-panel__context-row"
                    onClick={() => {
                        setBookmarkStack(bookmarkStack.slice(0, -1));
                    }}>
                    <Icons.FaArrowCircleLeft size={14} />
                    <span>{level.title}</span>
                </button>
            )}
            {visibleItems.length === 0 ? (
                <EmptyState title="No bookmarks found" body="Try a different search." />
            ) : (
                visibleItems.map((item, index) => (
                    <FocusRow
                        key={`${getBookmarkDisplayName(plugin, item)}-${index}`}
                        icon={getBookmarkIcon(item)}
                        title={getBookmarkDisplayName(plugin, item)}
                        subtitle={getBookmarkSubtitle(plugin, item)}
                        onContextMenu={event => showFocusContextMenu(plugin,item,event)}
                        onClick={() => {
                            if (item.type === 'group') {
                                setBookmarkStack([...bookmarkStack, { title: getBookmarkDisplayName(plugin, item), items: item.items || [] }]);
                                return;
                            }
                            void openBookmark(item, bookmarksPlugin);
                        }}
                    />
                ))
            )}
        </div>
    );
}

function FocusRow(config: FocusRowConfig) {
    const Icon = config.icon;
    const press=useLongPress(event => config.onContextMenu?.(event),500);

    return (
        <button type="button" className="fjgduo-focus-panel__row" title={config.subtitle || config.title} onClick={config.onClick} onContextMenu={event=>{event.preventDefault();config.onContextMenu?.(event);}} {...press}>
            <span className="fjgduo-focus-panel__row-icon">
                <Icon size={13} />
            </span>
            <span className="fjgduo-focus-panel__row-text">
                <span className="fjgduo-focus-panel__row-title">{config.title || 'Untitled'}</span>
                {config.subtitle && <span className="fjgduo-focus-panel__row-subtitle">{config.subtitle}</span>}
            </span>
        </button>
    );
}

function EmptyState(props: { title: string; body: string }) {
    return (
        <div className="fjgduo-focus-panel__empty">
            <div className="fjgduo-focus-panel__empty-title">{props.title}</div>
            <div className="fjgduo-focus-panel__empty-body">{props.body}</div>
        </div>
    );
}

function getWorkspaceRecentFiles(plugin: FileTreeAlternativePlugin): FocusRecentFileEntry[] {
    const recentPaths = typeof plugin.app.workspace.getLastOpenFiles === 'function' ? plugin.app.workspace.getLastOpenFiles() : [];
    const excludedFolders = FileTreeUtils.settingListToArray(plugin.settings.excludedFolders);

    return recentPaths
        .map((path) => plugin.app.vault.getAbstractFileByPath(path))
        .filter((file): file is TFile => file instanceof TFile && ['md', 'canvas'].includes(file.extension.toLowerCase()))
        .filter((file) => !FileTreeUtils.isPathInExcludedFolder(file.path, excludedFolders))
        .map((file) => ({
            path: file.path,
            basename: file.basename,
            extension: file.extension.toLowerCase(),
            timestamp: file.stat.mtime,
        }))
        .slice(0, plugin.settings.focusMaxRecentFiles);
}

function filterRecentFiles(recentFiles: FocusRecentFileEntry[], query: string): FocusRecentFileEntry[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return recentFiles;
    return recentFiles.filter((entry) => `${entry.basename} ${entry.path}`.toLowerCase().includes(normalized));
}

function bookmarkMatchesQuery(item: FocusBookmarkItem, query: string): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return `${item.title || ''} ${item.path || ''} ${item.url || ''} ${item.query || ''}`.toLowerCase().includes(normalized);
}

function getBookmarkDisplayName(plugin: FileTreeAlternativePlugin, item: FocusBookmarkItem): string {
    if (item.title) return item.title;
    if (item.type === 'file' && item.path) {
        const file = plugin.app.vault.getAbstractFileByPath(item.path);
        return file instanceof TFile ? file.basename : item.path;
    }
    if (item.type === 'folder' && item.path) {
        return item.path.split('/').pop() || item.path;
    }
    if (item.type === 'search') return item.query || 'Search';
    if (item.type === 'url') return item.url || 'URL';
    if (item.type === 'graph') return 'Graph';
    return 'Group';
}

function getBookmarkSubtitle(plugin: FileTreeAlternativePlugin, item: FocusBookmarkItem): string {
    if (!plugin.settings.focusShowPaths) return '';
    if (item.type === 'file' || item.type === 'folder') return item.path || '';
    if (item.type === 'url') return item.url || '';
    if (item.type === 'search') return item.query || '';
    if (item.type === 'group') return `${item.items?.length || 0} items`;
    return '';
}

function getBookmarkIcon(item: FocusBookmarkItem): React.ComponentType<{ className?: string; size?: number }> {
    if (item.type === 'group' || item.type === 'folder') return Icons.BiFolder;
    if (item.type === 'search') return Icons.IoIosSearch;
    if (item.type === 'graph') return Icons.FaProjectDiagram;
    if (item.type === 'url') return Icons.FaGlobe;
    return Icons.BiFile;
}

function getEnabledPlugin<T>(plugin: FileTreeAlternativePlugin, pluginId: string): T | null {
    const internalPlugins = (plugin.app as AppWithInternalPlugins).internalPlugins;
    const enabledPlugin = internalPlugins?.getEnabledPluginById?.(pluginId);
    if (enabledPlugin) return enabledPlugin as T;

    const pluginRecord = internalPlugins?.plugins?.[pluginId];
    if (pluginRecord?._loaded && pluginRecord.instance) return pluginRecord.instance as T;

    return null;
}

function showFocusContextMenu(plugin:FileTreeAlternativePlugin,item:FocusBookmarkItem,event:React.MouseEvent|React.TouchEvent){
    const menu=new Menu();
    if(item.path){
        const entry=plugin.app.vault.getAbstractFileByPath(item.path);
        if(entry instanceof TFile) menu.addItem(action=>action.setTitle('Reveal in File Focus Duo').onClick(()=>window.dispatchEvent(new CustomEvent(eventTypes.revealFile,{detail:{file:entry}}))));
        if(entry instanceof TFolder) menu.addItem(action=>action.setTitle('Reveal folder in File Focus Duo').onClick(()=>window.dispatchEvent(new CustomEvent(eventTypes.revealFolder,{detail:{folder:entry}}))));
    }
    const value=item.url||item.path||item.query;
    if(value) menu.addItem(action=>action.setTitle(item.url?'Copy URL':'Copy path or query').onClick(async()=>{
        try{await navigator.clipboard.writeText(value);new Notice('Copied.');}catch(error){new Notice(`Clipboard unavailable: ${error instanceof Error ? error.message : String(error)}`);}
    }));
    if(!value){new Notice('Tap this bookmark to open it.');return;}
    menu.showAtPosition(menuPosition(event));
}
